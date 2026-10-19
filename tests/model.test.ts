import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatuses, normalizeNodes, normalizeHistory, percent, traffic, warning, bytes } from '../src/model.ts';

test('normalizes current RPC2 reports without losing zero readings or inflating offline status', () => {
  const result = normalizeStatuses({ a: { client: 'a', online: true, cpu: 0, ram: 0, disk: 12, net_in: 0, net_out: 20, net_total_out: 0, net_total_in: 123, connections: 0 }, b: { client: 'b', online: false, cpu: 92 } });
  assert.equal(result.a.cpu, 0); assert.equal(result.a.down, 0); assert.equal(result.a.totalUp, 0);
  assert.equal(result.a.totalDown, 123); assert.equal(result.a.tcp, 0); assert.equal(result.b.online, false);
  assert.equal(result.b.ram, null);
});
test('legacy WebSocket online list is authoritative even when the last report exists', () => {
  const s = normalizeStatuses({ online: ['a'], data: { a: { cpu: { usage: 30 }, ram: { used: 128 }, network: { up: 10, totalDown: 42 } }, b: { cpu: { usage: 99 } } } });
  assert.equal(s.a.online, true); assert.equal(s.b.online, false); assert.equal(s.a.ram, 128); assert.equal(s.a.totalDown, 42);
});
test('invalid and missing metrics stay unknown and never become healthy zeroes', () => {
  assert.equal(percent(null, 100), null); assert.equal(percent(1, 0), null);
  assert.equal(percent(150, 100, false), 150); assert.equal(percent(150, 100), 100);
  assert.equal(normalizeStatuses({ a: { cpu: '80', ram: null } }).a.cpu, null);
  assert.equal(bytes(undefined), '—'); assert.throws(() => normalizeStatuses(null));
});
test('traffic quotas respect all documented accounting methods', () => {
  const n = normalizeNodes([{ uuid: 'a', name: 'a', traffic_limit_type: 'sum' }])[0];
  const s = normalizeStatuses({ a: { online: true, net_total_up: 10, net_total_down: 20 } }).a;
  assert.equal(traffic(n, s), 30); assert.equal(traffic({ ...n, traffic_limit_type: 'max' }, s), 20);
  assert.equal(traffic({ ...n, traffic_limit_type: 'up' }, s), 10); assert.equal(traffic({ ...n, traffic_limit_type: 'min' }, s), 10);
});
test('high resource usage alerts apply only to online nodes', () => {
  const n = normalizeNodes([{ uuid: 'a', mem_total: 100, disk_total: 100 }])[0];
  const s = normalizeStatuses({ a: { online: true, cpu: 90, ram: 20 } }).a;
  assert.equal(warning(n, s, 85), true); assert.equal(warning(n, { ...s, online: false }, 85), false);
});
test('history is chronological, filters invalid dates and preserves missing points', () => {
  const records = normalizeHistory({ records: [{ time: '2026-10-19T02:00:00Z', cpu: 0 }, { time: '2026-10-19T01:00:00Z', cpu: null }, { time: 'invalid', cpu: 10 }] });
  assert.equal(records.length, 2); assert.equal(records[0].cpu, null); assert.equal(records[1].cpu, 0);
});
