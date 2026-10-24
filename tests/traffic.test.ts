import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTrafficReport, summarizeTraffic, trafficSegments } from '../src/traffic.ts';

const start = Date.parse('2026-10-22T00:00:00Z'), end = start + 86400000;
const row = (metric_key: string, entity_id: string, values: (number | null)[]) => ({ metric_key, entity_id,
  points: values.map((value, i) => ({ time: new Date(start + i * 60000).toISOString(), value })) });
const report = (series: unknown[]) => normalizeTrafficReport({ series }, start, end);

test('traffic normalization preserves zero and gaps, removes duplicates and invalid/out-of-window records', () => {
  const source = row('traffic.up', 'a', [5, 0, null, 8]);
  source.points.reverse();
  source.points.push({ time: new Date(start).toISOString(), value: 10 }, { time: new Date(start - 1).toISOString(), value: 999 });
  source.points.push({ time: 'invalid', value: 50 });
  const data = report([source, { ...row('traffic.up', 'a', [999]), tags: { interface: 'eth0' } }, row('unknown', 'a', [999]), row('traffic.down', 'a', [-2, Infinity])]);
  assert.deepEqual(data.series[0].points.map(p => p.value), [10, 0, null, 8]);
  assert.deepEqual(data.series[1].points.map(p => p.value), [null, null]);
  assert.equal(data.series.length, 2);
  assert.throws(() => normalizeTrafficReport({ records: [] }, start, end), /无效/);
});

test('24h traffic sums byte increments, never speeds or lifetime counters, and ranks only allowed hosts', () => {
  const data = report([
    row('traffic.up', 'a', [10, 20, 30]), row('traffic.down', 'a', [1, 2, 3]),
    row('traffic.up', 'offline', [40, 50, null]), row('traffic.down', 'offline', [5, 6, null]),
    row('traffic.up', 'hidden', [99999]), row('net.total.up', 'a', [1000000, 1000020, 1000050]),
    row('net.out.rate', 'a', [100, 200, null]), row('net.out.rate', 'offline', [30, 40, null]),
  ]);
  const summary = summarizeTraffic(data, ['a', 'offline']);
  assert.equal(summary.totalUp, 150); assert.equal(summary.totalDown, 17);
  assert.deepEqual(summary.ranking.map(r => [r.uuid, r.total]), [['offline', 101], ['a', 66]]);
  assert.deepEqual(summary.points.map(p => p.upRate), [130, 240, null]);
  assert.deepEqual(summary.points.map(p => p.upCumulative), [50, 120, 150]);
});

test('counter gaps, resets and rebound baselines do not introduce false traffic spikes', () => {
  const data = report([
    row('net.total.up', 'a', [1000, 1010, null, 5000, 5010, 5, 8, 18]),
    row('traffic.up', 'a', [0, 10, null, 3990, 10, 5, 3, 10]),
    row('net.total.down', 'a', [10000, 9999, 10010, 10020]),
    row('traffic.down', 'a', [0, 9999, 11, 10]),
  ]);
  const summary = summarizeTraffic(data, ['a']);
  assert.equal(summary.totalUp, 33); assert.equal(summary.totalDown, 10);
  assert.equal(summary.points[3].upCumulative, null);
  assert.equal(summary.points[5].upCumulative, null);
});

test('absent flow data stays unknown, while observed zero remains a real ranked zero', () => {
  const empty = summarizeTraffic(report([row('net.in.rate', 'a', [10, 20])]), ['a']);
  assert.equal(empty.totalDown, null); assert.deepEqual(empty.ranking, []);
  const zero = summarizeTraffic(report([row('traffic.up', 'a', [0, 0]), row('traffic.down', 'a', [null, null])]), ['a']);
  assert.equal(zero.totalUp, 0); assert.equal(zero.totalDown, null);
  assert.equal(zero.ranking[0].total, 0); assert.equal(zero.ranking[0].down, null);
});

test('traffic paths use real timestamps and break at missing samples instead of connecting across outages', () => {
  const summary = summarizeTraffic(report([row('traffic.up', 'a', [0, 10, null, 20])]), ['a']);
  const segments = trafficSegments(summary.points, 'upCumulative', start, start + 10 * 60000, 100, 100, 100);
  assert.deepEqual(segments.map(s => s.length), [2, 1]);
  assert.equal(segments[0][1].x, 10); assert.equal(segments[1][0].x, 30);
});
