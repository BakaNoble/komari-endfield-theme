import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api';
import { demoNodes, demoStatuses } from './demo';
import type { NodeInfo, NodeStatus, PublicInfo } from './model';

export const isDemo = new URLSearchParams(location.search).get('demo') === '1';
export function useMonitor() {
  const [nodes, setNodes] = useState<NodeInfo[]>(isDemo ? demoNodes : []);
  const [statuses, setStatuses] = useState<Record<string, NodeStatus>>(isDemo ? demoStatuses() : {});
  const [info, setInfo] = useState<PublicInfo>({});
  const [loading, setLoading] = useState(!isDemo);
  const [error, setError] = useState('');
  const [liveError, setLiveError] = useState('');
  const [updated, setUpdated] = useState<Date | null>(isDemo ? new Date() : null);
  const [paused, setPaused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const source = useRef<api.LiveSource | null>(null);
  const mounted = useRef(true);
  const tick = useRef(0);
  const busy = useRef(false);
  const stale = liveError !== '' || error !== '' || paused;
  const authError = (e: unknown) => e instanceof api.ApiError && [401, 403, -32040, -32041].includes(e.code);
  const interval = Math.max(2, Math.min(60, Number(info.theme_settings?.refresh_interval) || 2)) * 1000;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (isDemo) return;
    let stopped = false;
    setLoading(true);
    Promise.allSettled([api.publicInfo(), api.nodes()]).then(([publicResult, nodeResult]) => {
      if (stopped) return;
      if (publicResult.status === 'fulfilled') setInfo(publicResult.value);
      if (nodeResult.status === 'fulfilled') { setNodes(nodeResult.value); setError(''); }
      else {
        setError(nodeResult.reason instanceof Error ? nodeResult.reason.message : '无法读取节点，请稍后重试。');
        if (authError(nodeResult.reason)) { setNodes([]); setStatuses({}); setUpdated(null); }
      }
      setLoading(false);
    });
    return () => { stopped = true; };
  }, [revision]);

  const fetchLatest = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setRefreshing(true);
    try {
      const result = isDemo ? demoStatuses(++tick.current) : await (source.current ??= new api.LiveSource()).read();
      if (mounted.current) { setStatuses(result); setUpdated(new Date()); setLiveError(''); }
    } catch (e) {
      if (mounted.current) {
        setLiveError(e instanceof Error ? e.message : '无法更新实时数据。');
        if (authError(e)) { setNodes([]); setStatuses({}); setUpdated(null); setError('此站点需要登录后查看。'); }
      }
    }
    finally { busy.current = false; if (mounted.current) setRefreshing(false); }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined; let stopped = false;
    async function poll() {
      if (stopped || paused || document.hidden || loading || error) return;
      await fetchLatest();
      if (!stopped) timer = setTimeout(poll, interval);
    }
    function visibility() { clearTimeout(timer); if (!document.hidden) void poll(); }
    void poll(); document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [paused, loading, error, interval, fetchLatest]);
  useEffect(() => () => source.current?.close(), []);

  // Refresh metadata periodically so added and renamed nodes appear without a reload.
  useEffect(() => {
    if (isDemo) return;
    const timer = setInterval(() => { if (!document.hidden && !paused) setRevision(r => r + 1); }, 60000);
    return () => clearInterval(timer);
  }, [paused]);
  const refresh = () => { setRevision(r => r + 1); void fetchLatest(); };
  return { nodes, statuses, info, loading, error, liveError, updated, paused, stale, setPaused, refresh, refreshing, isDemo };
}
