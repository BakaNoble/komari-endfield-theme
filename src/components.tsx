import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { bytes, percent, warning, type NodeInfo, type NodeStatus } from './model';
import { usePointerTilt, type TiltScope } from './usePointerTilt';
import { observeInstrument } from './instrumentMotion';

export function Eyebrow({ children }: { children: ReactNode }) { return <span className="ef-eyebrow slash">{children}</span>; }
export function Logo() { return <svg width="30" height="30" viewBox="0 0 40 40" aria-hidden="true"><path fill="currentColor" d="M4 4h11v32H4zm18 0h14L22 22zm0 24h14v8H22z" /></svg>; }
export function Meter({ value, threshold = 85, segments = false }: { value: number | null; threshold?: number; segments?: boolean }) {
  return <span className={`meter ${segments ? 'segmented' : ''} ${value != null && value >= threshold ? 'high' : ''}`} aria-hidden="true"><span style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} /></span>;
}
export function Resource({ value, label, threshold }: { value: number | null; label: string; threshold: number }) {
  return <span className="row-resource"><span className="mobile-label">{label}</span><span className="row-value">{value == null ? '—' : value.toFixed(1)}{value != null && <small>%</small>}</span><Meter value={value} threshold={threshold} /></span>;
}
export function NetworkValue({ value, direction }: { value: number | null; direction: 'up' | 'down' }) {
  const Icon = direction === 'up' ? ArrowUp : ArrowDown;
  return <span className="network-value"><Icon size={12} aria-label={direction === 'up' ? '上传' : '下载'} /><span>{bytes(value, true)}</span></span>;
}
export function StateBadge({ status, alert }: { status: NodeStatus | undefined; alert: boolean }) {
  return <span className={`state-badge ${status ? (status.online ? (alert ? 'attention' : 'online') : 'offline') : 'pending'}`}><i />{status ? (status.online ? (alert ? '高负载' : '在线') : '离线') : '等待上报'}</span>;
}
export function StatusRing({ nodes, statuses, threshold, scope = 'component', active = true }: { nodes: NodeInfo[]; statuses: Record<string, NodeStatus>; threshold: number; scope?: TiltScope; active?: boolean }) {
  const tiltRef = usePointerTilt(scope);
  const hatchId = `offline-hatch-${useId().replaceAll(':', '')}`;
  const online = nodes.filter(n => statuses[n.uuid]?.online).length;
  const known = nodes.some(n => !!statuses[n.uuid]);
  const ratio = nodes.length ? online / nodes.length : 0;
  const r = 92, c = 2 * Math.PI * r;
  useEffect(() => {
    if (tiltRef.current) return observeInstrument(tiltRef.current, active && known);
  }, [tiltRef, active, known]);
  // Each sector represents one actual node; status and alerts share the list semantics.
  return <div className="status-ring" ref={tiltRef} role="img" aria-label={known ? `${nodes.length} 个节点，${online} 个在线，在线率 ${(ratio * 100).toFixed(0)}%` : `${nodes.length} 个节点，等待状态上报`}>
    <svg className="ring-frame" viewBox="-24 -24 288 288" aria-hidden="true">
      <path d="M-17 12V-8H3M237-8h20v20M257 228v20h-20M3 248h-20v-20" className="ring-chassis" />
      <path d="M-22 120h12m240 0h12M120-22v9m0 266v9" className="ring-chassis" />
    </svg>
    <div className="ring-scene">
    <svg viewBox="-24 -24 288 288" aria-hidden="true">
      <defs><pattern id={hatchId} patternUnits="userSpaceOnUse" width="5" height="5"><path d="M-1 1L1-1M0 5L5 0M4 6L6 4" stroke="currentColor" strokeWidth="1" /></pattern></defs>
      <circle cx="120" cy="120" r="137" className="ring-boundary" />
      <g className="ring-rotor ring-rotor-outer"><circle cx="120" cy="120" r="132" className="ring-mechanical" strokeDasharray="86 20 6 20 6 277" /></g>
      <g className="ring-scale">{Array.from({ length: 61 }, (_, i) => <path key={i} className={i <= ratio * 60 && known ? 'lit' : ''} d={`M120 7v${i % 5 === 0 ? 7 : 3}`} transform={`rotate(${-135 + i * 4.5} 120 120)`} />)}</g>
      <g className="ring-scale-labels">{[0, 25, 50, 75, 100].map(value => {
        const angle = (-225 + value * 2.7) * Math.PI / 180;
        return <text key={value} x={120 + Math.cos(angle) * 122} y={120 + Math.sin(angle) * 122}>{value}</text>;
      })}</g>
      <circle cx="120" cy="120" r="104" className="ring-rate-track" pathLength="100" strokeDasharray="75 25" transform="rotate(135 120 120)" />
      <circle cx="120" cy="120" r="104" className="ring-reading" pathLength="100" strokeDasharray={`${ratio * 75} 100`} transform="rotate(135 120 120)" />
      <circle cx="120" cy="120" r={r} className="ring-rail" />
      {nodes.length ? nodes.map((n, i) => {
        const s = statuses[n.uuid];
        const sector = Math.max(.1, c / nodes.length - Math.min(7, c / nodes.length * .16));
        return <circle key={n.uuid} cx="120" cy="120" r={r} fill="none" strokeWidth="7"
          className={`ring-segment ${!s ? 'unknown' : !s.online ? 'off' : warning(n, s, threshold) ? 'warn' : ''}`}
          style={{ '--ring-sector': sector, '--ring-delay': `${Math.min(i * 38, 180)}ms`, stroke: s && !s.online ? `url(#${hatchId})` : undefined } as CSSProperties}
          strokeDasharray={`${sector} ${c}`}
          transform={`rotate(${i * 360 / nodes.length - 90} 120 120)`} />;
      }) : <circle cx="120" cy="120" r={r} fill="none" strokeWidth="7" className="ring-segment unknown" />}
      <circle cx="120" cy="120" r="78" className="ring-core" />
      <g className="ring-rotor ring-rotor-inner"><circle cx="120" cy="120" r="81" className="ring-inner" strokeDasharray="66 61" /><path d="M117 39h6M117 201h6" className="ring-coupler" /></g>
      <path d="M51 112v16m138-16v16M112 51h16m-16 138h16" className="ring-core-cross" />
      {known && <g className="ring-needle" style={{ transform: `rotate(${-135 + ratio * 270}deg)` }}><path d="M120 3l-3 9h6zM120 12v8" /></g>}
      <g className="ring-bottom-scale">{Array.from({ length: 17 }, (_, i) => <path key={i} d="M120 248v5" transform={`rotate(${(i - 8) * 2.4} 120 120)`} />)}</g>
      <text x="120" y="236" className="ring-rate-label">在线率 {known ? `${(ratio * 100).toFixed(0)}%` : '—'}</text>
    </svg>
    <div className="ring-label" aria-hidden="true"><span className="eyebrow">ONLINE NODES</span><div><strong key={`${known}:${online}`} className="ring-count">{known ? String(online).padStart(2, '0') : '—'}</strong><span>/{String(nodes.length).padStart(2, '0')}</span></div><span className="ring-caption">在线节点</span><span className="ring-runtime"><i />{!known ? '等待上报' : active ? '监测中' : '待更新'}</span></div>
    </div>
  </div>;
}
export function Chart({ values, times, format = v => `${v.toFixed(0)}%`, max, label, compact = false }: {
  values: (number | null)[]; times?: string[]; format?: (v: number) => string; max?: number; label: string; compact?: boolean;
}) {
  const fillId = `chart-fill-${useId().replaceAll(':', '')}`;
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
  const width = 600, height = compact ? 80 : 165;
  const ceiling = max ?? Math.max(1, ...valid) * 1.15;
  const points = values.map((v, i) => v == null ? null : `${i / Math.max(1, values.length - 1) * width},${height - Math.min(ceiling, v) / ceiling * (height - 10) - 5}`);
  const segments: string[][] = [[]];
  points.forEach(p => { if (p === null) segments.push([]); else segments[segments.length - 1].push(p); });
  const time = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return <div className={`chart ${compact ? 'compact' : ''}`} role="img" aria-label={`${label}，${valid.length ? `当前 ${format(valid[valid.length - 1])}，最高 ${format(Math.max(...valid))}` : '暂无数据'}`}>
    {!compact && <div className="chart-scale"><span>{format(ceiling)}</span><span>{format(ceiling / 2)}</span><span>{format(0)}</span></div>}
    <div className="chart-plot">
      {valid.length >= 2 ? <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id={fillId} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M1 0v10" stroke="currentColor" strokeWidth="1" opacity=".12" /></pattern></defs>
        {[.25, .5, .75, 1].map(y => <line key={y} x1="0" x2={width} y1={y * (height - 10)} y2={y * (height - 10)} className="chart-grid" />)}
        {segments.filter(s => s.length > 1).map((s, i) => <g key={`fill-${i}`} className="chart-area"><polygon points={`${s[0].split(',')[0]},${height} ${s.join(' ')} ${s[s.length - 1].split(',')[0]},${height}`} /><polygon points={`${s[0].split(',')[0]},${height} ${s.join(' ')} ${s[s.length - 1].split(',')[0]},${height}`} fill={`url(#${fillId})`} /></g>)}
        {segments.filter(s => s.length > 1).map((s, i) => <polyline key={i} points={s.join(' ')} className="chart-line" />)}
      </svg> : <span className="chart-empty">{compact ? '等待采样' : '暂无记录'}</span>}
      {!compact && times && times.length > 1 && <div className="chart-times"><span>{time(times[0])}</span><span>{time(times[Math.floor(times.length / 2)])}</span><span>{time(times[times.length - 1])}</span></div>}
    </div>
  </div>;
}
export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  function requestClose() {
    if (closing) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { closeRef.current(); return; }
    setClosing(true);
    timer.current = setTimeout(() => { closeRef.current(); setClosing(false); }, 240);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) { dialog.showModal(); document.body.style.overflow = 'hidden'; }
    if (!open && dialog.open) dialog.close();
    return () => { document.body.style.overflow = ''; if (dialog.open) dialog.close(); };
  }, [open]);
  return <dialog ref={ref} className={`detail-dialog ${wide ? 'wide' : ''} ${closing ? 'closing' : ''}`} aria-label={title}
    onCancel={event => { event.preventDefault(); requestClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestClose(); } }}>
    <div className="dialog-header"><span className="ef-eyebrow">{title}</span><button className="icon-btn" onClick={requestClose} aria-label="关闭面板"><X size={20} /></button></div>
    {children}
  </dialog>;
}
export function ResourceSummary({ nodes, statuses, threshold }: { nodes: NodeInfo[]; statuses: Record<string, NodeStatus>; threshold: number }) {
  const online = nodes.filter(n => statuses[n.uuid]?.online);
  const cpuNodes = online.filter(n => statuses[n.uuid].cpu != null);
  const cpuCores = cpuNodes.reduce((a, n) => a + Math.max(1, n.cpu_cores), 0);
  const cpu = cpuCores ? cpuNodes.reduce((a, n) => a + statuses[n.uuid].cpu! * Math.max(1, n.cpu_cores), 0) / cpuCores : null;
  const memNodes = online.filter(n => statuses[n.uuid].ram != null);
  const memory = percent(memNodes.reduce((a, n) => a + statuses[n.uuid].ram!, 0), memNodes.reduce((a, n) => a + n.mem_total, 0));
  return <div className="resource-summary">
    <div className="summary-label"><Eyebrow>RESOURCE USAGE</Eyebrow><span>资源使用率</span></div>
    {[['CPU', cpu], ['内存', memory]] .map(([label, value]) => <div className="summary-resource" key={String(label)}>
      <div><span className="ef-field">{label}</span></div>
      <strong>{value == null ? '—' : Number(value).toFixed(1)}{value != null && <small>%</small>}</strong><Meter value={value as number | null} threshold={threshold} segments />
    </div>)}
  </div>;
}
