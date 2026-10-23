import { pickTrafficRoute, resolveTrafficInterval, type TrafficNode, type TrafficRoute } from './globeTraffic.ts';

interface Schedule { next: number; last: number | null; jitter: number; previousKey: string }
export interface TrafficPacket { owner: string; route: TrafficRoute; started: number }
interface Configuration { enabled: boolean; concurrent: boolean; interval?: number; nodes: TrafficNode[] }

/** One clock per actual host in concurrent mode, or one shared clock in serial mode. */
export class TrafficScheduler {
  time = 0;
  interval = 6;
  concurrent = false;
  packets: TrafficPacket[] = [];
  private enabled = false;
  private nodes: TrafficNode[] = [];
  private schedules = new Map<string, Schedule>();
  private random: () => number;
  constructor(random = Math.random) { this.random = random; }

  get active() { return this.enabled && this.nodes.length > 1; }
  reset() { this.time = 0; this.packets = []; this.schedules.clear(); }

  configure(configuration: Configuration) {
    const interval = resolveTrafficInterval(configuration.interval);
    if (this.concurrent !== configuration.concurrent || !configuration.enabled) this.reset();
    if (interval !== this.interval) {
      for (const schedule of this.schedules.values()) {
        if (schedule.last != null) schedule.next = schedule.last + interval * 1000 + schedule.jitter;
      }
    }
    this.interval = interval; this.concurrent = configuration.concurrent; this.enabled = configuration.enabled;
    this.nodes = configuration.nodes.filter(node => node.online > 0 && node.coordinates.every(Number.isFinite));
    const online = new Set(this.nodes.map(node => node.id ?? node.code));
    for (const key of this.schedules.keys()) if (key !== 'global' && !online.has(key)) this.schedules.delete(key);
    this.packets = this.packets.filter(packet => online.has(packet.route.sourceId) && online.has(packet.route.targetId));
  }

  advance(elapsed: number, visibleRegions: Set<string>) {
    if (!this.active) return;
    this.time += Math.max(0, elapsed);
    this.packets = this.packets.filter(packet => this.time - packet.started < packet.route.duration);
    const visible = this.nodes.filter(node => visibleRegions.has(node.code));
    if (visible.length < 2 || visible.every(node => node.coordinates[0] === visible[0].coordinates[0] && node.coordinates[1] === visible[0].coordinates[1])) return;
    const owners = this.concurrent ? visible.map(node => node.id ?? node.code) : ['global'];
    for (const owner of owners) {
      let schedule = this.schedules.get(owner);
      if (!schedule) {
        // Spread initial departures so enabling concurrency does not cause a burst.
        const delay = this.concurrent ? this.random() * Math.min(this.interval * 1000, 3000) : 0;
        schedule = { next: this.time + delay, last: null, jitter: 0, previousKey: '' };
        this.schedules.set(owner, schedule);
      }
      // A small global bound keeps dense installations responsive.
      if (this.packets.length >= 12) break;
      if (this.time < schedule.next || this.packets.some(packet => packet.owner === owner)) continue;
      const route = pickTrafficRoute(visible, this.random, schedule.previousKey, this.concurrent ? owner : undefined);
      if (route) {
        this.packets.push({ owner, route: { ...route, duration: Math.min(route.duration, this.interval * 800) }, started: this.time });
        schedule.previousKey = route.key;
      }
      schedule.last = this.time; schedule.jitter = this.random() * 3000;
      schedule.next = this.time + this.interval * 1000 + schedule.jitter;
    }
  }
}
