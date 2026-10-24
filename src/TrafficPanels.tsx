import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { bytes, type NodeInfo } from './model';
import { RegionBadge } from './RegionBadge';
import { trafficSegments, type TrafficField } from './traffic';
import type { useTrafficMonitor } from './useTrafficMonitor';

type Monitor = ReturnType<typeof useTrafficMonitor>;
const clock = (time: number) => new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
function TrafficStatus({ monitor, ranking = false }: { monitor: Monitor; ranking?: boolean }) {
  return <div className="traffic-empty" role="status"><span>{monitor.error || (monitor.loading ? '正在读取流量记录…' : monitor.paused && !monitor.summary ? '已暂停更新' : ranking ? '暂无流量消耗记录' : '近 24 小时暂无流量记录')}</span>
    {monitor.error && !ranking && <button className="text-button" onClick={monitor.refresh}><RefreshCw size={12} />重新加载</button>}
  </div>;
}

export function TrafficHistory({ monitor }: { monitor: Monitor }) {
  const [mode, setMode] = useState<'cumulative' | 'rate'>('cumulative');
  const [hovered, setHovered] = useState<number | null>(null);
  const summary = monitor.summary, points = summary?.points ?? [];
  const fields: TrafficField[] = mode === 'rate' ? ['upRate', 'downRate'] : ['upCumulative', 'downCumulative'];
  const format = (value: number | null) => bytes(value, mode === 'rate');
  const values = points.flatMap(point => fields.map(field => point[field])).filter((v): v is number => v !== null);
  const ceiling = Math.max(1, values.reduce((max, value) => Math.max(max, value), 0)) * 1.12;
  const series = useMemo(() => summary ? fields.map(field => trafficSegments(points, field, summary.start, summary.end, ceiling)) : [], [summary, mode, ceiling]);
  const index = hovered === null ? null : Math.min(points.length - 1, Math.max(0, hovered));
  const focused = index === null ? undefined : points[index];
  const latest = points.at(-1);
  const readings = focused ? fields.map(field => focused[field]) : mode === 'cumulative' ? [summary?.totalUp ?? null, summary?.totalDown ?? null] : fields.map(field => latest?.[field] ?? null);
  function inspect(clientX: number, rect: DOMRect) {
    if (!summary || !points.length) return;
    const time = summary.start + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (summary.end - summary.start);
    let nearest = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].time - time) < Math.abs(points[nearest].time - time)) nearest = i;
    setHovered(nearest);
  }
  return <section className="traffic-history" aria-label="最近24小时流量" aria-busy={monitor.loading}>
    <div className="traffic-panel-heading"><h3>最近 24 小时流量</h3><div className="traffic-modes" role="group" aria-label="流量图表指标">
      <button className="ef-chip" aria-pressed={mode === 'cumulative'} onClick={() => setMode('cumulative')}>累计</button><button className="ef-chip" aria-pressed={mode === 'rate'} onClick={() => setMode('rate')}>速率</button>
    </div></div>
    {summary && values.length ? <>
      <div className="traffic-readings">{readings.map((value, i) => <div key={i} className={i ? 'traffic-down' : 'traffic-up'}><span>{i ? <ArrowDown size={11} /> : <ArrowUp size={11} />}{i ? '下载' : '上传'}</span><strong>{format(value)}</strong></div>)}</div>
      <div className="traffic-chart">
        <div className="traffic-scale" aria-hidden="true"><span>{format(ceiling)}</span><span>{format(ceiling / 2)}</span><span>0</span></div>
        <div className="traffic-chart-body"><div className="traffic-plot" tabIndex={0} role="img" aria-label={`近24小时${mode === 'rate' ? '网络速率' : '累计流量'}，上传 ${format(readings[0])}，下载 ${format(readings[1])}。左右方向键查看采样。`}
          onPointerMove={e => inspect(e.clientX, e.currentTarget.getBoundingClientRect())} onPointerLeave={() => setHovered(null)} onBlur={() => setHovered(null)}
          onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); setHovered(e.key === 'Home' ? 0 : e.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (index ?? points.length - 1) + (e.key === 'ArrowRight' ? 1 : -1)))); } }}>
          <svg viewBox="0 0 560 130" preserveAspectRatio="none" aria-hidden="true">
            {[4, 65, 126].map(y => <line key={y} x1="0" x2="560" y1={y} y2={y} className="traffic-grid" />)}
            {series.map((segments, i) => <g key={i} className={i ? 'traffic-down' : 'traffic-up'}>{segments.map((segment, j) => segment.length === 1 ? <circle key={j} cx={segment[0].x} cy={segment[0].y} r="2" fill="currentColor" /> : <g key={j}>
              <path d={`M${segment[0].x} 130 ${segment.map(p => `L${p.x} ${p.y}`).join(' ')} L${segment.at(-1)!.x} 130Z`} fill="currentColor" opacity=".07" />
              <polyline points={segment.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
            </g>)}</g>)}
            {focused && <g><line x1={(focused.time - summary.start) / (summary.end - summary.start) * 560} x2={(focused.time - summary.start) / (summary.end - summary.start) * 560} y1="0" y2="130" className="traffic-cursor" />
              {fields.map((field, i) => focused[field] === null ? null : <circle key={field} className={i ? 'traffic-down' : 'traffic-up'} cx={(focused.time - summary.start) / (summary.end - summary.start) * 560} cy={130 - focused[field]! / ceiling * 122 - 4} r="3" fill="currentColor" />)}
            </g>}
          </svg>
        </div><div className="traffic-times" aria-hidden="true"><span>{clock(summary.start)}</span><span>{clock((summary.start + summary.end) / 2)}</span><span>{clock(summary.end)}</span></div></div>
      </div>
      <div className="traffic-chart-footer"><span>{focused ? new Date(focused.time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : mode === 'cumulative' ? '24 小时内累计' : '上传 / 下载速率'}</span><span>{monitor.error ? '更新失败' : monitor.loading ? '更新中' : monitor.paused ? '已暂停' : '24h'}</span></div>
      {monitor.error && <p className="traffic-update-error" role="status">{monitor.error}<button className="text-button" onClick={monitor.refresh}>重试</button></p>}
    </> : <TrafficStatus monitor={monitor} />}
  </section>;
}

export function TrafficRanking({ monitor, nodes, onOpen }: { monitor: Monitor; nodes: NodeInfo[]; onOpen: (node: NodeInfo) => void }) {
  const names = new Map(nodes.map(node => [node.uuid, node]));
  const ranking = monitor.summary?.ranking.filter(row => names.has(row.uuid)).slice(0, 3) ?? [];
  const maximum = ranking[0]?.total || 1;
  return <section className="traffic-ranking" aria-label="24小时流量消耗排名" aria-busy={monitor.loading}>
    <div className="traffic-panel-heading"><h3>流量消耗</h3><span className="traffic-rank-label">{ranking.length ? `TOP ${ranking.length}` : '24h'}<small>近 24 小时</small></span></div>
    {ranking.length ? <ol>{ranking.map((row, i) => {
      const node = names.get(row.uuid)!;
      return <li key={row.uuid}><button className="traffic-rank-row" onClick={() => onOpen(node)} aria-label={`第${i + 1}名 ${node.name}，流量 ${bytes(row.total)}，查看主机详情`} title={`上传 ${bytes(row.up)} / 下载 ${bytes(row.down)}`}>
        <span className="traffic-rank-number">{String(i + 1).padStart(2, '0')}</span><span className="traffic-rank-host"><RegionBadge region={node.region} /><span>{node.name}</span></span><strong>{bytes(row.total)}</strong>
        <span className="traffic-rank-track" aria-hidden="true"><i className="traffic-up-fill" style={{ width: `${(row.up ?? 0) / maximum * 100}%` }} /><i className="traffic-down-fill" style={{ width: `${(row.down ?? 0) / maximum * 100}%` }} /></span>
      </button></li>;
    })}</ol> : <TrafficStatus monitor={monitor} ranking />}
    {ranking.length > 0 && <div className="traffic-rank-legend"><span className="traffic-up"><i />上传</span><span className="traffic-down"><i />下载</span><span>按上传 + 下载排序</span></div>}
  </section>;
}
