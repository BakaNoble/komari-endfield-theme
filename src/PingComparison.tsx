import { useState } from 'react';
import { milliseconds, type PingSummary, type PingTask } from './ping';
import { pingChart } from './pingChart';

export interface PingSeries { task: PingTask; summary: PingSummary; failed: boolean; color: string }
const clock = (value: number) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

export function PingComparison({ series, loading, paused, offline }: { series: PingSeries[]; loading: boolean; paused: boolean; offline: boolean }) {
  const [highlight, setHighlight] = useState<number | null>(null);
  const selected = series.some(s => s.task.id === highlight) ? highlight : null;
  const chart = pingChart(series.map(s => s.summary));
  const empty = !series.length ? '未分配延迟测试' : series.some(s => s.summary.records.length) ? '全部采样超时' : loading ? '正在读取记录' : series.some(s => s.failed) ? '延迟记录读取失败' : paused ? '已暂停更新' : offline ? '主机离线 / 暂无记录' : '此范围内暂无采样';
  return <div className="ping-comparison">
    <div className="ping-comparison-caption"><span>延迟 / ms</span>{series.some(s => s.failed) && <span className="ping-stale-mark">部分未更新</span>}</div>
    <div className="ping-comparison-chart">
      <div className="ping-comparison-scale" aria-hidden="true"><span>{chart.valid ? chart.ceiling : '—'}</span><span>{chart.valid ? (chart.ceiling / 2).toFixed(chart.ceiling < 2 ? 1 : 0) : '—'}</span><span>{chart.valid ? '0' : '—'}</span></div>
      <div className="ping-comparison-plot">
        <svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label={`多测试点延迟趋势，${series.length} 个测试点，${chart.valid} 次成功采样`}>
          {[8, 79, 150].map(y => <line key={y} className="ping-trace-grid" x1="0" x2="600" y1={y} y2={y} />)}
          {series.map((s, index) => <g key={s.task.id} data-task-id={s.task.id} className="ping-comparison-series" style={{ color: s.color }} opacity={selected == null || selected === s.task.id ? 1 : .12}>
            {chart.series[index].map((segment, i) => segment.length === 1 ? <circle key={i} className="ping-trace-point" cx={segment[0].x} cy={segment[0].y} r="2.5" /> : <polyline key={i} className="ping-comparison-line" points={segment.map(p => `${p.x},${p.y}`).join(' ')} />)}
          </g>)}
        </svg>
        {!chart.valid && <span className="ping-comparison-empty">{empty}</span>}
        <div className="ping-comparison-times" aria-hidden="true"><span>{chart.start == null ? '—' : clock(chart.start)}</span><span>{chart.start == null || chart.end == null || chart.start === chart.end ? '' : clock((chart.start + chart.end) / 2)}</span><span>{chart.end == null || chart.end === chart.start ? '' : clock(chart.end)}</span></div>
      </div>
    </div>
    <div className="ping-comparison-legend" role="group" aria-label="测试点图例">{series.map(s => <button key={s.task.id} className={selected === s.task.id ? 'is-highlighted' : ''} aria-pressed={selected === s.task.id} aria-label={`突出显示 ${s.task.name}`} onClick={() => setHighlight(selected === s.task.id ? null : s.task.id)}>
      <svg viewBox="0 0 24 6" aria-hidden="true" style={{ color: s.color }}><line className="ping-comparison-line" x1="0" x2="24" y1="3" y2="3" /></svg>
      <span className="ping-legend-name" title={s.task.name}>{s.task.name}</span><strong className={s.summary.latest && s.summary.latest.value < 0 ? 'ping-loss' : ''}>{!s.summary.latest ? '—' : s.summary.latest.value < 0 ? '超时' : milliseconds(s.summary.latest.value)}</strong>{s.failed && <small>未更新</small>}
    </button>)}</div>
  </div>;
}
