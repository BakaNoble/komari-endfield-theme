import test from 'node:test';
import assert from 'node:assert/strict';
import { pickTrafficRoute, resolveTrafficInterval, trafficArc } from '../src/globeTraffic.ts';
import type { GlobeRegion } from '../src/globeModel.ts';

test('traffic interval accepts saved values and bounds invalid or extreme configuration', () => {
  for (const value of [undefined, null, '', ' ', 'invalid', Infinity, NaN, {}, true]) assert.equal(resolveTrafficInterval(value), 6);
  assert.equal(resolveTrafficInterval('12'), 12);
  assert.equal(resolveTrafficInterval(8.6), 9);
  assert.equal(resolveTrafficInterval(-5), 2);
  assert.equal(resolveTrafficInterval(999), 30);
});

test('traffic arcs follow the shortest path across the date line and meet their endpoints', () => {
  const points = trafficArc([170, 10], [-170, 10]);
  assert.deepEqual(points[0], { coordinates: [170, 10], elevation: 1 });
  assert.deepEqual(points.at(-1), { coordinates: [-170, 10], elevation: 1 });
  const middle = points[Math.floor(points.length / 2)];
  assert.ok(Math.abs(middle.coordinates[0]) > 179.99, 'crosses the date line instead of going through Greenwich');
  assert.ok(middle.elevation > 1 && middle.elevation < 1.22);
  for (const point of trafficArc([0, 0], [180, 0])) {
    assert.ok(point.coordinates.every(Number.isFinite));
    assert.ok(Number.isFinite(point.elevation));
  }
});

test('each transmission chooses a random online target and avoids repeating a pair when possible', () => {
  const regions: GlobeRegion[] = [
    { code: 'A', online: 1, total: 1, pending: 0, coordinates: [10, 10] },
    { code: 'B', online: 1, total: 1, pending: 0, coordinates: [20, 20] },
    { code: 'C', online: 1, total: 1, pending: 0, coordinates: [150, -10] },
    { code: 'D', online: 0, total: 1, pending: 0, coordinates: [30, 10] },
  ];
  const first = pickTrafficRoute(regions, () => 0)!;
  assert.equal(first.from, 'A'); assert.equal(first.to, 'B');
  const repeated = pickTrafficRoute(regions, () => 0, first.key)!;
  assert.equal(repeated.from, 'A'); assert.equal(repeated.to, 'C', 'can choose a distant target, not just its nearest neighbor');
  const other = pickTrafficRoute(regions, () => .99)!;
  assert.equal(other.from, 'C'); assert.equal(other.to, 'B');
  assert.deepEqual(pickTrafficRoute([...regions].reverse(), () => 0), first);
  assert.equal(pickTrafficRoute(regions.slice(3)), null);
  assert.equal(pickTrafficRoute([
    { code: 'A', online: 1, total: 1, pending: 0, coordinates: [10, 10] },
    { code: 'B', online: 1, total: 1, pending: 0, coordinates: [10, 10] },
  ]), null);
  assert.notEqual(pickTrafficRoute(regions.slice(0, 2), () => 0, first.key), null, 'two nodes can continue exchanging traffic');
});
