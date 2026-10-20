import { ArrowDown, ArrowUp, ChevronRight, Clock3, Cpu, HardDrive, MemoryStick } from 'lucide-react';
import { bytes, duration, percent, traffic, warning, type NodeInfo, type NodeStatus } from './model';
import { Meter, StateBadge } from './components';
import { RegionBadge } from './RegionBadge';

export function NodeCard({ node, status, threshold, onOpen }: {
  node: NodeInfo; status?: NodeStatus; threshold: number; onOpen: (node: NodeInfo) => void;
}) {
  const active = status?.online, alert = warning(node, status, threshold);
  const resources = [
    { label: 'CPU', icon: Cpu, value: active ? status.cpu : null, capacity: `${node.cpu_cores} 核` },
    { label: '内存', icon: MemoryStick, value: active ? percent(status.ram, node.mem_total) : null, capacity: bytes(node.mem_total) },
    { label: '磁盘', icon: HardDrive, value: active ? percent(status.disk, node.disk_total) : null, capacity: bytes(node.disk_total) },
  ];
  const used = traffic(node, status);
  return <button className={`node-card ${status && !active ? 'node-offline' : ''} ${alert ? 'node-attention' : ''}`} onClick={() => onOpen(node)} aria-label={`查看 ${node.name} 详情`}>
    <span className="card-heading"><RegionBadge region={node.region} /><span className="card-title"><strong title={node.name}>{node.name}</strong><span>{node.os || '未知系统'}<i>/</i>{node.arch || '—'}</span></span><StateBadge status={status} alert={alert} /></span>
    <span className="card-resources">{resources.map(r => <span className="card-resource" key={r.label}>
      <span className="card-resource-label"><r.icon size={13} />{r.label}<small>{r.capacity}</small></span>
      <span className="card-resource-reading"><strong>{r.value == null ? '—' : r.value.toFixed(1)}{r.value != null && <small>%</small>}</strong><Meter value={r.value} threshold={threshold} /></span>
    </span>)}</span>
    <span className="card-network"><span><span><ArrowUp size={12} />上传速率</span><strong>{bytes(active ? status.up : null, true)}</strong></span><span><span><ArrowDown size={12} />下载速率</span><strong>{bytes(active ? status.down : null, true)}</strong></span></span>
    {!!node.traffic_limit && <span className="card-quota"><span>流量额度 <b>{bytes(used)} / {bytes(node.traffic_limit)}</b></span><Meter value={percent(used, node.traffic_limit)} threshold={threshold} /></span>}
    <span className="card-footer"><span><Clock3 size={12} />{active ? duration(status.uptime) : status ? '离线' : '等待上报'}</span><span className="card-group">{node.group}</span><ChevronRight size={16} /></span>
  </button>;
}
