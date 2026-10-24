import test from 'node:test';
import assert from 'node:assert/strict';
import { nodes, history, pingTasks, pingReport, pingReports, trafficReport, LiveSource, ApiError } from '../src/api.ts';
const originalFetch = globalThis.fetch;
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('24h traffic requests one bounded multi-host metric query with byte sums and last counter baselines', async () => {
  let calls = 0;
  const end = Date.parse('2026-10-23T12:00:00Z');
  globalThis.fetch = (async (path, options) => {
    calls++; assert.equal(path, '/api/rpc2');
    const body = JSON.parse(String(options?.body)), params = body.params;
    assert.equal(body.method, 'public:queryMetrics');
    assert.deepEqual(params.entity_ids, ['a', 'b']); assert.equal(params.max_points, 120);
    assert.equal(Date.parse(params.end) - Date.parse(params.start), 86400000);
    assert.equal(params.aggregation_by_metric['traffic.up'], 'sum');
    assert.equal(params.aggregation_by_metric['traffic.down'], 'sum');
    assert.equal(params.aggregation_by_metric['net.total.up'], 'last');
    assert.equal(params.fill_empty, true);
    return respond({ result: { start: params.start, end: params.end, series: [] } });
  }) as typeof fetch;
  try { const result = await trafficReport(['a', 'b', 'a'], undefined, end); assert.equal(result.end, end); assert.equal(calls, 1); }
  finally { globalThis.fetch = originalFetch; }
});

test('unsupported, unauthorized and malformed traffic responses do not fall back to made-up consumption', async () => {
  try {
    for (const code of [-32601, -32040]) {
      let calls = 0; globalThis.fetch = (async () => { calls++; return respond({ error: { code, message: 'unavailable' } }); }) as typeof fetch;
      await assert.rejects(trafficReport(['a']), (e: unknown) => e instanceof ApiError && e.code === code);
      assert.equal(calls, 1);
    }
    globalThis.fetch = (async () => respond({ result: { records: [] } })) as typeof fetch;
    await assert.rejects(trafficReport(['a']), /无效/);
  } finally { globalThis.fetch = originalFetch; }
});

test('malformed JSON envelopes produce a controlled API error without fallback', async () => {
  try {
    for (const body of [null, [], 42, 'invalid']) {
      let calls = 0;
      globalThis.fetch = (async () => { calls++; return respond(body); }) as typeof fetch;
      await assert.rejects(nodes(), (e: unknown) => e instanceof ApiError && e.code === 502);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('closing history cancels an in-flight request without starting REST fallback', async () => {
  const controller = new AbortController(); let calls = 0;
  globalThis.fetch = (async (_path, options) => {
    calls++;
    return new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true }));
  }) as typeof fetch;
  try {
    const pending = history('a', 6, controller.signal);
    controller.abort();
    await assert.rejects(pending, (e: any) => e.name === 'AbortError');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

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

test('ping reads the selected task and window in two shared requests, with authoritative metric statistics', async () => {
  const methods: string[] = [], controller = new AbortController();
  globalThis.fetch = (async (_path, options) => {
    const body = JSON.parse(String(options?.body)); methods.push(body.method);
    assert.equal(body.params.task_id, 7); assert.equal(body.params.hours, 6); assert.ok(options?.signal);
    return body.method === 'common:getRecords' ? respond({ result: { records: [{ client: 'a', task_id: 7, time: '2026-10-20T00:00:00Z', value: -1 }] } }) : respond({ result: { stats: [{ entity_id: 'a', task_id: '7', total: 12, loss: 25, avg: 4 }] } });
  }) as typeof fetch;
  try { const result = await pingReport(7, 6, controller.signal); assert.equal(result.records[0].value, -1); assert.equal(result.metrics[0].loss, 25); assert.deepEqual(methods.sort(), ['common:getRecords', 'public:getPingMetricStats']); }
  finally { globalThis.fetch = originalFetch; }
});
test('multiple ping targets share bounded requests and one failing target does not erase successful targets', async () => {
  const seen: number[] = []; let active = 0, peak = 0;
  globalThis.fetch = (async (_path, options) => {
    const body = JSON.parse(String(options?.body)), task = body.params.task_id;
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 3)); active--;
    if (body.method === 'common:getRecords') seen.push(task);
    if (task === 2) return respond({ error: { code: -32051, message: 'target unavailable' } });
    return body.method === 'common:getRecords' ? respond({ result: { records: [{ client: 'a', task_id: task, time: '2026-10-20T00:00:00Z', value: task * 10 }] } }) : respond({ result: { stats: [] } });
  }) as typeof fetch;
  try {
    const result = await pingReports([1, 2, 3, 4, 4], 1);
    assert.deepEqual(seen.sort(), [1, 2, 3, 4]); assert.ok(peak <= 6);
    assert.deepEqual(Object.keys(result.reports).sort(), ['1', '3', '4']); assert.match(result.errors[2], /unavailable/);
    assert.equal(result.reports[3].records[0].task_id, 3); assert.equal(result.reports[3].records[0].value, 30);
  } finally { globalThis.fetch = originalFetch; }
});
test('aborting a multi-target load cancels outstanding reads without starting more targets', async () => {
  const controller = new AbortController(); let calls = 0;
  globalThis.fetch = (async (_path, options) => { calls++; return new Promise((_resolve, reject) => options!.signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })); }) as typeof fetch;
  try {
    const pending = pingReports([1, 2, 3, 4, 5], 1, controller.signal); controller.abort(new Error('cancelled by navigation'));
    await assert.rejects(pending, /cancelled/); assert.ok(calls <= 6);
  } finally { globalThis.fetch = originalFetch; }
});
test('ping task and history fall back to documented REST routes only for unsupported methods', async () => {
  const paths: string[] = [];
  globalThis.fetch = (async path => {
    paths.push(String(path));
    if (String(path) === '/api/rpc2') return respond({ error: { code: -32601, message: 'unsupported' } });
    return String(path) === '/api/task/ping' ? respond({ data: [{ id: 3, clients: ['a'] }] }) : respond({ data: { records: [] } });
  }) as typeof fetch;
  try { assert.equal((await pingTasks())[0].id, 3); assert.deepEqual((await pingReport(3, 1)).records, []); assert.ok(paths.includes('/api/task/ping')); assert.ok(paths.includes('/api/records/ping?task_id=3&hours=1')); }
  finally { globalThis.fetch = originalFetch; }
});
test('ping authorization errors and malformed records remain errors instead of being replaced by demo or fallback data', async () => {
  const paths: string[] = [];
  globalThis.fetch = (async path => { paths.push(String(path)); return respond({ error: { code: -32040, message: 'login required' } }); }) as typeof fetch;
  try {
    await assert.rejects(pingTasks(), (e: unknown) => e instanceof ApiError && e.code === -32040);
    await assert.rejects(pingReport(1, 1), (e: unknown) => e instanceof ApiError && e.code === -32040);
    assert.ok(paths.every(p => p === '/api/rpc2'));
    globalThis.fetch = (async () => respond({ result: { records: null } })) as typeof fetch;
    await assert.rejects(pingReport(1, 1), /格式/);
  } finally { globalThis.fetch = originalFetch; }
});
