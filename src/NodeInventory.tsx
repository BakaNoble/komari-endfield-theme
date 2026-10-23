import { CalendarClock, ChevronRight, Clock3, Cpu, HardDrive, MemoryStick, Server, Terminal } from 'lucide-react';
import { bytes, duration, warning, type NodeInfo, type NodeStatus } from './model';
import { RegionBadge } from './RegionBadge';
import { StateBadge } from './components';
import { expiryInfo } from './expiry';
import { ListColumn } from './ListColumn';

export function NodeInventory({ nodes, statuses, threshold, cards, onOpen }: { nodes: NodeInfo[]; statuses: Record<string, NodeStatus>; threshold: number; cards: boolean; onOpen: (node: NodeInfo) => void }) {
  return <div className={cards ? 'node-grid inventory-grid' : 'inventory-table'}>
    {!cards && <div className="inventory-columns list-columns" aria-hidden="true"><ListColumn icon={Server} label="节点" detail="地区 / 名称 / 状态" /><ListColumn icon={Cpu} label="处理器" detail="型号 / 核心" /><ListColumn icon={MemoryStick} label="配置容量" detail="内存 / 磁盘" /><ListColumn icon={Terminal} label="系统环境" detail="发行版 / 虚拟化" /><ListColumn icon={CalendarClock} label="运行 / 到期" detail="时长 / 日期" /><span /></div>}
    {nodes.map(node => {
      const s = statuses[node.uuid], alert = warning(node, s, threshold), expiry = expiryInfo(node.expired_at);
      return <button key={node.uuid} className={cards ? `node-card inventory-card ${alert || expiry?.soon || expiry?.expired ? 'node-attention' : ''} ${s && !s.online ? 'node-offline' : ''}` : `inventory-row ${s && !s.online ? 'node-offline' : ''} ${alert || expiry?.soon || expiry?.expired ? 'node-attention' : ''}`} onClick={() => onOpen(node)} aria-label={`查看 ${node.name} 详情`}>
        <span className={cards ? 'host-heading' : 'inventory-identity'}><RegionBadge region={node.region} /><span className="card-title"><strong>{node.name}</strong><span>{node.group}</span></span><StateBadge status={s} alert={alert} />{cards && <ChevronRight size={16} />}</span>
        {cards ? <>
          <span className="host-config"><span className="host-cores"><Cpu size={18} /><strong>{node.cpu_cores ? String(node.cpu_cores).padStart(2, '0') : '—'}</strong><small>CPU 核心</small></span><span className="host-machine"><strong className="host-processor">{node.cpu_name || '未上报型号'}</strong><span className="host-environment">{node.os || '—'}<i>/</i>{node.arch || '—'}<i>/</i>{node.virtualization || '—'}</span><span className="host-capacity"><span><small><MemoryStick size={12} />内存</small><b>{bytes(node.mem_total)}</b></span><span><small><HardDrive size={12} />磁盘</small><b>{bytes(node.disk_total)}</b></span></span></span></span>
          {node.tags && <span className="host-tags">{node.tags.split(/[;,]/).filter(Boolean).map((tag, i) => <span key={i}>{tag}</span>)}</span>}
          <span className="host-service"><span><Clock3 size={13} /><small>持续运行</small><b>{s?.online ? duration(s.uptime) : s ? '离线' : '等待上报'}</b></span><span className="host-report"><small>最近上报</small><b>{reportTime(s?.time)}</b></span></span>
          {expiry && <span className={`host-expiry ${expiry.expired || expiry.soon ? 'expiry-attention' : ''}`} title={expiry.full}><CalendarClock size={13} /><span>到期时间 <b>{expiry.date}</b></span><strong>{expiry.label}</strong></span>}
        </> : <>
          <span className="inventory-cell"><small>处理器</small><strong>{node.cpu_name || '未上报型号'}</strong><span>{node.cpu_cores || '—'} 核 / {node.arch || '—'}</span></span>
          <span className="inventory-cell"><small>配置容量</small><strong>{bytes(node.mem_total)} RAM</strong><span>{bytes(node.disk_total)} 磁盘</span></span>
          <span className="inventory-cell"><small>系统环境</small><strong>{node.os || '—'}</strong><span>{node.virtualization || '—'}</span></span>
          <span className="inventory-cell"><small>运行 / 到期</small><strong>{s?.online ? duration(s.uptime) : s ? '离线' : '等待上报'}</strong>{expiry ? <span className={expiry.expired || expiry.soon ? 'expiry-inline expiry-attention' : 'expiry-inline'} title={expiry.full}>到期 {expiry.date}<b>{expiry.label}</b></span> : <span>上报 {reportTime(s?.time)}</span>}</span><ChevronRight size={16} />
        </>}
      </button>;
    })}
  </div>;
}
function reportTime(time?: string) { return time && Number.isFinite(Date.parse(time)) ? new Date(time).toLocaleTimeString('zh-CN', { hour12: false }) : '—'; }
