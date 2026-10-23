import type { Coordinates } from './globeModel.ts';

export interface TrafficPoint { coordinates: Coordinates; elevation: number }
export interface TrafficNode { id?: string; code: string; coordinates: Coordinates; online: number }
export interface TrafficRoute { key: string; from: string; to: string; sourceId: string; targetId: string; points: TrafficPoint[]; duration: number }
export function resolveTrafficInterval(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string' || typeof value === 'string' && !value.trim()) return 6;
  const seconds = Number(value);
  return !Number.isFinite(seconds) ? 6 : Math.max(2, Math.min(30, Math.round(seconds)));
}
const radians = Math.PI / 180;
const vector = ([lon, lat]: Coordinates) => [Math.cos(lat * radians) * Math.sin(lon * radians), Math.sin(lat * radians), Math.cos(lat * radians) * Math.cos(lon * radians)];
const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const angle = (a: Coordinates, b: Coordinates) => Math.acos(Math.max(-1, Math.min(1, dot(vector(a), vector(b)))));

/** A raised shortest spherical arc, including a stable path for opposite points. */
export function trafficArc(from: Coordinates, to: Coordinates): TrafficPoint[] {
  const a = vector(from), b = vector(to), distance = angle(from, to);
  let tangent = b.map((value, i) => value - a[i] * Math.cos(distance));
  let length = Math.hypot(...tangent);
  if (length < 1e-7) {
    const basis = Math.abs(a[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    tangent = basis.map((value, i) => value - a[i] * dot(a, basis));
    length = Math.hypot(...tangent);
  }
  tangent = tangent.map(value => value / length);
  return Array.from({ length: 65 }, (_, i) => {
    const t = i / 64;
    const v = a.map((value, j) => value * Math.cos(distance * t) + tangent[j] * Math.sin(distance * t));
    return {
      coordinates: i === 0 ? from : i === 64 ? to : [Math.atan2(v[0], v[2]) / radians, Math.asin(Math.max(-1, Math.min(1, v[1]))) / radians] as Coordinates,
      elevation: 1 + Math.sin(Math.PI * t) * (.06 + Math.min(1, distance / Math.PI) * .15),
    };
  });
}

/** Each decorative transmission chooses a new online destination, not a fixed topology. */
export function pickTrafficRoute(regions: TrafficNode[], random = Math.random, previousKey = '', sourceId?: string): TrafficRoute | null {
  const active = regions.filter(region => region.online > 0 && region.coordinates.every(Number.isFinite))
    .sort((a, b) => (a.id ?? a.code).localeCompare(b.id ?? b.code));
  if (active.length < 2) return null;
  const choose = <T,>(items: T[]) => items[Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))];
  const from = sourceId == null ? choose(active) : active.find(node => (node.id ?? node.code) === sourceId);
  if (!from) return null;
  const keyFor = (to: TrafficNode) => [from.id ?? from.code, to.id ?? to.code].sort().join(':');
  let targets = active.filter(to => (to.id ?? to.code) !== (from.id ?? from.code) && angle(from.coordinates, to.coordinates) > 1e-5);
  const fresh = targets.filter(to => keyFor(to) !== previousKey);
  if (fresh.length) targets = fresh;
  if (!targets.length) return null;
  const to = choose(targets), distance = angle(from.coordinates, to.coordinates);
  return { key: keyFor(to), from: from.code, to: to.code, sourceId: from.id ?? from.code, targetId: to.id ?? to.code, points: trafficArc(from.coordinates, to.coordinates), duration: 3200 + distance * 700 };
}
