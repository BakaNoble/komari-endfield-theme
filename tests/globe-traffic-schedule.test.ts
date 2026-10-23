import test from 'node:test';
import assert from 'node:assert/strict';
import { TrafficScheduler } from '../src/globeTrafficSchedule.ts';
import type { TrafficNode } from '../src/globeTraffic.ts';

const nodes: TrafficNode[] = [
  { id: 'hk-1', code: 'HK', coordinates: [114, 22], online: 1 },
  { id: 'hk-2', code: 'HK', coordinates: [114, 22], online: 1 },
  { id: 'jp-1', code: 'JP', coordinates: [138, 36], online: 1 },
  { id: 'sg-1', code: 'SG', coordinates: [103, 1], online: 1 },
  { id: 'offline', code: 'US', coordinates: [-97, 39], online: 0 },
];
const visible = new Set(['HK', 'JP', 'SG', 'US']);

test('concurrent traffic gives each actual host its own slot, including hosts in the same region', () => {
  const scheduler = new TrafficScheduler(() => 0);
  scheduler.configure({ enabled: true, concurrent: true, interval: 6, nodes });
  scheduler.advance(0, visible);
  assert.equal(scheduler.packets.length, 4);
  assert.deepEqual(new Set(scheduler.packets.map(packet => packet.owner)), new Set(['hk-1', 'hk-2', 'jp-1', 'sg-1']));
  for (const { route } of scheduler.packets) {
    assert.notEqual(route.sourceId, route.targetId);
    assert.notEqual(route.targetId, 'offline');
    assert.notEqual(route.from, route.to, 'co-located hosts do not draw a zero-length transmission');
  }
  scheduler.advance(4000, visible); assert.equal(scheduler.packets.length, 0);
  scheduler.advance(2000, visible);
  assert.equal(scheduler.packets.length, 4);
  assert.ok(scheduler.packets.every(packet => packet.started === 6000));
});

test('adding a host or refreshing data does not restart the other hosts clocks', () => {
  const scheduler = new TrafficScheduler(() => 0);
  const initial = [nodes[0], nodes[2]];
  scheduler.configure({ enabled: true, concurrent: true, interval: 6, nodes: initial });
  scheduler.advance(0, visible); scheduler.advance(1000, visible);
  const expanded = [...initial, nodes[3]];
  scheduler.configure({ enabled: true, concurrent: true, interval: 6, nodes: expanded });
  scheduler.advance(0, visible);
  assert.equal(scheduler.packets.find(packet => packet.owner === 'sg-1')!.started, 1000);
  assert.equal(scheduler.packets.find(packet => packet.owner === 'hk-1')!.started, 0);
  scheduler.configure({ enabled: true, concurrent: true, interval: 6, nodes: [...expanded] });
  scheduler.advance(5000, visible);
  assert.deepEqual(new Set(scheduler.packets.map(packet => packet.owner)), new Set(['hk-1', 'jp-1']));
  scheduler.advance(1000, visible);
  assert.equal(scheduler.packets.find(packet => packet.owner === 'sg-1')!.started, 7000);
});

test('changing between concurrent and serial modes clears the previous emission slots', () => {
  const scheduler = new TrafficScheduler(() => 0);
  scheduler.configure({ enabled: true, concurrent: true, interval: 6, nodes });
  scheduler.advance(0, visible); assert.equal(scheduler.packets.length, 4);
  scheduler.configure({ enabled: true, concurrent: false, interval: 6, nodes });
  assert.equal(scheduler.packets.length, 0);
  scheduler.advance(0, visible); assert.equal(scheduler.packets.length, 1);
  assert.equal(scheduler.packets[0].owner, 'global');
  for (let i = 0; i < 500; i++) {
    scheduler.advance(50, visible); assert.ok(scheduler.packets.length <= 1);
  }
});

test('offline endpoints, hidden regions and disabling effects stop their transmissions', () => {
  const scheduler = new TrafficScheduler(() => 0);
  scheduler.configure({ enabled: true, concurrent: true, interval: 6, nodes });
  scheduler.advance(0, new Set(['HK'])); assert.equal(scheduler.packets.length, 0);
  scheduler.advance(0, visible); assert.equal(scheduler.packets.length, 4);
  const remaining = nodes.filter(node => node.id !== 'hk-1');
  scheduler.configure({ enabled: true, concurrent: true, interval: 6, nodes: remaining });
  assert.ok(scheduler.packets.every(packet => packet.route.sourceId !== 'hk-1' && packet.route.targetId !== 'hk-1'));
  scheduler.configure({ enabled: false, concurrent: true, interval: 6, nodes: remaining });
  scheduler.advance(10000, visible);
  assert.equal(scheduler.packets.length, 0); assert.equal(scheduler.active, false);
});

test('dense installations keep simultaneous emissions bounded', () => {
  const scheduler = new TrafficScheduler(() => 0);
  const many = Array.from({ length: 100 }, (_, i) => ({ ...nodes[i % 4], id: `node-${i}` }));
  scheduler.configure({ enabled: true, concurrent: true, interval: 2, nodes: many });
  scheduler.advance(0, visible); assert.equal(scheduler.packets.length, 12);
  for (let i = 0; i < 100; i++) {
    scheduler.advance(50, visible); assert.ok(scheduler.packets.length <= 12);
  }
});
