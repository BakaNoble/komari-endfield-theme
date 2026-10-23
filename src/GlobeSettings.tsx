import { Network } from 'lucide-react';
import { Eyebrow } from './components';

interface Props {
  effects: boolean; concurrent: boolean; interval: number;
  onEffects: () => void; onConcurrent: () => void; onInterval: (value: string) => void; onReset: () => void;
}

export function GlobeSettings({ effects, concurrent, interval, onEffects, onConcurrent, onInterval, onReset }: Props) {
  return <section className="globe-settings" aria-labelledby="globe-settings-title">
    <Eyebrow>GLOBE CONFIGURATION</Eyebrow><h2 id="globe-settings-title">交互地球</h2>
    <div className="setting-row"><span>节点流量特效<small>流量示意动画</small></span><button className="ef-btn settings-toggle" role="switch" aria-label="节点流量特效" aria-checked={effects} onClick={onEffects}><Network size={14} />{effects ? '开启' : '关闭'}</button></div>
    <div className="setting-row"><span>多台并发<small>多个节点可同时发送</small></span><button className="ef-btn settings-toggle" role="switch" aria-label="多台并发" aria-checked={concurrent} onClick={onConcurrent} disabled={!effects}>{concurrent ? '开启' : '关闭'}</button></div>
    <label className="setting-row" htmlFor="traffic-send-interval"><span>发送间隔<small>{concurrent ? '每台主机独立计时' : '全局共享间隔'}</small></span><span className="traffic-frequency"><output htmlFor="traffic-send-interval">{interval}–{interval + 3} 秒</output><input id="traffic-send-interval" type="range" min="2" max="30" step="1" aria-label="流量发送间隔" aria-valuetext={`${interval} 至 ${interval + 3} 秒`} value={interval} disabled={!effects} style={{ backgroundSize: `${(interval - 2) / 28 * 100}% 3px, 100% 3px` }} onChange={e => onInterval(e.target.value)} /></span></label>
    <button className="ef-btn" onClick={onReset}>恢复地球默认设置</button>
  </section>;
}
