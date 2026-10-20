import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Cpu, HardDrive, MemoryStick, Network, RotateCw } from 'lucide-react';
import { history } from './api';
import { demoHistory } from './demo';
import { bytes, duration, percent, traffic, warning, type HistoryRecord, type NodeInfo, type NodeStatus } from './model';
import { Chart, Eyebrow, Meter, Modal, StateBadge } from './components';
import { expiryInfo } from './expiry';
import { HostPingDetails } from './NetworkDiagnostics';
import type { usePingMonitor } from './usePingMonitor';

export default function Detail({ node, status, onClose, demo, threshold, stale, ping }: {
  node: NodeInfo | null; status: NodeStatus | undefined; onClose: () => void; demo: boolean; threshold: number; stale: boolean;
  ping?: ReturnType<typeof usePingMonitor>;
}) {
  const [hours, setHours] = useState(6);
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [chart, setChart] = useState<'cpu' | 'ram' | 'network'>('cpu');
  useEffect(() => {
    if (!node) return;
    let stopped = false;
    setLoading(true); setError(''); setRecords([]);
    const load = demo ? Promise.resolve(demoHistory(node.uuid, hours)) : history(node.uuid, hours);
    load.then(data => { if (!stopped) setRecords(data); }).catch(e => { if (!stopped) setError(e instanceof Error ? e.message : '历史记录加载失败。'); })
      .finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [node?.uuid, hours, demo, revision]);
  const s = status; const active = s?.online;
  const expiry = expiryInfo(node?.expired_at);
  const metrics = node ? [
    { icon: Cpu, label: 'CPU', value: active ? s.cpu : null, help: `${node.cpu_cores} 核心 / ${node.arch || '未知架构'}` },
    { icon: MemoryStick, label: '内存', value: active ? percent(s.ram, node.mem_total) : null, help: `${bytes(s?.ram)} / ${bytes(node.mem_total)}` },
    { icon: HardDrive, label: '磁盘', value: active ? percent(s.disk, node.disk_total) : null, help: `${bytes(s?.disk)} / ${bytes(node.disk_total)}` },
  ] : [];
  return <Modal open={!!node} onClose={onClose} title="NODE DETAILS / 节点详情" wide>
    {node && <div className="detail-body">
      <div className="detail-title"><Eyebrow>{node.region || 'NODE'} / {node.group}</Eyebrow><h2>{node.name}</h2><StateBadge status={s} alert={warning(node, s, threshold)} /></div>
      {stale && <p className="inline-notice">数据未更新</p>}
      <div className="detail-specs"><span>{node.os || '系统信息未提供'}</span><span>{node.cpu_name || '处理器信息未提供'}</span><span>{node.virtualization || '未知虚拟化'}</span></div>
      {ping && <HostPingDetails node={node} status={s} monitor={ping} />}
      <div className="detail-metrics">{metrics.map(m => <section key={m.label}>
        <div><m.icon size={16} /><span>{m.label}</span></div><strong>{m.value == null ? '—' : m.value.toFixed(1)}<small>{m.value != null && '%'}</small></strong><Meter value={m.value} threshold={threshold} /><p>{m.help}</p>
      </section>)}</div>
      <section className="history-section">
        <div className="section-heading"><div><Eyebrow>HISTORY</Eyebrow><h3>历史记录</h3></div><div className="history-actions">
          <label className="sr-only" htmlFor="history-range">历史时间范围</label><select id="history-range" value={hours} onChange={e => setHours(Number(e.target.value))}><option value={1}>近 1 小时</option><option value={6}>近 6 小时</option><option value={24}>近 24 小时</option><option value={72}>近 3 天</option></select>
          <button className="icon-btn" aria-label="刷新历史记录" disabled={loading} onClick={() => setRevision(r => r + 1)}><RotateCw size={16} /></button>
        </div></div>
        <div className="chart-tabs" role="tablist" aria-label="历史指标">{[['cpu', 'CPU'], ['ram', '内存'], ['network', '下载流量']] .map(([key, label]) => <button key={key} role="tab" aria-selected={chart === key} onClick={() => setChart(key as typeof chart)}>{label}</button>)}</div>
        <div className="history-chart" aria-busy={loading} role="tabpanel" aria-label="历史曲线">
          {loading ? <div className="loading-state">正在读取历史记录…</div> : error ? <div className="chart-error"><p>{error}</p><button className="ef-btn small" onClick={() => setRevision(r => r + 1)}>重新加载</button></div> : <Chart
            label={chart === 'cpu' ? 'CPU 使用率' : chart === 'ram' ? '内存使用率' : '下载速率'}
            times={records.map(r => r.time)} values={records.map(r => chart === 'cpu' ? r.cpu : chart === 'ram' ? percent(r.ram, node.mem_total) : r.net_in)}
            max={chart === 'network' ? undefined : 100} format={chart === 'network' ? v => bytes(v, true) : undefined} />}
        </div>
      </section>
      <section className="detail-network"><div className="section-heading"><div><Eyebrow>NETWORK</Eyebrow><h3>网络与流量</h3></div><Network size={20} /></div>
        <div className="network-pair"><div><span><ArrowUp size={14} />上传速率</span><strong>{bytes(active ? s.up : null, true)}</strong></div><div><span><ArrowDown size={14} />下载速率</span><strong>{bytes(active ? s.down : null, true)}</strong></div></div>
        <dl className="detail-facts"><div><dt>累计上传</dt><dd>{bytes(s?.totalUp)}</dd></div><div><dt>累计下载</dt><dd>{bytes(s?.totalDown)}</dd></div><div><dt>流量额度</dt><dd>{node.traffic_limit ? `${bytes(traffic(node, s))} / ${bytes(node.traffic_limit)}` : '未设置'}</dd></div><div><dt>持续运行</dt><dd>{active ? duration(s.uptime) : '—'}</dd></div><div><dt>TCP / UDP 连接</dt><dd>{active ? `${s.tcp ?? '—'} / ${s.udp ?? '—'}` : '—'}</dd></div><div><dt>最后上报</dt><dd>{s?.time && Number.isFinite(Date.parse(s.time)) ? new Date(s.time).toLocaleString('zh-CN', { hour12: false }) : '—'}</dd></div>{expiry && <div><dt>到期时间</dt><dd title={expiry.full}>{expiry.date} / {expiry.label}</dd></div>}</dl>
      </section>
      {node.tags && <div className="detail-tags">{node.tags.split(/[;,]/).filter(Boolean).map((tag, i) => <span key={`${tag}-${i}`}>{tag}</span>)}</div>}
      {node.public_remark && <p className="public-remark">{node.public_remark}</p>}
      <p className="detail-id">UUID / {node.uuid}</p>
    </div>}
  </Modal>;
}
