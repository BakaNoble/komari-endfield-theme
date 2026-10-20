import type { PingSummary } from './ping';

// Every target uses the same measured time domain and latency scale.
export function pingChart(summaries: PingSummary[]) {
  let start = Infinity, end = -Infinity, peak = 0, valid = 0;
  for (const summary of summaries) for (const record of summary.records) {
    const time = Date.parse(record.time);
    start = Math.min(start, time); end = Math.max(end, time);
    if (record.value >= 0) { peak = Math.max(peak, record.value); valid++; }
  }
  const ceiling = Math.max(1, Math.ceil(peak * 1.15));
  const series = summaries.map(summary => {
    const segments: { x: number; y: number }[][] = [[]];
    for (const record of summary.records) {
      if (record.value < 0) segments.push([]);
      else segments.at(-1)!.push({ x: end === start ? 300 : (Date.parse(record.time) - start) / (end - start) * 600, y: 150 - record.value / ceiling * 142 });
    }
    return segments.filter(segment => segment.length);
  });
  return { start: Number.isFinite(start) ? start : null, end: Number.isFinite(end) ? end : null, ceiling, valid, series };
}

export const pingSeriesColor = (index: number) => index < 8 ? `var(--ping-series-${Math.max(0, index)})` : `hsl(${(24 + (index - 8) * 137.508) % 360} 62% var(--ping-series-lightness))`;
