import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceGlobeLongitude, projectGlobe, locateRegions, wrapLongitude, GLOBE_TILT, unrollGlobeDrag } from '../src/globeModel.ts';
import { normalizeNodes, normalizeStatuses } from '../src/model.ts';

test('orthographic globe projection correctly hides the far hemisphere at any camera angle', () => {
  for (const [lon, lat] of [[0, 0], [114.17, 22.32], [-97.48, 39.54], [179, -70]]) {
    const center = projectGlobe(lon, lat, lon, lat), back = projectGlobe(lon + 180, -lat, lon, lat);
    assert.ok(Math.abs(center.x) < 1e-10 && Math.abs(center.y) < 1e-10);
    assert.ok(Math.abs(center.z - 1) < 1e-10);
    assert.ok(back.z < -.999);
  }
  const east = projectGlobe(90, 0, 0, 0), north = projectGlobe(0, 90, 0, 0);
  assert.ok(east.x > .999 && Math.abs(east.y) < 1e-10);
  assert.ok(north.y > .999 && Math.abs(north.x) < 1e-10);
});

test('region aggregation keeps unknown reports distinct and counts unmappable nodes without guessing positions', () => {
  const nodes = normalizeNodes([
    { uuid: 'a', region: 'HK' }, { uuid: 'b', region: '🇭🇰' }, { uuid: 'c', region: 'hk' },
    { uuid: 'd', region: '自定义' }, { uuid: 'e', region: 'ZZ' }, { uuid: 'f', region: '' },
  ]);
  const statuses = normalizeStatuses({ a: { online: true }, b: { online: false } });
  const result = locateRegions(nodes, statuses, { HK: [114.17, 22.32] });
  assert.equal(result.unlocated, 3);
  assert.deepEqual(result.regions, [{ code: 'HK', coordinates: [114.17, 22.32], total: 3, online: 1, pending: 1 }]);
  assert.deepEqual(locateRegions([], {}, {}), { regions: [], unlocated: 0 });
});

test('inclining the planet preserves depth and projected distances', () => {
  const north = projectGlobe(0, 60, 0, 0, GLOBE_TILT);
  assert.ok(north.x > 0 && north.y > 0);
  for (const [lon, lat] of [[0, 0], [114, 22], [-90, -45], [179, 65]]) {
    const upright = projectGlobe(lon, lat, 110, 20), tilted = projectGlobe(lon, lat, 110, 20, GLOBE_TILT);
    assert.equal(tilted.z, upright.z);
    assert.ok(Math.abs(Math.hypot(tilted.x, tilted.y) - Math.hypot(upright.x, upright.y)) < 1e-10);
  }
});

test('automatic rotation moves the visible surface from bottom right toward top left, as requested', () => {
  for (const [lon, lat] of [[110, 20], [0, 0], [-97, 40], [179.9, -45]]) {
    const camera = advanceGlobeLongitude(lon, 60);
    const start = projectGlobe(lon, lat, lon, lat, GLOBE_TILT), next = projectGlobe(lon, lat, camera, lat, GLOBE_TILT);
    assert.ok(next.x < start.x, 'surface moves left');
    assert.ok(-next.y < -start.y, 'surface moves up in screen coordinates');
  }
});

test('dragging follows screen direction after converting into the inclined axes', () => {
  const angle = GLOBE_TILT * Math.PI / 180;
  for (const [dx, dy] of [[100, 0], [0, 80], [-120, 30], [60, -50]]) {
    const local = unrollGlobeDrag(dx, dy);
    assert.ok(Math.abs(local.x * Math.cos(angle) + local.y * Math.sin(angle) - dx) < 1e-10);
    assert.ok(Math.abs(-local.x * Math.sin(angle) + local.y * Math.cos(angle) - dy) < 1e-10);
  }
});

test('longitude wraps continuously across the date line', () => {
  assert.equal(wrapLongitude(185), -175); assert.equal(wrapLongitude(-185), 175);
  assert.equal(wrapLongitude(3600), 0);
});

test('bundled map coordinates stay finite and include the common host regions and Antarctica', async () => {
  const earth = JSON.parse(await readFile(new URL('../src/data/earth.json', import.meta.url), 'utf8'));
  assert.ok(earth.land.length > 4000);
  for (const point of [...earth.land, ...Object.values(earth.centers)] as number[][]) {
    assert.equal(point.length, 2);
    assert.ok(Number.isFinite(point[0]) && Math.abs(point[0]) <= 180);
    assert.ok(Number.isFinite(point[1]) && Math.abs(point[1]) <= 90);
  }
  for (const code of ['HK', 'JP', 'SG', 'DE', 'US', 'NL', 'AQ']) assert.ok(earth.centers[code]);
});
