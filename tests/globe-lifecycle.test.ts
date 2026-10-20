import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobe } from '../src/globeCanvas.ts';

function environment(reducedMotion = false) {
  const listeners = () => {
    const entries = new Map<string, Set<Function>>();
    return {
      addEventListener(type: string, fn: Function) { if (!entries.has(type)) entries.set(type, new Set()); entries.get(type)!.add(fn); },
      removeEventListener(type: string, fn: Function) { entries.get(type)?.delete(fn); },
      fire(type: string, event = {}) { entries.get(type)?.forEach(fn => fn(event)); },
      count() { return [...entries.values()].reduce((sum, set) => sum + set.size, 0); },
    };
  };
  const documentMock = { ...listeners(), hidden: false };
  const media = { ...listeners(), matches: reducedMotion };
  const frames = new Map<number, FrameRequestCallback>();
  const observers: { disconnected: boolean; fire: (visible: boolean) => void }[] = [];
  let next = 0;
  const globals = {
    document: documentMock, devicePixelRatio: 1, matchMedia: () => media,
    requestAnimationFrame(fn: FrameRequestCallback) { frames.set(++next, fn); return next; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    ResizeObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class {
      disconnected = false;
      callback: Function;
      constructor(callback: Function) { this.callback = callback; observers.push(this); }
      observe() {} disconnect() { this.disconnected = true; }
      fire(visible: boolean) { this.callback([{ isIntersecting: visible }]); }
    },
  };
  const saved = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const canvas = {
    ...listeners(), width: 0, height: 0, dataset: {} as Record<string, string>, title: '',
    getContext: () => new Proxy({}, { get: () => () => {} }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 270 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true,
  };
  return {
    documentMock, media, frames, observers, canvas,
    step(time: number) { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn(time)); },
    restore() { for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } },
  };
}

test('globe stops rendering when hidden or outside the viewport and removes work on unmount', () => {
  const env = environment();
  try {
    const globe = createGlobe(env.canvas as any, [], { onSelect() {}, onRunning() {}, onReduced() {} })!;
    env.step(100); env.step(200);
    assert.equal(env.frames.size, 1);
    env.documentMock.hidden = true; env.documentMock.fire('visibilitychange');
    assert.equal(env.frames.size, 0);
    env.documentMock.hidden = false; env.documentMock.fire('visibilitychange');
    assert.equal(env.frames.size, 1);
    env.observers[0].fire(false); assert.equal(env.frames.size, 0);
    env.observers[0].fire(true); assert.equal(env.frames.size, 1);
    globe.destroy();
    assert.equal(env.frames.size, 0); assert.equal(env.canvas.count(), 0);
    assert.equal(env.documentMock.count(), 0); assert.equal(env.media.count(), 0); assert.ok(env.observers[0].disconnected);
    globe.update({ regions: [], selected: 'all', dark: true, accent: 'ice' });
    assert.equal(env.frames.size, 0);
  } finally { env.restore(); }
});

test('reduced motion disables automatic rotation while manual controls still redraw once', () => {
  const env = environment(true), running: boolean[] = [];
  try {
    const globe = createGlobe(env.canvas as any, [], { onSelect() {}, onRunning(value) { running.push(value); }, onReduced() {} })!;
    env.step(100); assert.equal(env.frames.size, 0); assert.equal(running.at(-1), false);
    globe.toggle(); env.step(200); assert.equal(env.frames.size, 0); assert.equal(running.at(-1), false);
    globe.zoom(.15); assert.equal(env.frames.size, 1); env.step(300); assert.equal(env.frames.size, 0);
    assert.equal(env.canvas.dataset.zoom, '1.15');
    globe.focus([-97.48, 39.54]); env.step(350);
    assert.equal(env.canvas.dataset.longitude, '-97.48'); assert.equal(env.canvas.dataset.latitude, '20.00');
    assert.equal(env.canvas.dataset.animating, 'false'); assert.equal(env.frames.size, 0);
    env.media.matches = false; env.media.fire('change'); globe.toggle(); env.step(400);
    assert.equal(env.frames.size, 1); assert.equal(running.at(-1), true);
    env.media.matches = true; env.media.fire('change'); env.step(500);
    assert.equal(env.frames.size, 0); assert.equal(running.at(-1), false);
    globe.destroy();
  } finally { env.restore(); }
});

test('dragging, keyboard and region focus keep the X angle fixed', () => {
  const env = environment();
  try {
    const globe = createGlobe(env.canvas as any, [], { onSelect() {}, onRunning() {}, onReduced() {} })!;
    globe.toggle(); env.step(100);
    env.canvas.fire('pointerdown', { button: 0, pointerId: 1, clientX: 80, clientY: 90 });
    env.canvas.fire('pointermove', { pointerId: 1, clientX: 130, clientY: 210 });
    env.canvas.fire('pointerup', { pointerId: 1 }); env.step(200);
    const dragged = env.canvas.dataset.longitude;
    assert.notEqual(dragged, '110.00');
    assert.equal(env.canvas.dataset.latitude, '20.00'); assert.equal(env.canvas.dataset.tilt, '-36');
    for (const key of ['ArrowUp', 'ArrowDown']) env.canvas.fire('keydown', { key, preventDefault() {} });
    env.step(300); assert.equal(env.canvas.dataset.longitude, dragged); assert.equal(env.canvas.dataset.latitude, '20.00');
    env.canvas.fire('keydown', { key: 'ArrowLeft', preventDefault() {} }); env.step(400);
    assert.notEqual(env.canvas.dataset.longitude, dragged); assert.equal(env.canvas.dataset.latitude, '20.00');
    globe.focus([0, -80]);
    for (let time = 500; time <= 2200; time += 50) env.step(time);
    assert.equal(env.canvas.dataset.longitude, '0.00'); assert.equal(env.canvas.dataset.latitude, '20.00');
    globe.destroy();
  } finally { env.restore(); }
});

test('region focus eases along the shortest Y arc, retargets without jumping and stops at its destination', () => {
  const env = environment(), running: boolean[] = [];
  try {
    const globe = createGlobe(env.canvas as any, [], { onSelect() {}, onRunning(value) { running.push(value); }, onReduced() {} })!;
    env.step(100); globe.focus([-97.48, 39.54]); env.step(200);
    assert.equal(env.canvas.dataset.longitude, '110.00'); assert.equal(env.canvas.dataset.animating, 'true');
    env.step(280);
    const mid = Number(env.canvas.dataset.longitude);
    assert.ok(mid > 110 && mid < 180, 'takes the short route east across the date line');
    globe.focus([114.17, 22.32]); env.step(300);
    assert.equal(Number(env.canvas.dataset.longitude), mid, 'new destination starts at the visible angle');
    for (let time = 350; time <= 1800; time += 50) env.step(time);
    assert.equal(env.canvas.dataset.longitude, '114.17'); assert.equal(env.canvas.dataset.latitude, '20.00');
    assert.equal(env.canvas.dataset.animating, 'false'); assert.equal(env.frames.size, 0); assert.equal(running.at(-1), false);
    globe.destroy();
  } finally { env.restore(); }
});

test('manual input interrupts a flight, reduced motion finishes it immediately and unmount cancels its frame', () => {
  const env = environment();
  try {
    const globe = createGlobe(env.canvas as any, [], { onSelect() {}, onRunning() {}, onReduced() {} })!;
    env.step(100); globe.focus([-97.48, 39.54]); env.step(200); env.step(250);
    env.canvas.fire('pointerdown', { button: 0, pointerId: 1, clientX: 80, clientY: 90 }); env.step(300);
    assert.equal(env.canvas.dataset.animating, 'false'); assert.equal(env.frames.size, 0);
    env.canvas.fire('pointercancel');
    globe.focus([10.42, 51.08]); env.step(350);
    env.media.matches = true; env.media.fire('change'); env.step(400);
    assert.equal(env.canvas.dataset.longitude, '10.42'); assert.equal(env.canvas.dataset.latitude, '20.00');
    assert.equal(env.canvas.dataset.animating, 'false'); assert.equal(env.frames.size, 0);
    env.media.matches = false; env.media.fire('change'); globe.focus([139.75, 36.2]); env.step(450);
    assert.equal(env.frames.size, 1); globe.destroy(); assert.equal(env.frames.size, 0);
  } finally { env.restore(); }
});
