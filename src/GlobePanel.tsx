import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Pause, Play, Plus, RotateCcw, Settings2 } from 'lucide-react';
import earth from './data/earth.json';
import type { NodeInfo, NodeStatus } from './model';
import { locateRegions, type Coordinates } from './globeModel';
import { createGlobe, type GlobeController } from './globeCanvas';
import { RegionBadge } from './RegionBadge';
import { Eyebrow } from './components';
import { regionCode } from './region';
import type { TrafficNode } from './globeTraffic';

const centers: Record<string, Coordinates> = Object.fromEntries(Object.entries(earth.centers).map(([code, [lon, lat]]) => [code, [lon, lat] as Coordinates]));
const names = new Intl.DisplayNames(['zh-CN'], { type: 'region' });

export default function GlobePanel({ nodes, statuses, dark, accent, selected, onSelect, trafficEffects, trafficInterval, trafficConcurrent, onSettings }: {
  nodes: NodeInfo[]; statuses: Record<string, NodeStatus>; dark: boolean; accent: string; selected: string; onSelect: (region: string) => void; trafficEffects: boolean; trafficInterval: number; trafficConcurrent: boolean; onSettings: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), controller = useRef<GlobeController | null>(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  const [running, setRunning] = useState(false), [reduced, setReduced] = useState(false), [unavailable, setUnavailable] = useState(false);
  const { regions, unlocated } = useMemo(() => locateRegions(nodes, statuses, centers), [nodes, statuses]);
  const trafficNodes = useMemo<TrafficNode[]>(() => nodes.flatMap(node => {
    const code = regionCode(node.region), coordinates = code ? centers[code] : undefined;
    return statuses[node.uuid]?.online && code && coordinates ? [{ id: node.uuid, code, coordinates, online: 1 }] : [];
  }), [nodes, statuses]);
  const online = nodes.filter(node => statuses[node.uuid]?.online).length;
  useEffect(() => {
    if (!canvas.current) return;
    controller.current = createGlobe(canvas.current, earth.land, { onRunning: setRunning, onReduced: setReduced, onSelect: code => selectRef.current(code) });
    if (!controller.current) setUnavailable(true);
    return () => { controller.current?.destroy(); controller.current = null; };
  }, []);
  useEffect(() => { controller.current?.update({ regions, selected, dark, accent, trafficEffects, trafficInterval, trafficConcurrent, trafficNodes }); }, [regions, selected, dark, accent, trafficEffects, trafficInterval, trafficConcurrent, trafficNodes]);
  useEffect(() => { if (selected !== 'all' && centers[selected]) controller.current?.focus(centers[selected]); }, [selected]);
  return <div className="globe-panel">
    <header className="globe-heading"><div><Eyebrow>GLOBAL NETWORK</Eyebrow><h3>全球节点<small>{trafficEffects && !reduced ? '地区 / 流量示意' : '地区示意'}</small></h3></div><div className="globe-online"><span>在线节点</span><strong>{String(online).padStart(2, '0')}<small>/{String(nodes.length).padStart(2, '0')}</small></strong></div></header>
    <div className="globe-workspace"><div className="globe-instrument">
      <div className="globe-stage">{unavailable ? <p className="globe-empty">浏览器无法显示地球</p> : <canvas ref={canvas} tabIndex={0} aria-label={`节点地区地球，${regions.length} 个可定位地区。仅绕 Y 轴旋转，拖动或使用左右方向键调整，加减键缩放，Home 复位。下方按钮可定位并筛选地区。`} />}</div>
      <div className="globe-controls"><button onClick={() => controller.current?.toggle()} aria-pressed={running} disabled={reduced || unavailable} aria-label={running ? '暂停地球旋转' : '开始地球旋转'} title={reduced ? '系统已启用减少动态效果' : undefined}>{running ? <Pause size={13} /> : <Play size={13} />}<span>{running ? '暂停旋转' : '开始旋转'}</span></button><span className="globe-control-spacer" /><button aria-label="缩小地球" onClick={() => controller.current?.zoom(-.15)} disabled={unavailable}><Minus size={15} /></button><button aria-label="放大地球" onClick={() => controller.current?.zoom(.15)} disabled={unavailable}><Plus size={15} /></button><button aria-label="复位地球视角" onClick={() => controller.current?.reset()} disabled={unavailable}><RotateCcw size={14} /></button><button aria-label="打开交互地球设置" title="地球设置" onClick={onSettings}><Settings2 size={15} /></button></div>
    </div><div className="globe-index"><div className="globe-index-heading"><span>地区索引 <b>{String(regions.length).padStart(2, '0')}</b></span><button aria-label="显示全部地区" aria-pressed={selected === 'all'} onClick={() => onSelect('all')}>全部</button></div>
      <div className="globe-regions" role="group" aria-label="按地球地区筛选">{regions.map(region => <button key={region.code} className={region.online ? 'region-active' : 'region-inactive'} aria-pressed={selected === region.code} aria-label={`${names.of(region.code)}，${region.online} / ${region.total} 在线`} onClick={() => { if (selected === region.code) controller.current?.focus(region.coordinates); onSelect(region.code); }}><RegionBadge region={region.code} /><span className="globe-region-name"><span>{names.of(region.code)}</span><small>{region.code}</small></span><b>{region.online}<small>/{region.total}</small></b></button>)}</div>
      {unlocated > 0 && <p className="globe-unlocated">{unlocated} 个节点无可定位地区</p>}
    </div></div>
  </div>;
}
