import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, trafficReport } from './api';
import { demoTrafficReport } from './demo';
import { summarizeTraffic, type TrafficReport } from './traffic';
import type { NodeInfo } from './model';

const interval = 60000;
export function useTrafficMonitor(active: boolean, demo: boolean, paused: boolean, nodes: NodeInfo[]) {
  const key = nodes.map(node => node.uuid).sort().join('\0');
  const [state, setState] = useState<{ key: string; report: TrafficReport | null; updated: number; loading: boolean; error: string }>({ key: '', report: null, updated: 0, loading: false, error: '' });
  const [revision, setRevision] = useState(0);
  const cached = useRef(state); cached.current = state;
  const manual = useRef(false);
  useEffect(() => {
    if (!active || !key) { setState(s => s.loading ? { ...s, loading: false } : s); return; }
    const forced = manual.current; manual.current = false;
    if (paused && !forced) { setState(s => s.loading ? { ...s, loading: false } : s); return; }
    const controller = new AbortController();
    let stopped = false, busy = false, timer: ReturnType<typeof setTimeout> | undefined;
    const ids = key.split('\0');
    const poll = async (force = false) => {
      if (stopped || busy || document.hidden) return;
      const previous = cached.current;
      const age = Date.now() - previous.updated;
      if (!force && previous.key === key && previous.report && age < interval) {
        if (!paused) timer = setTimeout(() => void poll(), interval - age);
        return;
      }
      busy = true;
      setState(s => ({ key, report: s.key === key ? s.report : null, updated: s.key === key ? s.updated : 0, loading: true, error: '' }));
      let unsupported = false;
      try {
        const report = demo ? demoTrafficReport() : await trafficReport(ids, controller.signal);
        if (!stopped) setState({ key, report, updated: Date.now(), loading: false, error: '' });
      } catch (e) {
        unsupported = e instanceof ApiError && [404, 405, -32601, -32050].includes(e.code);
        const unauthorized = e instanceof ApiError && [401, 403, -32040, -32041].includes(e.code);
        if (!stopped) setState(s => ({ ...s, key, report: unauthorized ? null : s.report, updated: unauthorized ? 0 : s.updated, loading: false, error: unsupported ? '当前 Komari 版本不支持流量历史统计。' : e instanceof Error ? e.message : '无法读取流量记录。' }));
      } finally {
        busy = false;
        if (!stopped && !paused && !unsupported) timer = setTimeout(() => void poll(), interval);
      }
    };
    const visibility = () => { clearTimeout(timer); if (!document.hidden && !paused) void poll(); };
    void poll(forced); document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [active, demo, paused, key, revision]);
  const report = state.key === key ? state.report : null;
  const summary = useMemo(() => report ? summarizeTraffic(report, key.split('\0')) : null, [report, key]);
  return { summary, paused, loading: state.key === key ? state.loading : active && !paused,
    error: state.key === key ? state.error : '', updated: state.key === key ? state.updated : 0,
    refresh: () => { manual.current = true; setRevision(r => r + 1); } };
}
