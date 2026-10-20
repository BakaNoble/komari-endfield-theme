export interface PingTask { id: number; name: string; type: string; interval: number; clients: string[]; weight: number }
export interface PingRecord { client: string; task_id: number; time: string; value: number }
export interface PingMetric { client: string; task_id: number; avg: number | null; min: number | null; max: number | null; loss: number | null; total: number; approximate: boolean }
export interface PingReport { records: PingRecord[]; metrics: PingMetric[]; losses: Record<string, number> }
export interface PingSummary {
  records: PingRecord[]; latest: PingRecord | null; avg: number | null; min: number | null; max: number | null;
  loss: number | null; total: number; sampled: boolean;
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const taskId = (v: unknown) => (typeof v === 'number' || typeof v === 'string') && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;

export function normalizePingTasks(raw: unknown): PingTask[] {
  if (!Array.isArray(raw)) throw new Error('延迟测试任务格式无效。');
  return raw.filter(object).filter(t => taskId(t.id) != null).map(t => ({
    id: Number(t.id), name: String(t.name || `任务 ${t.id}`), type: String(t.type || 'icmp').toUpperCase(),
    interval: number(t.interval) || 60, clients: Array.isArray(t.clients) ? t.clients.filter((c: unknown): c is string => typeof c === 'string') : [],
    weight: typeof t.weight === 'number' && Number.isFinite(t.weight) ? t.weight : 0,
  })).sort((a, b) => a.weight - b.weight || a.id - b.id);
}
export function normalizePingReport(raw: unknown): PingReport {
  if (!object(raw) || !Array.isArray(raw.records)) throw new Error('延迟测试记录格式无效。');
  const unique = new Map<string, PingRecord>();
  for (const r of raw.records) {
    if (!object(r) || typeof r.client !== 'string' || taskId(r.task_id) == null || typeof r.time !== 'string' || !Number.isFinite(Date.parse(r.time)) || typeof r.value !== 'number' || !Number.isFinite(r.value)) continue;
    unique.set(`${r.client}/${r.task_id}/${Date.parse(r.time)}`, { client: r.client, task_id: Number(r.task_id), time: r.time, value: r.value });
  }
  const losses: Record<string, number> = {};
  for (const r of Array.isArray(raw.basic_info) ? raw.basic_info : []) if (object(r) && typeof r.client === 'string' && number(r.loss) != null && r.loss <= 100) losses[r.client] = r.loss;
  return { records: [...unique.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time)), metrics: [], losses };
}
export function normalizePingMetrics(raw: unknown): PingMetric[] {
  if (!object(raw) || !Array.isArray(raw.stats)) throw new Error('延迟统计格式无效。');
  return raw.stats.filter(object).filter(s => typeof s.entity_id === 'string' && taskId(s.task_id) != null).map(s => ({
    client: s.entity_id, task_id: Number(s.task_id), avg: number(s.avg), min: number(s.min), max: number(s.max),
    loss: number(s.loss) != null && s.loss <= 100 ? s.loss : null, total: number(s.total) ?? 0, approximate: s.loss_approximate === true,
  }));
}
export function pingSummary(report: PingReport, uuid: string, task: number): PingSummary {
  const records = report.records.filter(r => r.client === uuid && r.task_id === task);
  const valid = records.filter(r => r.value >= 0).map(r => r.value), metric = report.metrics.find(s => s.client === uuid && s.task_id === task && s.total > 0);
  const total = metric?.total ?? records.length;
  return {
    records, latest: records.at(-1) ?? null, total,
    avg: metric ? metric.avg : valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
    min: metric ? metric.min : valid.length ? Math.min(...valid) : null,
    max: metric ? metric.max : valid.length ? Math.max(...valid) : null,
    loss: metric?.loss ?? report.losses[uuid] ?? (records.length ? (records.length - valid.length) / records.length * 100 : null),
    sampled: !metric || metric.approximate,
  };
}
export const emptyPingReport = (): PingReport => ({ records: [], metrics: [], losses: {} });
export const milliseconds = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(1)} ms`;
export function hostPingHealth(summaries: PingSummary[]) {
  const measured = summaries.filter(s => s.total > 0);
  const losses = measured.flatMap(s => s.loss == null ? [] : [s.loss]), averages = measured.flatMap(s => s.avg == null ? [] : [s.avg]);
  return { tested: measured.length, loss: losses.length ? Math.max(...losses) : null, latency: averages.length ? Math.max(...averages) : null,
    timedOut: measured.some(s => s.latest != null && s.latest.value < 0) };
}
