import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api';
import { demoPingReport, demoPingTasks } from './demo';
import { emptyPingReport, hostPingHealth, pingSummary, type PingReport, type PingTask } from './ping';
import type { NodeInfo } from './model';

export function usePingMonitor(active: boolean, demo: boolean, paused: boolean, nodes: NodeInfo[]) {
  const [tasks, setTasks] = useState<PingTask[]>(demo ? demoPingTasks : []);
  const [taskLoading, setTaskLoading] = useState(!demo), [taskError, setTaskError] = useState('');
  const [hours, setHours] = useState(1), [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; reports: Record<number, PingReport>; errors: Record<number, string>; loading: boolean; updated: Date | null }>({ key: '', reports: {}, errors: {}, loading: false, updated: null });
  const manual = useRef(false);
  const key = `${tasks.map(t => t.id).join(',')}:${hours}`;
  useEffect(() => {
    if (!active || demo) return;
    const controller = new AbortController(); let stopped = false;
    setTaskLoading(true); setTaskError('');
    api.pingTasks(controller.signal).then(value => { if (!stopped) setTasks(value); }).catch(e => { if (!stopped) { setTasks([]); setTaskError(e instanceof Error ? e.message : '无法读取测试任务。'); } }).finally(() => { if (!stopped) setTaskLoading(false); });
    return () => { stopped = true; controller.abort(); };
  }, [active, demo, revision]);
  useEffect(() => {
    // Keep a manual refresh pending until task discovery and its report load finish.
    // Task discovery can change the key and abort an earlier report request.
    const requested = manual.current;
    if (!active || taskLoading || !tasks.length || taskError || (paused && !requested)) {
      setState(s => s.loading ? { ...s, loading: false } : s);
      return;
    }
    const controller = new AbortController(); let stopped = false, busy = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped || document.hidden || busy) return;
      busy = true;
      setState(s => ({ ...s, key, reports: s.key === key ? s.reports : {}, errors: {}, loading: true }));
      try {
        const result = demo ? { reports: Object.fromEntries(tasks.map(t => [t.id, demoPingReport(t.id, hours)])), errors: {} } : await api.pingReports(tasks.map(t => t.id), hours, controller.signal);
        if (!stopped) {
          manual.current = false;
          setState(s => ({ key, reports: { ...(s.key === key ? s.reports : {}), ...result.reports }, errors: result.errors, loading: false, updated: Object.keys(result.reports).length ? new Date() : s.key === key ? s.updated : null }));
        }
      } catch (e) {
        if (!stopped) setState(s => ({ ...s, key, loading: false, errors: Object.fromEntries(tasks.map(t => [t.id, e instanceof Error ? e.message : '无法读取延迟记录。'])) }));
      } finally {
        busy = false;
        if (!stopped && !paused) timer = setTimeout(poll, 30000);
      }
    };
    const visibility = () => { clearTimeout(timer); if (!document.hidden && !paused) void poll(); };
    void poll(); document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [active, demo, paused, key, revision, taskError, taskLoading]);
  const reports = useMemo(() => state.key === key ? state.reports : {}, [state.key, state.reports, key]);
  const errors = state.key === key ? state.errors : {};
  const summaries = useMemo(() => Object.fromEntries(tasks.map(t => [t.id, Object.fromEntries(nodes.map(node => [node.uuid, pingSummary(reports[t.id] ?? emptyPingReport(), node.uuid, t.id)]))])), [reports, nodes, tasks]);
  const health = useMemo(() => Object.fromEntries(nodes.map(node => [node.uuid, hostPingHealth(tasks.map(t => summaries[t.id][node.uuid]))])), [nodes, summaries, tasks]);
  const failures = Object.values(errors);
  return { tasks, hours, paused, setHours, summaries, health, errors,
    loading: taskLoading || state.loading || (!paused && !!tasks.length && state.key !== key),
    error: taskError || (failures.length ? `${failures.length} 个测试点未更新：${failures[0]}` : ''), updated: state.key === key ? state.updated : null,
    refresh: () => { manual.current = true; setRevision(r => r + 1); } };
}
