import type { HistoryRecord, NodeInfo, NodeStatus } from './model';
import type { PingReport, PingTask } from './ping';
import { normalizeTrafficReport, trafficMetricKeys } from './traffic.ts';
const GiB = 1024 ** 3;
export const demoPingTasks: PingTask[] = [
  { id: 1, name: 'Cloudflare DNS', type: 'ICMP', interval: 60, clients: [1, 2, 3, 4, 5, 6].map(i => `demo-node-${i}`), weight: 0 },
  { id: 2, name: 'Google DNS', type: 'ICMP', interval: 60, clients: [1, 2, 3, 4, 5].map(i => `demo-node-${i}`), weight: 1 },
  { id: 3, name: 'HTTPS 连通性', type: 'HTTP', interval: 60, clients: [1, 2, 3, 4, 5].map(i => `demo-node-${i}`), weight: 2 },
];
export function demoPingReport(task: number, hours: number): PingReport {
  const records = demoPingTasks.find(t => t.id === task)!.clients.flatMap(uuid => {
    const i = Number(uuid.split('-').at(-1)) - 1, base = [22, 37, 65, 12, 145, 180][i] + (task - 1) * 8;
    return Array.from({ length: 60 }, (_, t) => ({ client: uuid, task_id: task, time: new Date(Date.now() - (59 - t) * hours * 60000 - (i === 5 ? 7200000 : 0)).toISOString(),
      value: i === 2 && t % 13 === 0 ? -1 : Math.max(0, base + Math.sin(t * .24 + i) * (i === 2 ? 21 : 4) + Math.cos(t * .8) * 2) }));
  });
  return { records: records.filter(r => Date.parse(r.time) >= Date.now() - hours * 3600000).sort((a, b) => Date.parse(a.time) - Date.parse(b.time)), metrics: [], losses: {} };
}
const samples = [
  ['香港 / HKG-01', 'HK', '亚洲', 'AMD EPYC 7B13', 4, 8, 80, 24.8, 42.6, 36.2, 2.36, 8.42, 42],
  ['东京 / NRT-01', 'JP', '亚洲', 'Intel Xeon Platinum 8358', 4, 8, 100, 12.3, 31.4, 22.8, 0.84, 3.65, 128],
  ['新加坡 / SIN-01', 'SG', '亚洲', 'AMD EPYC 7763', 2, 4, 60, 87.2, 68.5, 52.6, 4.18, 12.56, 16],
  ['法兰克福 / FRA-01', 'DE', '欧洲', 'AMD EPYC 9454P', 4, 8, 160, 8.6, 26.2, 18.4, 0.32, 1.26, 64],
  ['洛杉矶 / LAX-01', 'US', '美洲', 'Intel Xeon E5-2680 v4', 2, 4, 80, 36.5, 52.8, 63.2, 1.48, 6.82, 28],
  ['阿姆斯特丹 / AMS-01', 'NL', '欧洲', 'AMD EPYC 7543', 2, 4, 60, 0, 0, 0, 0, 0, 0],
] as const;
export const demoNodes: NodeInfo[] = samples.map((v, i) => ({
  uuid: `demo-node-${i + 1}`, name: v[0], region: v[1], group: v[2], cpu_name: v[3], cpu_cores: v[4],
  mem_total: v[5] * GiB, disk_total: v[6] * GiB, swap_total: GiB,
  os: i % 2 ? 'Debian 12' : 'Ubuntu 24.04', arch: 'x86_64', virtualization: 'KVM',
  tags: i < 3 ? '生产环境;SSD' : '边缘节点;SSD', traffic_limit: 2 * 1024 ** 4,
  expired_at: i === 3 ? undefined : new Date(Date.now() + [30, 5, -2, 0, 90, 14][i] * 86400000).toISOString(),
  traffic_limit_type: 'sum', weight: i,
}));
export function demoStatuses(tick = 0): Record<string, NodeStatus> {
  return Object.fromEntries(demoNodes.map((n, i) => {
    const v = samples[i]; const delta = tick ? Math.sin(tick * .3 + i) * 2 : 0;
    return [n.uuid, { online: i !== 5, cpu: i === 5 ? null : Math.max(0, v[7] + delta),
      ram: v[8] / 100 * n.mem_total, disk: v[9] / 100 * n.disk_total,
      up: v[10] * 1024 ** 2, down: v[11] * 1024 ** 2,
      totalUp: (i + 1) * 28.6 * GiB, totalDown: (i + 1) * 128.4 * GiB,
      uptime: v[12] * 86400 + 18720, load: v[7] / 100 * n.cpu_cores, tcp: 128 + i * 35, udp: 8 + i,
      time: new Date(Date.now() - (i === 5 ? 7200000 : 0)).toISOString(),
    }];
  }));
}
export function demoHistory(uuid: string, hours: number): HistoryRecord[] {
  const i = Math.max(0, demoNodes.findIndex(n => n.uuid === uuid)); const n = demoNodes[i];
  return Array.from({ length: 120 }, (_, t) => ({
    time: new Date(Date.now() - (119 - t) * hours * 3600000 / 119).toISOString(),
    cpu: Math.max(1, Math.min(100, samples[i][7] + Math.sin(t * .36 + i) * 9 + Math.cos(t * .91) * 4)),
    ram: (samples[i][8] + Math.sin(t * .12) * 3) / 100 * n.mem_total,
    disk: samples[i][9] / 100 * n.disk_total,
    net_in: Math.max(0, samples[i][11] * 1024 ** 2 * (.7 + Math.sin(t * .22) * .3)),
    net_out: Math.max(0, samples[i][10] * 1024 ** 2 * (.7 + Math.cos(t * .2) * .3)),
  }));
}
export function demoTrafficReport(end = Date.now()) {
  const start = end - 24 * 3600000, step = 15 * 60000;
  const series = demoNodes.flatMap((node, i) => {
    let up = (i + 1) * GiB, down = (i + 1) * 4 * GiB;
    const rows = Array.from({ length: 97 }, (_, t) => {
      const wave = .7 + Math.sin(t * .11 + i) * .2 + Math.sin(t * .43 + i) * .1;
      const upRate = (samples[i][10] || .18) * 1024 ** 2 * .12 * wave;
      const downRate = (samples[i][11] || .6) * 1024 ** 2 * .12 * wave;
      const upDelta = t ? upRate * step / 1000 : 0, downDelta = t ? downRate * step / 1000 : 0;
      const missing = i === 5 && t > 88;
      if (!missing) { up += upDelta; down += downDelta; }
      return { time: new Date(start + t * step).toISOString(), values: [downRate, upRate, up, down, upDelta, downDelta], missing };
    });
    return trafficMetricKeys.map((metric_key, metric) => ({ metric_key, entity_id: node.uuid,
      points: rows.map(row => ({ time: row.time, value: row.missing ? null : row.values[metric] })) }));
  });
  return normalizeTrafficReport({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), series }, start, end);
}
