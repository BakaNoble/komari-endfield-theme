export const trafficMetricKeys = ['net.in.rate', 'net.out.rate', 'net.total.up', 'net.total.down', 'traffic.up', 'traffic.down'] as const;
type TrafficMetric = typeof trafficMetricKeys[number];
export interface TrafficSample { time: number; value: number | null }
export interface TrafficSeries { metric: TrafficMetric; uuid: string; points: TrafficSample[] }
export interface TrafficReport { start: number; end: number; series: TrafficSeries[] }
export interface TrafficPoint {
  time: number; upRate: number | null; downRate: number | null;
  upCumulative: number | null; downCumulative: number | null;
}
export interface TrafficRank { uuid: string; up: number | null; down: number | null; total: number }
export interface TrafficSummary {
  start: number; end: number; points: TrafficPoint[]; ranking: TrafficRank[];
  totalUp: number | null; totalDown: number | null;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN;
const validValue = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function normalizeTrafficReport(raw: unknown, start: number, end: number): TrafficReport {
  if (!object(raw) || !Array.isArray(raw.series)) throw new Error('流量接口返回了无效的数据。');
  const responseStart = timestamp(raw.start), responseEnd = timestamp(raw.end);
  if (Number.isFinite(responseStart)) start = responseStart;
  if (Number.isFinite(responseEnd)) end = responseEnd;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('流量记录的时间范围无效。');
  // Deduplicate by entity/metric/timestamp; tagged interface series must not be added to host totals.
  const groups = new Map<string, TrafficSeries>();
  for (const row of raw.series) {
    if (!object(row) || !trafficMetricKeys.includes(row.metric_key as TrafficMetric) || typeof row.entity_id !== 'string' || !row.entity_id || !Array.isArray(row.points)) continue;
    if (object(row.tags) && Object.keys(row.tags).length) continue;
    const metric = row.metric_key as TrafficMetric, key = `${row.entity_id}\0${metric}`;
    const group = groups.get(key) ?? { metric, uuid: row.entity_id, points: [] };
    const points = new Map(group.points.map(point => [point.time, point]));
    for (const point of row.points) {
      if (!object(point)) continue;
      const time = timestamp(point.time);
      if (!Number.isFinite(time) || time < start || time > end) continue;
      points.set(time, { time, value: validValue(point.value) });
    }
    group.points = [...points.values()].sort((a, b) => a.time - b.time);
    groups.set(key, group);
  }
  return { start, end, series: [...groups.values()] };
}

export function summarizeTraffic(report: TrafficReport, nodeIds: readonly string[]): TrafficSummary {
  const allowed = new Set(nodeIds), discontinuities = new Set<string>();
  const series = report.series.filter(row => allowed.has(row.uuid));
  // Match the dashboard: the first counter after a gap/reset is a baseline, not observed traffic.
  for (const row of series) {
    if (row.metric !== 'net.total.up' && row.metric !== 'net.total.down') continue;
    const direction = row.metric === 'net.total.up' ? 'up' : 'down';
    let previous: number | null = null, gap = false, rebound: number | null = null;
    for (const point of row.points) {
      if (point.value === null) { if (previous !== null) gap = true; continue; }
      let discontinuity = gap;
      if (previous !== null && point.value < previous) { discontinuity = true; rebound = previous; }
      else if (rebound !== null) { if (point.value >= rebound) discontinuity = true; rebound = null; }
      if (discontinuity) discontinuities.add(`${row.uuid}\0${direction}\0${point.time}`);
      previous = point.value; gap = false;
    }
  }
  type Bucket = { upRate: number | null; downRate: number | null; up: number | null; down: number | null };
  const buckets = new Map<number, Bucket>(), hosts = new Map<string, { up: number | null; down: number | null }>();
  for (const row of series) {
    const rate = row.metric === 'net.in.rate' || row.metric === 'net.out.rate';
    if (!rate && row.metric !== 'traffic.up' && row.metric !== 'traffic.down') continue;
    const direction = row.metric === 'net.out.rate' || row.metric === 'traffic.up' ? 'up' : 'down';
    const field = rate ? direction === 'up' ? 'upRate' : 'downRate' : direction;
    for (const point of row.points) {
      const bucket = buckets.get(point.time) ?? { upRate: null, downRate: null, up: null, down: null };
      buckets.set(point.time, bucket);
      if (point.value === null || !rate && discontinuities.has(`${row.uuid}\0${direction}\0${point.time}`)) continue;
      bucket[field] = (bucket[field] ?? 0) + point.value;
      if (!rate) {
        const host = hosts.get(row.uuid) ?? { up: null, down: null };
        host[direction] = (host[direction] ?? 0) + point.value;
        hosts.set(row.uuid, host);
      }
    }
  }
  let totalUp: number | null = null, totalDown: number | null = null;
  const points = [...buckets.entries()].sort(([a], [b]) => a - b).map(([time, bucket]) => {
    if (bucket.up !== null) totalUp = (totalUp ?? 0) + bucket.up;
    if (bucket.down !== null) totalDown = (totalDown ?? 0) + bucket.down;
    return { time, upRate: bucket.upRate, downRate: bucket.downRate,
      upCumulative: bucket.up === null ? null : totalUp, downCumulative: bucket.down === null ? null : totalDown };
  });
  const ranking = [...hosts].map(([uuid, host]) => ({ uuid, ...host, total: (host.up ?? 0) + (host.down ?? 0) }))
    .sort((a, b) => b.total - a.total || a.uuid.localeCompare(b.uuid));
  return { start: report.start, end: report.end, points, ranking, totalUp, totalDown };
}

export type TrafficField = 'upRate' | 'downRate' | 'upCumulative' | 'downCumulative';
export function trafficSegments(points: TrafficPoint[], field: TrafficField, start: number, end: number, ceiling: number, width = 560, height = 130) {
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] = [];
  for (const point of points) {
    const value = point[field];
    if (value === null) { if (segment.length) segments.push(segment); segment = []; continue; }
    segment.push({ x: Math.max(0, Math.min(width, (point.time - start) / Math.max(1, end - start) * width)),
      y: height - value / Math.max(1, ceiling) * (height - 8) - 4 });
  }
  if (segment.length) segments.push(segment);
  return segments;
}
