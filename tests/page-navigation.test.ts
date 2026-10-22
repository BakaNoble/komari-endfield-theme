import test from 'node:test';
import assert from 'node:assert/strict';
import { createPageNavigator, pageFromRoute } from '../src/pageNavigation.ts';
import type { Page } from '../src/viewPreferences.ts';

function environment({ animate = true, reduced = false, hidden = false } = {}) {
  let page: Page = 'overview', route = '/overview';
  const root = { dataset: {} as Record<string, string> };
  const animations: { frames: Keyframe[]; options: KeyframeAnimationOptions; finish: () => void; cancelled: boolean }[] = [];
  const listeners = new Set<Function>(), mediaListeners = new Set<Function>();
  const media = { matches: reduced, addEventListener: (_: string, fn: Function) => mediaListeners.add(fn), removeEventListener: (_: string, fn: Function) => mediaListeners.delete(fn) };
  const content = { animate: animate ? (frames: Keyframe[], options: KeyframeAnimationOptions) => {
    let finish = () => {}, reject = (_e: Error) => {};
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    const entry = { frames, options, finish, cancelled: false }; animations.push(entry);
    return { finished, cancel: () => { entry.cancelled = true; reject(new Error('cancelled')); } };
  } : undefined };
  const doc = { documentElement: root, hidden, querySelector: () => content,
    addEventListener: (_: string, fn: Function) => listeners.add(fn), removeEventListener: (_: string, fn: Function) => listeners.delete(fn) };
  const mocks = { document: doc, matchMedia: () => media, getComputedStyle: () => ({ opacity: '1', transform: 'none' }) };
  const saved = Object.fromEntries(Object.keys(mocks).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(mocks)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const navigator = createPageNavigator({ current: () => page, commit: (nextRoute, nextPage) => { route = nextRoute; if (nextPage) page = nextPage; } });
  return {
    navigator, root, animations, media, doc,
    get page() { return page; }, get route() { return route; }, get listenerCount() { return listeners.size + mediaListeners.size; },
    motion() { mediaListeners.forEach(fn => fn()); }, visibility() { listeners.forEach(fn => fn()); },
    restore() {
      navigator.destroy();
      for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    },
  };
}

test('page routes are distinct from node details and unknown fragments', () => {
  assert.equal(pageFromRoute('/overview'), 'overview'); assert.equal(pageFromRoute('/nodes'), 'nodes');
  assert.equal(pageFromRoute('/network'), 'network'); assert.equal(pageFromRoute('/node/a'), null);
  assert.equal(pageFromRoute('/unknown'), null);
});

test('page transitions exit before committing and then enter along the navigation direction', async () => {
  const env = environment();
  try {
    env.navigator.navigate('/nodes');
    assert.equal(env.page, 'overview'); assert.equal(env.root.dataset.pageTransition, 'forward');
    assert.equal(env.animations[0].options.duration, 100);
    assert.equal(env.animations[0].frames[1].transform, 'translateX(-10px)');
    env.animations[0].finish(); await Promise.resolve();
    assert.equal(env.page, 'nodes'); assert.equal(env.animations[1].options.duration, 220);
    assert.equal(env.animations[1].frames[0].transform, 'translateX(14px)');
    env.animations[1].finish(); await Promise.resolve(); assert.equal(env.root.dataset.pageTransition, undefined);
    env.navigator.navigate('/overview'); assert.equal(env.root.dataset.pageTransition, 'backward');
    assert.equal(env.animations[2].frames[1].transform, 'translateX(10px)');
  } finally { env.restore(); }
});

test('rapid navigation ignores stale completions and commits only the latest choice', async () => {
  const env = environment();
  try {
    env.navigator.navigate('/nodes'); env.navigator.navigate('/network');
    assert.equal(env.animations[0].cancelled, true);
    env.animations[0].finish(); await Promise.resolve(); assert.equal(env.page, 'overview');
    assert.equal(env.root.dataset.pageTransition, 'forward');
    env.animations[1].finish(); await Promise.resolve(); assert.equal(env.page, 'network'); assert.equal(env.route, '/network');
    env.animations[2].finish(); await Promise.resolve(); assert.equal(env.root.dataset.pageTransition, undefined);
  } finally { env.restore(); }
});

test('returning to the current page cancels a pending navigation', async () => {
  const env = environment();
  try {
    env.navigator.navigate('/network'); env.navigator.navigate('/overview'); env.animations[0].finish(); await Promise.resolve();
    assert.equal(env.page, 'overview'); assert.equal(env.route, '/overview');
    assert.equal(env.animations.length, 1); assert.equal(env.root.dataset.pageTransition, undefined);
  } finally { env.restore(); }
});

test('a new navigation can interrupt entry without an old completion clearing its state', async () => {
  const env = environment();
  try {
    env.navigator.navigate('/nodes'); env.animations[0].finish(); await Promise.resolve();
    env.navigator.navigate('/network'); assert.equal(env.animations[1].cancelled, true);
    env.animations[1].finish(); await Promise.resolve(); assert.equal(env.root.dataset.pageTransition, 'forward');
    env.animations[2].finish(); await Promise.resolve(); assert.equal(env.page, 'network');
  } finally { env.restore(); }
});

test('opening and closing node details preserves the page without page animation', () => {
  const env = environment();
  try {
    env.navigator.navigate('/node/a'); assert.equal(env.page, 'overview'); assert.equal(env.route, '/node/a');
    env.navigator.navigate('/overview'); assert.equal(env.animations.length, 0); assert.equal(env.route, '/overview');
  } finally { env.restore(); }
});

test('reduced motion, hidden tabs and browsers without animations commit immediately', () => {
  for (const options of [{ reduced: true }, { hidden: true }, { animate: false }]) {
    const env = environment(options);
    try {
      env.navigator.navigate('/network'); assert.equal(env.page, 'network'); assert.equal(env.animations.length, 0);
      assert.equal(env.root.dataset.pageTransition, undefined);
    } finally { env.restore(); }
  }
});

test('enabling reduced motion mid-exit finishes the pending navigation immediately', async () => {
  const env = environment();
  try {
    env.navigator.navigate('/nodes'); env.media.matches = true; env.motion();
    assert.equal(env.page, 'nodes'); assert.equal(env.animations[0].cancelled, true);
    env.animations[0].finish(); await Promise.resolve(); assert.equal(env.animations.length, 1);
    assert.equal(env.root.dataset.pageTransition, undefined);
  } finally { env.restore(); }
});

test('hiding a tab during exit does not leave an uncommitted route or faded page', () => {
  const env = environment();
  try {
    env.navigator.navigate('/network'); env.doc.hidden = true; env.visibility();
    assert.equal(env.page, 'network'); assert.equal(env.animations[0].cancelled, true);
    assert.equal(env.root.dataset.pageTransition, undefined);
  } finally { env.restore(); }
});

test('unmount cancels animation, removes listeners and prevents late commits', async () => {
  const env = environment();
  try {
    env.navigator.navigate('/nodes'); env.navigator.destroy(); env.animations[0].finish(); await Promise.resolve();
    assert.equal(env.page, 'overview'); assert.equal(env.animations[0].cancelled, true);
    assert.equal(env.root.dataset.pageTransition, undefined); assert.equal(env.listenerCount, 0);
  } finally { env.restore(); }
});
