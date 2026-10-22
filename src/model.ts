export interface NodeInfo {
  uuid: string; name: string; region: string; group: string; os: string;
  cpu_name: string; cpu_cores: number; arch: string; virtualization: string;
  mem_total: number; disk_total: number; swap_total?: number;
  tags?: string; public_remark?: string; weight?: number;
  traffic_limit?: number; traffic_limit_type?: string; expired_at?: string;
}
export interface NodeStatus {
  online: boolean; cpu: number | null; ram: number | null; disk: number | null;
  up: number | null; down: number | null; totalUp: number | null; totalDown: number | null;
  uptime: number | null; load: number | null; tcp: number | null; udp: number | null;
  time: string;
}
export interface HistoryRecord {
  time: string; cpu: number | null; ram: number | null; disk: number | null;
  net_in: number | null; net_out: number | null;
}
export interface PublicInfo {
  sitename?: string; description?: string; private_site?: boolean;
  theme_settings?: Record<string, unknown>;
}
export const numeric = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : null;
export function percent(used: number | null | undefined, total: number | null | undefined, clamp = true): number | null {
  if (used == null || total == null || total <= 0) return null;
  const value = Math.max(0, used / total * 100);
  return clamp ? Math.min(100, value) : value;
}
export function normalizeNodes(raw: unknown): NodeInfo[] {
  if (!raw || typeof raw !== 'object') throw new Error('节点接口返回了无效的数据。');
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list.filter(n => n && typeof n.uuid === 'string').map(n => ({ ...n,
    name: String(n.name || '未命名节点'), region: String(n.region || ''), group: String(n.group || '未分组'),
    os: String(n.os || ''), cpu_name: String(n.cpu_name || ''), cpu_cores: numeric(n.cpu_cores) ?? 0,
    arch: String(n.arch || ''), virtualization: String(n.virtualization || ''),
    mem_total: numeric(n.mem_total) ?? 0, disk_total: numeric(n.disk_total) ?? 0,
    tags: typeof n.tags === 'string' ? n.tags : '', public_remark: typeof n.public_remark === 'string' ? n.public_remark : '',
    expired_at: typeof n.expired_at === 'string' ? n.expired_at : undefined,
    weight: typeof n.weight === 'number' && Number.isFinite(n.weight) ? n.weight : 0,
    traffic_limit: numeric(n.traffic_limit) ?? 0,
  })).sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0) || a.name.localeCompare(b.name));
}
// RPC2 returns flat records; the older /api/clients WebSocket returns nested reports.
export function normalizeStatuses(raw: unknown): Record<string, NodeStatus> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('实时接口返回了无效的数据。');
  const payload = raw as Record<string, any>;
  const legacy = Array.isArray(payload.online) && payload.data && typeof payload.data === 'object';
  const rows = legacy ? payload.data : payload;
  return Object.fromEntries(Object.entries(rows).filter(([, v]) => v && typeof v === 'object').map(([id, value]) => {
    const r = value as Record<string, any>;
    return [id, {
      online: legacy ? payload.online.includes(id) : r.online === true,
      cpu: numeric(typeof r.cpu === 'object' ? r.cpu?.usage : r.cpu),
      ram: numeric(typeof r.ram === 'object' ? r.ram?.used : r.ram),
      disk: numeric(typeof r.disk === 'object' ? r.disk?.used : r.disk),
      up: numeric(r.network?.up ?? r.net_out), down: numeric(r.network?.down ?? r.net_in),
      totalUp: numeric(r.network?.totalUp ?? r.net_total_out ?? r.net_total_up),
      totalDown: numeric(r.network?.totalDown ?? r.net_total_in ?? r.net_total_down),
      uptime: numeric(r.uptime), load: numeric(typeof r.load === 'object' ? r.load?.load1 : r.load),
      tcp: numeric(r.connections?.tcp ?? r.connections), udp: numeric(r.connections?.udp ?? r.connections_udp),
      time: String(r.time ?? r.updated_at ?? ''),
    } satisfies NodeStatus];
  }));
}
export function normalizeHistory(raw: unknown): HistoryRecord[] {
  const rows = Array.isArray(raw) ? raw : (raw as { records?: unknown })?.records;
  if (!Array.isArray(rows)) throw new Error('历史接口返回了无效的数据。');
  return rows.filter(r => r && Number.isFinite(Date.parse(r.time))).map(r => ({
    time: r.time, cpu: numeric(r.cpu), ram: numeric(r.ram), disk: numeric(r.disk),
    net_in: numeric(r.net_in), net_out: numeric(r.net_out),
  })).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}
export function bytes(value: number | null | undefined, speed = false): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const i = value > 0 ? Math.min(5, Math.max(0, Math.floor(Math.log(value) / Math.log(1024)))) : 0;
  return `${(value / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}${speed ? '/s' : ''}`;
}
export function duration(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 86400) return `${Math.floor(value / 86400)} 天 ${Math.floor(value % 86400 / 3600)} 时`;
  if (value >= 3600) return `${Math.floor(value / 3600)} 时 ${Math.floor(value % 3600 / 60)} 分`;
  return `${Math.floor(value / 60)} 分`;
}
export function warning(node: NodeInfo, status: NodeStatus | undefined, threshold = 85): boolean {
  return !!status?.online && [status.cpu, percent(status.ram, node.mem_total), percent(status.disk, node.disk_total)].some(v => v != null && v >= threshold);
}
export function traffic(node: NodeInfo, s: NodeStatus | undefined): number | null {
  if (!s) return null;
  if (node.traffic_limit_type === 'up') return s.totalUp;
  if (node.traffic_limit_type === 'down') return s.totalDown;
  if (s.totalUp == null || s.totalDown == null) return null;
  switch (node.traffic_limit_type) {
    case 'sum': return s.totalUp + s.totalDown;
    case 'min': return Math.min(s.totalUp, s.totalDown);
    default: return Math.max(s.totalUp, s.totalDown);
  }
}
