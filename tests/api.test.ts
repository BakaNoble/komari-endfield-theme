import test from 'node:test';
import assert from 'node:assert/strict';
import { nodes, history, LiveSource, ApiError } from '../src/api.ts';
const originalFetch = globalThis.fetch;
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('node loading falls back to REST only for an unsupported RPC method', async () => {
  const paths: string[] = [];
  globalThis.fetch = (async path => {
    paths.push(String(path));
    return String(path) === '/api/rpc2' ? respond({ error: { code: -32601, message: 'unsupported' } }) : respond({ data: [{ uuid: 'a', name: 'fixture' }] });
  }) as typeof fetch;
  try { assert.equal((await nodes())[0].uuid, 'a'); assert.deepEqual(paths, ['/api/rpc2', '/api/nodes']); }
  finally { globalThis.fetch = originalFetch; }
});
test('private site errors do not trigger a fallback that could misrepresent the data', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return respond({ error: { code: -32040, message: 'login required' } }); }) as typeof fetch;
  try { await assert.rejects(nodes(), (e: unknown) => e instanceof ApiError && e.code === -32040); assert.equal(calls, 1); }
  finally { globalThis.fetch = originalFetch; }
});
test('history forwards the selected node, range and metric, and handles legacy REST records', async () => {
  let selected = '';
  globalThis.fetch = (async (path, options) => {
    if (String(path) === '/api/rpc2') { const body = JSON.parse(String(options?.body)); assert.equal(body.params.uuid, 'a/b'); assert.equal(body.params.hours, 24); return respond({}, 404); }
    selected = String(path); return respond({ data: { records: [{ time: '2026-10-19T00:00:00Z', cpu: 42 }] } });
  }) as typeof fetch;
  try { assert.equal((await history('a/b', 24))[0].cpu, 42); assert.match(selected, /uuid=a%2Fb&hours=24&load_type=all/); }
  finally { globalThis.fetch = originalFetch; }
});
test('legacy live socket sends get, normalizes the response and is reused', async () => {
  const originalSocket = globalThis.WebSocket;
  const originalWindow = (globalThis as any).window;
  let sockets = 0, requests = 0;
  class FixtureSocket {
    static OPEN = 1; readyState = 0;
    onopen?: () => void; onmessage?: (event: { data: string }) => void; onerror?: () => void; onclose?: () => void;
    constructor() { sockets++; queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    send(message: string) { requests++; assert.equal(message, 'get'); queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ status: 'success', data: { online: ['a'], data: { a: { cpu: { usage: 12 } } } } }) })); }
    close() { this.readyState = 3; this.onclose?.(); }
  }
  globalThis.fetch = (async () => respond({}, 404)) as typeof fetch;
  (globalThis as any).WebSocket = FixtureSocket;
  (globalThis as any).window = { setTimeout };
  (globalThis as any).location = { origin: 'http://fixture.local' };
  const source = new LiveSource();
  try { assert.equal((await source.read()).a.cpu, 12); assert.equal((await source.read()).a.online, true); assert.equal(sockets, 1); assert.equal(requests, 2); }
  finally { source.close(); globalThis.fetch = originalFetch; globalThis.WebSocket = originalSocket; (globalThis as any).window = originalWindow; delete (globalThis as any).location; }
});
