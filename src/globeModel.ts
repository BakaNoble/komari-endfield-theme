import { regionCode } from './region.ts';
import type { NodeInfo, NodeStatus } from './model.ts';

export type Coordinates = readonly [number, number];
export interface GlobeRegion { code: string; total: number; online: number; pending: number; coordinates: Coordinates }
export const GLOBE_TILT = -36;
export const GLOBE_LATITUDE = 20;

export function projectGlobe(lon: number, lat: number, longitude: number, latitude: number, roll = 0) {
  const rad = Math.PI / 180, phi = lat * rad, center = latitude * rad, delta = (lon - longitude) * rad, tilt = roll * rad;
  const x = Math.cos(phi) * Math.sin(delta), y = Math.cos(center) * Math.sin(phi) - Math.sin(center) * Math.cos(phi) * Math.cos(delta);
  return {
    x: x * Math.cos(tilt) - y * Math.sin(tilt),
    y: x * Math.sin(tilt) + y * Math.cos(tilt),
    z: Math.sin(center) * Math.sin(phi) + Math.cos(center) * Math.cos(phi) * Math.cos(delta),
  };
}

// Convert a screen drag into the inclined globe's local horizontal/vertical axes.
export function unrollGlobeDrag(dx: number, dy: number, roll = GLOBE_TILT) {
  const angle = roll * Math.PI / 180;
  return { x: dx * Math.cos(angle) - dy * Math.sin(angle), y: dx * Math.sin(angle) + dy * Math.cos(angle) };
}

export function locateRegions(nodes: NodeInfo[], statuses: Record<string, NodeStatus>, centers: Record<string, Coordinates>) {
  const regions = new Map<string, GlobeRegion>();
  let unlocated = 0;
  for (const node of nodes) {
    const code = regionCode(node.region), coordinates = code ? centers[code] : undefined;
    if (!code || !coordinates) { unlocated++; continue; }
    const region = regions.get(code) ?? { code, coordinates, total: 0, online: 0, pending: 0 };
    region.total++;
    if (!statuses[node.uuid]) region.pending++;
    else if (statuses[node.uuid].online) region.online++;
    regions.set(code, region);
  }
  return { regions: [...regions.values()].sort((a, b) => a.code.localeCompare(b.code)), unlocated };
}

export function wrapLongitude(value: number) { return ((value + 180) % 360 + 360) % 360 - 180; }
export function advanceGlobeLongitude(value: number, elapsedMs: number) { return wrapLongitude(value + Math.max(0, Math.min(elapsedMs, 80)) * .006); }
