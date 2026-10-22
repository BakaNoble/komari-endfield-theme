import test from 'node:test';
import assert from 'node:assert/strict';
import { observeInstrument } from '../src/instrumentMotion.ts';

function environment(hidden = false, reduced = false) {
  const documentListeners = new Set<Function>(), mediaListeners = new Set<Function>();
  let running = false, disconnected = false, intersection: Function = () => {};
  const doc = { hidden, addEventListener: (_: string, fn: Function) => documentListeners.add(fn), removeEventListener: (_: string, fn: Function) => documentListeners.delete(fn) };
  const media = { matches: reduced, addEventListener: (_: string, fn: Function) => mediaListeners.add(fn), removeEventListener: (_: string, fn: Function) => mediaListeners.delete(fn) };
  const host = { toggleAttribute: (_: string, value: boolean) => { running = value; }, removeAttribute: () => { running = false; } };
  const mocks = { document: doc, matchMedia: () => media, IntersectionObserver: class {
    constructor(callback: Function) { intersection = callback; }
    observe() {} disconnect() { disconnected = true; }
  } };
  const saved = Object.fromEntries(Object.keys(mocks).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(mocks)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return {
    host: host as unknown as HTMLElement, doc, media,
    get running() { return running; }, get disconnected() { return disconnected; },
    get listenerCount() { return documentListeners.size + mediaListeners.size; },
    visible(value: boolean) { intersection([{ isIntersecting: value }]); },
    visibility() { documentListeners.forEach(fn => fn()); }, motion() { mediaListeners.forEach(fn => fn()); },
    restore() { for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } },
  };
}

test('instrument runs only in view, pauses in a hidden tab and cleans up its observers', () => {
  const env = environment();
  try {
    const cleanup = observeInstrument(env.host, true);
    assert.equal(env.running, false);
    env.visible(true); assert.equal(env.running, true);
    env.doc.hidden = true; env.visibility(); assert.equal(env.running, false);
    env.doc.hidden = false; env.visibility(); assert.equal(env.running, true);
    env.visible(false); assert.equal(env.running, false);
    env.visible(true); cleanup();
    assert.equal(env.running, false); assert.equal(env.disconnected, true); assert.equal(env.listenerCount, 0);
  } finally { env.restore(); }
});

test('instrument respects monitoring pause and changes to reduced-motion preferences', () => {
  const env = environment(false, true);
  try {
    const cleanup = observeInstrument(env.host, true);
    env.visible(true); assert.equal(env.running, false);
    env.media.matches = false; env.motion(); assert.equal(env.running, true);
    env.media.matches = true; env.motion(); assert.equal(env.running, false);
    cleanup();
    const pausedCleanup = observeInstrument(env.host, false);
    env.media.matches = false; env.visible(true); env.motion(); assert.equal(env.running, false);
    pausedCleanup(); assert.equal(env.listenerCount, 0);
  } finally { env.restore(); }
});
