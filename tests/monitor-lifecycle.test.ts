import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as ping from '../src/ping.ts';

// Deterministic effect/timer harness: exercise the actual hook source with delayed APIs.
function mount(file: string, exportName: string, api: any, args: any[]) {
  const slots: any[] = [], effects: Function[] = [], timers = new Map<number, Function>();
  let cursor = 0, dirty = true, timerId = 0, value: any;
  const same = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial: any) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (next: any) => {
        const v = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(v, slots[i].value)) { slots[i].value = v; dirty = true; }
      }];
    },
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn: Function, deps: any[]) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn: Function, deps: any[]) { return react.useMemo(() => fn, deps); },
    useEffect(fn: Function, deps: any[]) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i]; slots[i] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  const listeners = new Set<Function>();
  const document = { hidden: false, addEventListener: (_: string, fn: Function) => listeners.add(fn), removeEventListener: (_: string, fn: Function) => listeners.delete(fn) };
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(new URL(`../src/${file}.ts`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => name === 'react' ? react : name === './api' ? api : name === './ping' ? ping : {},
    document, location: { search: '' }, URLSearchParams, AbortController, Date,
    setTimeout: (fn: Function) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id),
    setInterval: () => 0, clearInterval() {},
  });
  return {
    get value() { return value; }, timers, document,
    async flush() {
      for (let i = 0; i < 20; i++) {
        if (dirty) { dirty = false; cursor = 0; value = exports[exportName](...args); effects.splice(0).forEach(fn => fn()); }
        await Promise.resolve();
      }
    },
    visibility() { listeners.forEach(fn => fn()); },
    destroy() { slots.forEach(s => s?.cleanup?.()); },
  };
}
const task = (id: number) => ({ id, name: `target ${id}`, clients: ['a'], interval: 60, weight: 0, type: 'ICMP' });

test('paused manual refresh waits for newly discovered tasks and fetches their records', async () => {
  let resolveTasks: (value: any) => void = () => {};
  const reads: number[][] = [];
  const hook = mount('usePingMonitor', 'usePingMonitor', {
    pingTasks: () => new Promise(resolve => { resolveTasks = resolve; }),
    pingReports: async (ids: number[]) => { reads.push(ids); return { reports: Object.fromEntries(ids.map(id => [id, ping.emptyPingReport()])), errors: {} }; },
  }, [true, false, true, [{ uuid: 'a' }]]);
  try {
    await hook.flush(); resolveTasks([task(1)]); await hook.flush();
    assert.equal(reads.length, 0);
    hook.value.refresh(); await hook.flush();
    resolveTasks([task(1), task(2)]); await hook.flush();
    assert.ok(reads.some(ids => ids.join(',') === '1,2'));
    assert.equal(hook.value.loading, false);
    assert.equal(hook.timers.size, 0);
  } finally { hook.destroy(); }
});

test('total ping refresh failure keeps the timestamp of the last successful load', async () => {
  let failed = false;
  const hook = mount('usePingMonitor', 'usePingMonitor', {
    pingTasks: async () => [task(1)],
    pingReports: async () => failed ? { reports: {}, errors: { 1: 'unavailable' } } : { reports: { 1: ping.emptyPingReport() }, errors: {} },
  }, [true, false, false, [{ uuid: 'a' }]]);
  try {
    await hook.flush(); const previous = hook.value.updated;
    assert.ok(previous); failed = true; hook.value.refresh(); await hook.flush();
    assert.equal(hook.value.updated, previous); assert.match(hook.value.error, /unavailable/);
  } finally { hook.destroy(); }
});

test('visibility changes during a live request do not create duplicate polling timers', async () => {
  let resolveLive: (value: any) => void = () => {};
  const hook = mount('useMonitor', 'useMonitor', {
    publicInfo: async () => ({}), nodes: async () => [{ uuid: 'a' }],
    LiveSource: class { read() { return new Promise(resolve => { resolveLive = resolve; }); } close() {} },
  }, []);
  try {
    await hook.flush(); hook.visibility(); await hook.flush();
    resolveLive({}); await hook.flush();
    assert.equal(hook.timers.size, 1);
  } finally { hook.destroy(); }
  assert.equal(hook.timers.size, 0);
});
