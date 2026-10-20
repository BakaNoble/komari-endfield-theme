import test from 'node:test';
import assert from 'node:assert/strict';
import { pingChart } from '../src/pingChart.ts';
import { normalizePingReport, pingSummary } from '../src/ping.ts';

const point = (task_id: number, value: number, seconds: number) => ({ client: 'host', task_id, value, time: new Date(Date.UTC(2026, 9, 20, 0, 0, seconds)).toISOString() });
const summaries = (records: ReturnType<typeof point>[]) => {
  const report = normalizePingReport({ records });
  return [1, 2].map(id => pingSummary(report, 'host', id));
};
test('comparison chart aligns different targets to one actual time axis and latency scale', () => {
  const chart = pingChart(summaries([point(1, 100, 0), point(1, 200, 60), point(2, 100, 30)]));
  assert.equal(chart.series[0][0][0].x, 0); assert.equal(chart.series[0][0][1].x, 600);
  assert.equal(chart.series[1][0][0].x, 300);
  assert.equal(chart.series[0][0][0].y, chart.series[1][0][0].y);
  assert.ok(chart.series[0][0][1].y < chart.series[1][0][0].y);
});
test('comparison chart breaks timeout gaps without plotting failures as zero or joining unrelated targets', () => {
  const chart = pingChart(summaries([point(1, 10, 0), point(1, -1, 30), point(1, 20, 60), point(2, -1, 0)]));
  assert.equal(chart.valid, 2); assert.deepEqual(chart.series.map(s => s.map(segment => segment.length)), [[1, 1], []]);
  assert.equal(chart.series[0][1][0].x, 600);
});
test('comparison chart distinguishes zero latency, all timeouts and absent records with finite geometry', () => {
  const empty = pingChart(summaries([]));
  assert.equal(empty.valid, 0); assert.equal(empty.start, null); assert.equal(empty.end, null);
  const zero = pingChart(summaries([point(1, 0, 0)]));
  assert.equal(zero.valid, 1); assert.deepEqual(zero.series[0][0][0], { x: 300, y: 150 });
  const timeout = pingChart(summaries([point(1, -1, 0)]));
  assert.equal(timeout.valid, 0); assert.notEqual(timeout.start, null); assert.deepEqual(timeout.series, [[], []]);
});
