import { Activity, ArrowDown, ArrowUp, ChevronRight, RefreshCw, Server } from 'lucide-react';
import { StateBadge } from './components';
import { RegionBadge } from './RegionBadge';
import { bytes, type NodeInfo, type NodeStatus } from './model';
import { milliseconds, type PingSummary } from './ping';
import type { usePingMonitor } from './usePingMonitor';
import { PingComparison, type PingSeries } from './PingComparison';
import { pingSeriesColor } from './pingChart';
import { ListColumn } from './ListColumn';

export function NetworkDiagnostics({ nodes, statuses, cards, monitor, onOpen }: { nodes: NodeInfo[]; statuses: Record<string, NodeStatus>; cards: boolean; monitor: ReturnType<typeof usePingMonitor>; onOpen: (node: NodeInfo) => void }) {
  const { tasks, hours, loading, error } = monitor;
  return <div className="network-diagnostics">
    <div className="ping-toolbar"><label><span>统计范围</span><select aria-label="延迟统计范围" value={hours} onChange={e => monitor.setHours(Number(e.target.value))}><option value={1}>近 1 小时</option><option value={6}>近 6 小时</option><option value={24}>近 24 小时</option></select></label><span className="ping-updated" role="status">{loading ? '正在更新延迟' : monitor.updated ? `采集于 ${monitor.updated.toLocaleTimeString('zh-CN', { hour12: false })}` : ''}</span><button className="icon-btn" aria-label="刷新延迟测试" onClick={monitor.refresh} disabled={loading}><RefreshCw size={15} /></button></div>
    {error && <div className="ping-notice" role="status"><span>{error} / 延迟数据未更新</span><button onClick={monitor.refresh}>重试</button></div>}
    {!tasks.length ? <div className="ping-no-tasks"><strong>{loading ? '正在读取延迟测试' : error ? '无法读取延迟测试' : '尚未配置延迟测试'}</strong>{!loading && !error && <><span>在 Komari 后台添加测试任务并分配节点。</span><a className="ef-btn small" href="/admin">管理测试任务</a></>}</div> : <div className={cards ? 'node-grid ping-grid' : 'multi-ping-table'} aria-busy={loading}>
      {!cards && <div className="multi-ping-columns list-columns" aria-hidden="true"><ListColumn icon={Server} label="节点" detail="地区 / 名称 / 状态" /><ListColumn icon={Activity} label="延迟趋势" detail="测试点 / ms" /></div>}
      {nodes.map(node => <MultiPingHost key={node.uuid} node={node} status={statuses[node.uuid]} cards={cards} monitor={monitor} onOpen={onOpen} />)}
    </div>}
  </div>;
}
function MultiPingHost({ node, status, cards, monitor, onOpen }: { node: NodeInfo; status?: NodeStatus; cards: boolean; monitor: ReturnType<typeof usePingMonitor>; onOpen: (node: NodeInfo) => void }) {
  const targets = monitor.tasks.filter(t => t.clients.includes(node.uuid) || monitor.summaries[t.id][node.uuid].total > 0);
  const health = monitor.health[node.uuid];
  const series = targets.map(task => ({ task, summary: monitor.summaries[task.id][node.uuid], failed: !!monitor.errors[task.id], color: pingSeriesColor(monitor.tasks.findIndex(t => t.id === task.id)) }));
  return <article className={cards ? `node-card ping-card multi-ping-host ${(health?.loss ?? 0) > 0 || health?.timedOut ? 'node-attention' : ''}` : `multi-ping-row ${status && !status.online ? 'node-offline' : ''} ${(health?.loss ?? 0) > 0 || health?.timedOut ? 'node-attention' : ''}`}>
    <button className={cards ? 'card-heading multi-host-link' : 'inventory-identity multi-host-link'} onClick={() => onOpen(node)} aria-label={`查看 ${node.name} 详情`}><RegionBadge region={node.region} /><span className="card-title"><strong>{node.name}</strong><span>{node.group} / {targets.length} 个测试点</span></span><StateBadge status={status} alert={false} /><ChevronRight size={14} /></button>
    <PingComparison series={series} loading={monitor.loading} paused={monitor.paused} offline={!!status && !status.online} />
    <div className="multi-host-footer"><div className="ping-card-bandwidth"><span><ArrowUp size={12} />{bytes(status?.online ? status.up : null, true)}</span><span><ArrowDown size={12} />{bytes(status?.online ? status.down : null, true)}</span></div><button onClick={() => onOpen(node)} aria-label={`查看 ${node.name} 延迟详情`}>延迟详情<ChevronRight size={13} /></button></div>
  </article>;
}
export function HostPingDetails({ node, status, monitor }: { node: NodeInfo; status?: NodeStatus; monitor: ReturnType<typeof usePingMonitor> }) {
  const series: PingSeries[] = monitor.tasks.filter(t => t.clients.includes(node.uuid) || (monitor.summaries[t.id]?.[node.uuid]?.total ?? 0) > 0).map(task => ({ task, summary: monitor.summaries[task.id][node.uuid], failed: !!monitor.errors[task.id], color: pingSeriesColor(monitor.tasks.findIndex(t => t.id === task.id)) }));
  return <section className="detail-ping"><div className="section-heading"><div><span className="ef-eyebrow slash">LATENCY TESTS</span><h3>延迟测试 <small>{series.length} 个测试点</small></h3></div><div className="history-actions"><select aria-label="详情延迟统计范围" value={monitor.hours} onChange={e => monitor.setHours(Number(e.target.value))}><option value={1}>近 1 小时</option><option value={6}>近 6 小时</option><option value={24}>近 24 小时</option></select><button className="icon-btn" aria-label="刷新主机延迟" onClick={monitor.refresh} disabled={monitor.loading}><RefreshCw size={15} /></button></div></div>
    {monitor.error && <div className="ping-notice" role="status">{monitor.error}</div>}
    <div className="detail-ping-targets" aria-busy={monitor.loading}>{series.length ? series.map(({ task, summary: s, failed, color }) => <div className="multi-target" key={task.id} data-task-id={task.id}>
      <span className="multi-target-name"><b title={task.name}><i className="ping-target-swatch" style={{ background: color }} aria-hidden="true" />{task.name}</b><small>{task.type} / 每 {task.interval} 秒{failed && <em>未更新</em>}</small></span>
      <span className="multi-target-latency"><strong>{!s.latest ? '—' : s.latest.value < 0 ? '超时' : milliseconds(s.latest.value)}</strong><small>平均 {milliseconds(s.avg)}</small></span>
      <span className="multi-target-loss"><small>丢包</small><b className={(s.loss ?? 0) > 0 ? 'ping-loss' : ''}>{s.loss == null ? '—' : `${s.loss.toFixed(1)}%`}</b></span>
      <span className="multi-target-trace"><PingTrace summary={s} color={color} bound loading={monitor.loading} failed={failed} paused={monitor.paused} offline={!!status && !status.online} /><small>{s.latest ? new Date(s.latest.time).toLocaleTimeString('zh-CN', { hour12: false }) : '暂无采样'}</small></span>
    </div>) : <div className="multi-target-empty">{monitor.loading ? '正在读取延迟测试' : '未分配延迟测试'}</div>}</div>
  </section>;
}
function PingTrace({ summary: s, color, bound, loading, failed, paused, offline }: { summary: PingSummary; color: string; bound: boolean; loading: boolean; failed: boolean; paused: boolean; offline: boolean }) {
  const valid = s.records.filter(r => r.value >= 0);
  if (!valid.length) return <span className="ping-trace"><span className="ping-trace-empty">{s.records.length ? '全部采样超时' : loading ? '正在读取记录' : failed ? '延迟记录读取失败' : paused ? '已暂停更新' : !bound ? '未分配此测试' : offline ? '主机离线 / 暂无记录' : '此范围内暂无采样'}</span></span>;
  const start = Date.parse(s.records[0].time), end = Date.parse(s.records.at(-1)!.time), max = Math.max(1, ...valid.map(r => r.value)) * 1.15;
  const segments: string[][] = [[]];
  s.records.forEach(r => {
    if (r.value < 0) segments.push([]);
    else segments.at(-1)!.push(`${4 + (Date.parse(r.time) - start) / Math.max(1, end - start) * 592},${82 - r.value / max * 74}`);
  });
  return <span className="ping-trace" style={{ color }}><svg viewBox="0 0 600 90" preserveAspectRatio="none" role="img" aria-label={`延迟趋势，${s.records.length} 次采样，${valid.length} 次成功，最高 ${milliseconds(Math.max(...valid.map(r => r.value)))}`}>
    {[20, 45, 70].map(y => <line key={y} className="ping-trace-grid" x1="0" x2="600" y1={y} y2={y} />)}
    {segments.filter(segment => segment.length > 0).map((segment, i) => segment.length === 1 ? <circle key={i} className="ping-trace-point" cx={segment[0].split(',')[0]} cy={segment[0].split(',')[1]} r="2.5" /> : <g key={i}><polygon className="ping-trace-area" points={`${segment[0].split(',')[0]},90 ${segment.join(' ')} ${segment.at(-1)!.split(',')[0]},90`} /><polyline className="ping-trace-line" points={segment.join(' ')} /></g>)}
  </svg>{valid.length === 1 && <span className="ping-single-caption">1 次有效采样</span>}</span>;
}
