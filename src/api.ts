import { normalizeHistory, normalizeNodes, normalizeStatuses } from './model.ts';
import type { PublicInfo } from './model';
import { normalizePingTasks, normalizePingReport, normalizePingMetrics } from './ping.ts';
import { normalizeTrafficReport, trafficMetricKeys } from './traffic.ts';

export class ApiError extends Error {
  code: number;
  constructor(message: string, code: number) { super(message); this.code = code; }
}
const unsupported = (e: unknown) => e instanceof ApiError && [404, 405, -32601, -32050].includes(e.code);
async function request(path: string, options: RequestInit = {}) {
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(path, { credentials: 'same-origin', ...options, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout });
  if (!response.ok) throw new ApiError(response.status === 401 || response.status === 403 ? '此站点需要登录后查看。' : `请求失败（HTTP ${response.status}），请重试。`, response.status);
  let body;
  try { body = await response.json(); } catch { throw new ApiError('接口没有返回 JSON，请检查 Komari 服务地址。', 502); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('接口返回了无效的数据。', 502);
  if (body.error) throw new ApiError(body.error.message || '监控接口请求失败。', body.error.code);
  if (body.status === 'error') throw new ApiError(body.message || '监控接口请求失败。', 400);
  return body;
}
let id = 0;
export async function rpc(method: string, params = {}, signal?: AbortSignal) {
  const body = await request('/api/rpc2', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  if (!Object.hasOwn(body, 'result')) throw new ApiError('RPC 接口返回了无效的数据。', 502);
  return body.result;
}
export async function publicInfo(): Promise<PublicInfo> { return (await request('/api/public')).data ?? {}; }
export async function nodes() {
  try { return normalizeNodes(await rpc('common:getNodes')); }
  catch (e) { if (!unsupported(e)) throw e; return normalizeNodes((await request('/api/nodes')).data); }
}
export async function history(uuid: string, hours: number, signal?: AbortSignal) {
  try { return normalizeHistory(await rpc('common:getRecords', { type: 'load', uuid, hours, load_type: 'all', maxCount: 240 }, signal)); }
  catch (e) {
    if (!unsupported(e)) throw e;
    return normalizeHistory((await request(`/api/records/load?uuid=${encodeURIComponent(uuid)}&hours=${hours}&load_type=all`, { signal })).data);
  }
}
export async function trafficReport(nodeIds: string[], signal?: AbortSignal, end = Date.now()) {
  const start = end - 24 * 3600000;
  const result = await rpc('public:queryMetrics', {
    metric_keys: trafficMetricKeys, entity_ids: [...new Set(nodeIds)],
    start: new Date(start).toISOString(), end: new Date(end).toISOString(),
    max_points: 120, aggregation: 'p95', fill_empty: true,
    aggregation_by_metric: { 'traffic.up': 'sum', 'traffic.down': 'sum', 'net.total.up': 'last', 'net.total.down': 'last' },
  }, signal);
  return normalizeTrafficReport(result, start, end);
}
export async function pingTasks(signal?: AbortSignal) {
  try { return normalizePingTasks(await rpc('public:getPublicPingTasks', {}, signal)); }
  catch (e) { if (!unsupported(e)) throw e; return normalizePingTasks((await request('/api/task/ping', { signal })).data); }
}
let pingMetricsSupported = true;
export async function pingReport(taskId: number, hours: number, signal?: AbortSignal) {
  const metrics = async () => {
    if (!pingMetricsSupported) return [];
    try { return normalizePingMetrics(await rpc('public:getPingMetricStats', { task_id: taskId, hours }, signal)); }
    catch (e) { if (unsupported(e)) pingMetricsSupported = false; return []; }
  };
  const records = async () => {
    try { return normalizePingReport(await rpc('common:getRecords', { type: 'ping', task_id: taskId, hours, maxCount: 4000 }, signal)); }
    catch (e) {
      if (!unsupported(e)) throw e;
      return normalizePingReport((await request(`/api/records/ping?task_id=${taskId}&hours=${hours}`, { signal })).data);
    }
  };
  const [report, stats] = await Promise.all([records(), metrics()]);
  return { ...report, metrics: stats };
}
// Bound concurrency by test target, independent of the number of hosts.
export async function pingReports(taskIds: number[], hours: number, signal?: AbortSignal) {
  const ids = [...new Set(taskIds)], reports: Record<number, Awaited<ReturnType<typeof pingReport>>> = {}, errors: Record<number, string> = {};
  let next = 0;
  const worker = async () => {
    while (next < ids.length && !signal?.aborted) {
      const id = ids[next++];
      try { reports[id] = await pingReport(id, hours, signal); }
      catch (e) { if (!signal?.aborted) errors[id] = e instanceof Error ? e.message : '无法读取延迟记录。'; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));
  if (signal?.aborted) throw signal.reason;
  return { reports, errors };
}
// One persistent compatibility socket; only used when the RPC method is unavailable.
export class LiveSource {
  private legacy = false;
  private ws: WebSocket | null = null;
  private pending: Promise<unknown> | null = null;
  private rejectPending: ((reason: Error) => void) | null = null;
  async read() {
    if (!this.legacy) {
      try { return normalizeStatuses(await rpc('common:getNodesLatestStatus')); }
      catch (e) { if (!unsupported(e)) throw e; this.legacy = true; }
    }
    return normalizeStatuses(await this.readSocket());
  }
  private readSocket(): Promise<unknown> {
    if (this.pending) return this.pending;
    this.pending = new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { this.ws?.close(); reject(new Error('实时连接超时，将自动重试。')); }, 10000);
      const done = (value: unknown) => { clearTimeout(timer); resolve(value); };
      const fail = () => { clearTimeout(timer); reject(new Error('实时连接已断开，将自动重试。')); };
      this.rejectPending = (reason) => { clearTimeout(timer); reject(reason); };
      if (!this.ws || this.ws.readyState > WebSocket.OPEN) this.ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/api/clients`);
      const ws = this.ws;
      ws.onmessage = event => {
        try { const body = JSON.parse(event.data); if (body.status === 'error') throw Error(body.message); done(body.data); }
        catch { clearTimeout(timer); reject(new Error('实时连接返回了无效的数据。')); }
      };
      ws.onerror = fail; ws.onclose = fail;
      if (ws.readyState === WebSocket.OPEN) ws.send('get'); else ws.onopen = () => ws.send('get');
    }).finally(() => { this.pending = null; this.rejectPending = null; });
    return this.pending;
  }
  close() { this.rejectPending?.(new Error('连接已停止。')); this.ws?.close(); this.ws = null; }
}
