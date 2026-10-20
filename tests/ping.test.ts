import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePingTasks, normalizePingReport, normalizePingMetrics, pingSummary, milliseconds, hostPingHealth } from '../src/ping.ts';

const point = (value: unknown, client = 'a', task_id = 1, seconds = 0) => ({ client, task_id, value, time: new Date(Date.UTC(2026, 9, 20, 0, 0, seconds)).toISOString() });
test('ping tasks keep explicit client assignments and backend order without assuming default_on applies to all nodes', () => {
  const tasks = normalizePingTasks([{ id: 7, weight: 2, clients: ['a'], type: 'tcp' }, { id: 2, weight: -1, default_on: true, clients: [] }, { id: 0 }, null]);
  assert.deepEqual(tasks.map(t => t.id), [2, 7]); assert.deepEqual(tasks[0].clients, []); assert.equal(tasks[1].type, 'TCP');
  assert.throws(() => normalizePingTasks({}), /格式/);
});
test('ping records preserve zero latency and timeout values, reject missing data and sort/deduplicate samples', () => {
  const r = normalizePingReport({ records: [point(-1, 'a', 1, 2), point(0), point(null), point(NaN), point('3'), point(0), { ...point(3), time: 'invalid' }] });
  assert.deepEqual(r.records.map(p => p.value), [0, -1]);
  const s = pingSummary(r, 'a', 1);
  assert.equal(s.avg, 0); assert.equal(s.min, 0); assert.equal(s.max, 0); assert.equal(s.loss, 50); assert.equal(s.latest?.value, -1); assert.equal(s.total, 2);
  assert.equal(milliseconds(0), '0.0 ms'); assert.equal(milliseconds(null), '—');
});
test('ping statistics never combine hosts or targets, and no records do not imply zero loss', () => {
  const report = normalizePingReport({ records: [point(10), point(1000, 'a', 2), point(2000, 'b'), point(-1, 'c')] });
  assert.equal(pingSummary(report, 'a', 1).avg, 10);
  const empty = pingSummary(report, 'none', 1); assert.equal(empty.avg, null); assert.equal(empty.loss, null); assert.equal(empty.latest, null);
  const failed = pingSummary(report, 'c', 1); assert.equal(failed.avg, null); assert.equal(failed.loss, 100); assert.equal(failed.latest?.value, -1);
  report.metrics = normalizePingMetrics({ stats: [{ entity_id: 'none', task_id: 1, total: 0, loss: 0, avg: 0 }] });
  assert.equal(pingSummary(report, 'none', 1).loss, null); assert.equal(pingSummary(report, 'none', 1).avg, null);
});
test('authoritative server statistics take precedence over chart samples and preserve zero-valued metrics', () => {
  const report = normalizePingReport({ records: [point(100)], basic_info: [{ client: 'a', loss: 12.5 }] });
  assert.equal(pingSummary(report, 'a', 1).loss, 12.5);
  report.metrics = normalizePingMetrics({ stats: [{ entity_id: 'a', task_id: '1', avg: 0, min: 0, max: 20, total: 100, loss: 5 }] });
  const s = pingSummary(report, 'a', 1);
  assert.equal(s.avg, 0); assert.equal(s.min, 0); assert.equal(s.total, 100); assert.equal(s.loss, 5); assert.equal(s.sampled, false);
  report.metrics = normalizePingMetrics({ stats: [{ entity_id: 'a', task_id: 1, avg: null, min: null, max: null, total: 10, loss: 100, loss_approximate: true }] });
  assert.equal(pingSummary(report, 'a', 1).avg, null); assert.equal(pingSummary(report, 'a', 1).sampled, true);
});
test('multiple test points remain separate and host quality uses the worst measured point, not a blended average', () => {
  const report = normalizePingReport({ records: [point(10), point(100, 'a', 2), point(-1, 'a', 2, 1)] });
  const one = pingSummary(report, 'a', 1), two = pingSummary(report, 'a', 2), missing = pingSummary(report, 'a', 3);
  assert.equal(one.avg, 10); assert.equal(one.loss, 0); assert.equal(two.avg, 100); assert.equal(two.loss, 50);
  assert.deepEqual(hostPingHealth([one, two, missing]), { tested: 2, latency: 100, loss: 50, timedOut: true });
  assert.deepEqual(hostPingHealth([missing]), { tested: 0, latency: null, loss: null, timedOut: false });
});
