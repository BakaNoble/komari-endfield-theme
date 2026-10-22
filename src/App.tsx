import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Activity, ArrowDown, ArrowUp, ArrowUpRight, ChevronRight, CircleHelp, Clock3, Cpu, HardDrive, LayoutDashboard, LayoutGrid, List, MemoryStick, Moon, Network, Pause, Play, RefreshCw, Search, Server, Settings2, Sun, X } from 'lucide-react';
import { useMonitor } from './useMonitor';
import { bytes, duration, percent, warning, type NodeInfo } from './model';
import { Chart, Eyebrow, Logo, Modal, NetworkValue, Resource, ResourceSummary, StateBadge, StatusRing } from './components';
import Detail from './Detail';
import { demoHistory } from './demo';
import themeManifest from '../komari-theme.json';
import type { TiltScope } from './usePointerTilt';
import { RegionBadge } from './RegionBadge';
import { regionCode } from './region';
import GlobePanel from './GlobePanel';
import { NodeCard } from './NodeCard';
import { NodeInventory } from './NodeInventory';
import { NetworkDiagnostics } from './NetworkDiagnostics';
import { usePingMonitor } from './usePingMonitor';
import { resolveNodeView, type Page, type NodeView, type ViewPreferences } from './viewPreferences';
import { ListColumn } from './ListColumn';
import { createPageNavigator, pageFromRoute } from './pageNavigation';

function readStorage(key: string) { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }
function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Storage is optional. */ } }
const parseRoute = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return '/overview'; } };

export default function App() {
  const monitor = useMonitor();
  const { nodes, statuses, info, loading, error, liveError, updated, paused, stale, setPaused, refresh, refreshing, isDemo } = monitor;
  const [page, setPage] = useState<Page>(() => pageFromRoute(parseRoute()) ?? 'overview');
  const currentPage = useRef(page);
  const [route, setRoute] = useState(parseRoute);
  const ping = usePingMonitor(page === 'network', isDemo, paused, nodes);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('default');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themePreference, setThemePreference] = useState(() => readStorage('endfield-theme'));
  const [accentPreference, setAccentPreference] = useState(() => readStorage('endfield-accent'));
  const [densityPreference, setDensityPreference] = useState(() => readStorage('endfield-density'));
  const [tiltScopePreference, setTiltScopePreference] = useState(() => readStorage('endfield-tilt-scope'));
  const [legacyNodeView, setLegacyNodeView] = useState(() => readStorage('endfield-node-view'));
  const [viewPreferences, setViewPreferences] = useState<ViewPreferences>(() => ({ overview: readStorage('endfield-overview-node-view'), nodes: readStorage('endfield-nodes-node-view'), network: readStorage('endfield-network-node-view') }));
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const [now, setNow] = useState(new Date());
  const [trend, setTrend] = useState<(number | null)[]>(isDemo ? () => {
    const records = [1, 2, 3, 4, 5].map(i => demoHistory(`demo-node-${i}`, 1));
    return records[0].map((_, t) => records.reduce((sum, row) => sum + (row[t].net_in ?? 0), 0));
  } : []);
  const settings = info.theme_settings ?? {};
  const threshold = Math.max(50, Math.min(100, Number(settings.warning_threshold) || 85));
  const rawTheme = themePreference || String(settings.default_theme || 'light');
  const dark = rawTheme === 'dark' || rawTheme === 'system' && systemDark;
  const accent = accentPreference || String(settings.accent || 'yellow');
  const compact = (densityPreference || String(settings.density || 'standard')) === 'compact';
  const tiltScope: TiltScope = ['page', '整个页面'].includes(String(tiltScopePreference || settings.tilt_scope)) ? 'page' : 'component';
  const effectiveGroup = group === 'all' || nodes.some(n => n.group === group) ? group : 'all';
  const effectiveRegion = regionFilter === 'all' || nodes.some(n => regionCode(n.region) === regionFilter) ? regionFilter : 'all';
  const nodeView = resolveNodeView(page, viewPreferences, settings, legacyNodeView);
  function changeNodeView(value: NodeView, target: Page = page) {
    writeStorage(`endfield-${target}-node-view`, value);
    setViewPreferences(previous => ({ ...previous, [target]: value }));
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const color = () => setSystemDark(media.matches);
    media.addEventListener('change', color);
    return () => { clearInterval(timer); media.removeEventListener('change', color); };
  }, []);
  useEffect(() => {
    const navigator = createPageNavigator({ current: () => currentPage.current, commit: (nextRoute, nextPage) => {
      flushSync(() => {
        setRoute(nextRoute);
        if (nextPage) { currentPage.current = nextPage; setPage(nextPage); setSort('default'); }
      });
    } });
    const change = () => navigator.navigate(parseRoute());
    window.addEventListener('hashchange', change);
    return () => { window.removeEventListener('hashchange', change); navigator.destroy(); };
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.theme = dark ? 'dark' : 'light';
    html.dataset.efAccent = ['yellow', 'lime', 'ice', 'amber'].includes(accent) ? accent : 'yellow';
    html.dataset.efDensity = compact ? 'compact' : 'standard';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#161917' : '#f0f2ed');
  }, [dark, accent, compact]);
  useEffect(() => {
    if (!updated) return;
    const active = nodes.filter(n => statuses[n.uuid]?.online && statuses[n.uuid].down != null);
    const value = active.length ? active.reduce((a, n) => a + statuses[n.uuid].down!, 0) : null;
    setTrend(values => [...values.slice(-59), value]);
  }, [updated]);

  const groups = [...new Set(nodes.map(n => n.group))];
  const online = nodes.filter(n => statuses[n.uuid]?.online);
  const offline = nodes.filter(n => statuses[n.uuid] && !statuses[n.uuid].online);
  const high = nodes.filter(n => warning(n, statuses[n.uuid], threshold));
  const pingIssues = nodes.filter(n => statuses[n.uuid]?.online && ((ping.health[n.uuid]?.loss ?? 0) > 0 || ping.health[n.uuid]?.timedOut));
  const attention = page === 'network' ? pingIssues : high;
  const pending = nodes.length - online.length - offline.length;
  const selected = route.startsWith('/node/') ? nodes.find(n => n.uuid === route.slice(6)) ?? null : null;
  const knownOnline = nodes.some(n => statuses[n.uuid] !== undefined);
  function sum(field: 'up' | 'down' | 'totalUp' | 'totalDown') {
    const values = online.map(n => statuses[n.uuid][field]).filter((v): v is number => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  }
  const visible = useMemo(() => {
    const filtered = nodes.filter(n => {
      const s = statuses[n.uuid];
      const matches = `${n.name} ${n.region} ${regionCode(n.region) ?? ''} ${n.group} ${n.os} ${n.tags ?? ''}`.toLowerCase().includes(query.toLowerCase().trim());
      const needsAttention = page === 'network' ? (ping.health[n.uuid]?.loss ?? 0) > 0 || ping.health[n.uuid]?.timedOut : warning(n, s, threshold);
      return matches && (effectiveGroup === 'all' || n.group === effectiveGroup) && (effectiveRegion === 'all' || regionCode(n.region) === effectiveRegion) && (statusFilter === 'all' || statusFilter === 'online' && s?.online || statusFilter === 'offline' && s && !s.online || statusFilter === 'attention' && (page === 'network' ? s?.online && needsAttention : s && !s.online || needsAttention));
    });
    return filtered.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const value = (n: NodeInfo) => {
        const s = statuses[n.uuid];
        if (sort === 'cores') return n.cpu_cores;
        if (sort === 'capacity') return n.mem_total;
        if (sort === 'latency') return ping.health[n.uuid]?.latency ?? -1;
        if (sort === 'loss') return ping.health[n.uuid]?.loss ?? -1;
        if (!s?.online) return -1;
        return sort === 'uptime' ? s.uptime ?? -1 : sort === 'cpu' ? s.cpu ?? -1 : sort === 'memory' ? percent(s.ram, n.mem_total) ?? -1 : s.down ?? -1;
      };
      return sort === 'default' ? 0 : value(b) - value(a);
    });
  }, [nodes, statuses, query, effectiveGroup, effectiveRegion, statusFilter, sort, threshold, page, ping.health]);
  const title = String(settings.headline || '节点总览');
  const siteName = info.sitename || 'Komari';
  function preference(key: string, value: string, set: (value: string) => void) { writeStorage(`endfield-${key}`, value); set(value); }
  function clearFilters() { setQuery(''); setGroup('all'); setRegionFilter('all'); setStatusFilter('all'); }
  const openNode = (node: NodeInfo) => { location.hash = `/node/${encodeURIComponent(node.uuid)}`; };
  const closeNode = () => { location.hash = `/${page}`; };

  return <>
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <div className="ef-tri top-strip" aria-hidden="true"><i /><i /><i /></div>
    <header className="command-bar"><div className="command-inner">
      <a className="brand" href="#/overview" aria-label={`${siteName} 首页`}><Logo /><span>{siteName}<small>SERVER MONITOR</small></span></a>
      <nav aria-label="主导航">{([
        ['overview', LayoutDashboard, 'OVERVIEW', '总览'], ['nodes', List, 'NODES', '节点'], ['network', Network, 'NETWORK', '网络'],
      ] as const).map(([key, Icon, english, chinese]) => <a href={`#/${key}`} key={key} className={page === key ? 'current' : ''} aria-current={page === key ? 'page' : undefined}><Icon size={15} /><span>{chinese}</span><small>{english}</small></a>)}</nav>
      <div className="header-actions"><span className={`connection ${stale || error ? 'muted' : ''}`}><i />{loading ? '正在连接' : error ? '连接失败' : paused ? '已暂停' : liveError ? '重连中' : isDemo ? '演示模式' : '实时同步'}</span><span className="header-divider" />
        <button className="header-icon" aria-label={dark ? '切换到浅色主题' : '切换到深色主题'} onClick={() => preference('theme', dark ? 'light' : 'dark', setThemePreference)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button className="header-icon" aria-label="打开外观设置" onClick={() => setSettingsOpen(true)}><Settings2 size={18} /></button>
        <a className="admin-link" href="/admin">管理后台<ArrowUpRight size={14} /></a>
      </div>
    </div></header>
    <main id="main-content" className={`workspace ${compact ? 'compact-layout' : ''}`}>
      <div className="masthead"><div><Eyebrow>{page === 'overview' ? 'NETWORK OVERVIEW' : page === 'nodes' ? 'NODE DIRECTORY' : 'NETWORK MONITOR'}</Eyebrow>
        <h1>{page === 'overview' ? title : page === 'nodes' ? '全部节点' : '网络监测'}<span className="title-slash" aria-hidden="true">/</span></h1>
      </div><div className="masthead-meta"><time dateTime={now.toISOString()} className="clock"><span>{now.toLocaleDateString('zh-CN').replaceAll('/', '.')}</span><strong>{now.toLocaleTimeString('en-GB', { hour12: false })}</strong></time><div className="refresh-controls">
        <button className="text-button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={13} /> : <Pause size={13} />}{paused ? '继续更新' : '暂停更新'}</button>
        <button className="icon-btn" aria-label="刷新监控数据" onClick={() => { refresh(); if (page === 'network') ping.refresh(); }} disabled={refreshing || loading}><RefreshCw size={16} className={refreshing ? 'refreshing' : ''} /></button>
      </div></div></div>
      {isDemo && <div className="demo-notice"><span>DEMO / 示例数据</span></div>}
      {(error || liveError || paused) && <div className="connection-notice" role="status"><Activity size={17} /><span>{error || (paused ? '已暂停 / 数据未更新' : `${liveError} / 数据未更新`)}</span>{error && info.private_site ? <a className="ef-btn small" href="/admin">前往登录</a> : <button className="ef-btn small" onClick={paused ? () => setPaused(false) : refresh}>{paused ? '继续更新' : '重新连接'}</button>}</div>}
      {page !== 'nodes' && nodes.length > 0 && <section className={`overview ${page === 'network' ? 'network-overview' : ''} ${stale ? 'is-stale' : ''}`} aria-label={page === 'network' ? '网络概览' : '监控概览'}>
        {page === 'overview' ? <ResourceSummary nodes={nodes} statuses={statuses} threshold={threshold} /> : <div className="resource-summary network-summary"><div className="summary-label"><Eyebrow>TRANSFER TOTAL</Eyebrow><span>在线节点累计流量</span></div><div className="transfer-total"><ArrowUp size={17} /><span>累计上传</span><strong>{bytes(sum('totalUp'))}</strong></div><div className="transfer-total"><ArrowDown size={17} /><span>累计下载</span><strong>{bytes(sum('totalDown'))}</strong></div></div>}
        <div className={`availability ${page === 'network' ? 'has-globe' : ''}`}>{page === 'network' ? <GlobePanel nodes={nodes} statuses={statuses} dark={dark} accent={accent} selected={effectiveRegion} onSelect={setRegionFilter} /> : <StatusRing nodes={nodes} statuses={statuses} threshold={threshold} scope={tiltScope} active={!stale && !loading} />}<div className="ring-legend"><span><i className="normal" />在线 {online.length}</span><span><i className="alert" />离线 {offline.length}</span>{pending > 0 && <span>等待 {pending}</span>}</div><div className="system-status">{stale ? '数据未更新' : loading ? '正在获取节点状态' : !knownOnline ? '等待节点上报' : offline.length || attention.length ? `${offline.length + attention.length} 个节点需要注意` : '所有节点运行正常'}</div></div>
        <div className="bandwidth-summary"><div className="summary-label"><Eyebrow>LIVE BANDWIDTH</Eyebrow><span>实时网络速率</span></div><div className="bandwidth-values"><div><span><ArrowUp size={13} />上传</span><strong>{bytes(sum('up'), true)}</strong></div><div><span><ArrowDown size={13} />下载</span><strong>{bytes(sum('down'), true)}</strong></div></div><Chart compact values={trend} format={v => bytes(v, true)} label={isDemo ? '示例下载速率趋势' : '本次浏览期间的下载速率趋势'} /><div className="chart-caption"><span>下载速率趋势</span><span>{isDemo ? '示例记录' : '本次会话'}</span></div></div>
        <div className="overview-inventory">{page === 'network' ? <><span><Activity size={14} /><b>{ping.tasks.length}</b> 个测试目标</span><span><Network size={14} /><b>{Object.values(ping.health).filter(s => s.tested > 0).length}</b> 台主机有记录</span><span>统计范围 <b>{ping.hours}</b> 小时</span></> : <><span><Cpu size={14} /><b>{nodes.reduce((a, n) => a + n.cpu_cores, 0)}</b> CPU 核心</span><span><MemoryStick size={14} /><b>{bytes(nodes.reduce((a, n) => a + n.mem_total, 0))}</b> 总内存</span><span><HardDrive size={14} /><b>{bytes(nodes.reduce((a, n) => a + n.disk_total, 0))}</b> 总磁盘</span></>}<span className="inventory-note">{groups.length} 个分组 <i>/</i> {nodes.length} 个节点</span></div>
      </section>}
      <section className="nodes-section" aria-labelledby="nodes-title">
        <div className="section-heading"><div><Eyebrow>{page === 'network' ? 'LATENCY TESTS' : page === 'nodes' ? 'HOST INVENTORY' : 'NODE STATUS'}</Eyebrow><h2 id="nodes-title">{page === 'network' ? '延迟测试' : page === 'nodes' ? '主机档案' : '节点状态'}<span className="count-tag">{String(nodes.length).padStart(2, '0')}</span></h2></div><div className="directory-controls"><div className="list-status">{offline.length > 0 && <button onClick={() => setStatusFilter('offline')}><i className="status-square offline" />{offline.length} 离线</button>}{attention.length > 0 && <button onClick={() => setStatusFilter('attention')}><i className="status-square attention" />{attention.length} {page === 'network' ? '丢包 / 超时' : '高负载'}</button>}<span className="last-update">{updated ? `更新于 ${updated.toLocaleTimeString('en-GB', { hour12: false })}` : '等待首次更新'}</span></div><div className="view-switch" role="group" aria-label="主机显示模式"><button aria-pressed={nodeView === 'list'} onClick={() => changeNodeView('list')}><List size={14} />列表</button><button aria-pressed={nodeView === 'cards'} onClick={() => changeNodeView('cards')}><LayoutGrid size={14} />卡片</button></div></div></div>
        <div className="list-toolbar"><div className="group-tabs" role="group" aria-label="按分组筛选"><button className="ef-chip" aria-pressed={effectiveGroup === 'all'} onClick={() => setGroup('all')}>全部节点<span className="n">{nodes.length}</span></button>{groups.map(g => <button key={g} className="ef-chip" aria-pressed={effectiveGroup === g} onClick={() => setGroup(g)}>{g}<span className="n">{nodes.filter(n => n.group === g).length}</span></button>)}</div><div className="list-tools">
          <label className="search-box"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索节点名称、地区…" aria-label="搜索节点" />{query && <button onClick={() => setQuery('')} aria-label="清空搜索"><X size={14} /></button>}</label>
          <select aria-label="筛选节点状态" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">全部状态</option><option value="online">在线</option><option value="offline">离线</option><option value="attention">{page === 'network' ? '丢包或超时' : '需要注意'}</option></select>
          <select aria-label="节点排序" value={sort} onChange={e => setSort(e.target.value)}><option value="default">默认排序</option><option value="name">名称排序</option>{page === 'network' ? <><option value="latency">最高平均延迟优先</option><option value="loss">最高丢包率优先</option><option value="network">下载从高到低</option></> : page === 'nodes' ? <><option value="cores">核心数从高到低</option><option value="capacity">内存容量从高到低</option><option value="uptime">运行时间从长到短</option></> : <><option value="cpu">CPU 从高到低</option><option value="memory">内存从高到低</option><option value="network">下载从高到低</option></>}</select>
        </div></div>
        {effectiveRegion !== 'all' && <div className="active-region"><button aria-label="清除地区筛选" onClick={() => setRegionFilter('all')}><RegionBadge region={effectiveRegion} />地区 {effectiveRegion}<X size={13} /></button></div>}
        {loading && !nodes.length ? <div className="empty-state"><Activity size={28} /><h3>正在连接监控</h3></div> : error && !nodes.length ? <div className="empty-state"><Network size={28} /><h3>暂时无法读取节点</h3><p>{error}</p><button className="ef-btn go" onClick={refresh}>重新连接</button><a className="text-button" href="?demo=1">查看主题演示</a></div> : visible.length === 0 ? <div className="empty-state"><Search size={28} /><h3>{nodes.length ? '无匹配节点' : '暂无节点'}</h3>{nodes.length > 0 ? <button className="ef-btn" onClick={clearFilters}>清除筛选</button> : <a className="ef-btn" href="/admin">打开管理后台</a>}</div> : page === 'network' ? <NetworkDiagnostics nodes={visible} statuses={statuses} cards={nodeView === 'cards'} monitor={ping} onOpen={openNode} /> : page === 'nodes' ? <NodeInventory nodes={visible} statuses={statuses} threshold={threshold} cards={nodeView === 'cards'} onOpen={openNode} /> : <div className={`node-table ${nodeView === 'cards' ? 'node-grid' : ''} ${stale ? 'is-stale' : ''}`}>
          {nodeView === 'list' && <div className="table-heading list-columns" aria-hidden="true"><ListColumn icon={Server} label="节点" detail="地区 / 名称 / 状态" /><ListColumn icon={Cpu} label="CPU" detail="使用率 %" /><ListColumn icon={MemoryStick} label="内存" detail="使用率 %" /><ListColumn icon={HardDrive} label="磁盘" detail="使用率 %" /><ListColumn icon={Network} label="网络" detail="上传 / 下载" /><ListColumn icon={Clock3} label="运行时间" detail="在线时长" /><span /></div>}
          {nodeView === 'cards' ? visible.map(n => <NodeCard key={n.uuid} node={n} status={statuses[n.uuid]} threshold={threshold} onOpen={openNode} />) : visible.map(n => {
            const s = statuses[n.uuid]; const active = s?.online; const alert = warning(n, s, threshold);
            return <button key={n.uuid} className={`node-row ${s && !active ? 'node-offline' : ''} ${alert ? 'node-attention' : ''}`} onClick={() => openNode(n)} aria-label={`查看 ${n.name} 详情`}>
              <span className="node-identity"><span className="node-index">{String(nodes.indexOf(n) + 1).padStart(2, '0')}</span><RegionBadge region={n.region} /><span className="node-name"><span className="node-name-line"><strong>{n.name}</strong><StateBadge status={s} alert={alert} /></span><span className="node-spec">{n.os || '未知系统'}<i>/</i>{n.cpu_cores}C<i>/</i>{bytes(n.mem_total)}<i>/</i>{n.group}</span></span></span>
              <Resource label="CPU" value={active ? s.cpu : null} threshold={threshold} /><Resource label="内存" value={active ? percent(s.ram, n.mem_total) : null} threshold={threshold} /><Resource label="磁盘" value={active ? percent(s.disk, n.disk_total) : null} threshold={threshold} /><span className="row-network"><NetworkValue value={active ? s.up : null} direction="up" /><NetworkValue value={active ? s.down : null} direction="down" /></span><span className="row-uptime">{active ? duration(s.uptime) : '—'}</span>
              <ChevronRight className="row-arrow" size={18} aria-hidden="true" />
            </button>;
          })}
        </div>}
        <div className="list-footer"><span>显示 {visible.length} / {nodes.length} 个节点</span>{(statusFilter !== 'all' || query || effectiveGroup !== 'all' || effectiveRegion !== 'all') && <button className="text-button" onClick={clearFilters}>清除筛选<X size={12} /></button>}</div>
      </section>
      <footer className="site-footer"><div className="footer-brand"><Logo /><strong>{siteName}</strong><span>Powered by Komari Monitor.</span></div><div><span>Endfield Theme / v{themeManifest.version}</span><a href="https://komari-document.pages.dev" target="_blank" rel="noreferrer" aria-label="打开 Komari 文档"><CircleHelp size={14} />文档</a></div></footer>
    </main>
    <Detail node={selected} status={selected ? statuses[selected.uuid] : undefined} onClose={closeNode} demo={isDemo} threshold={threshold} stale={stale} ping={page === 'network' ? ping : undefined} />
    <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="APPEARANCE / 外观设置">
      <div className="settings-body"><Eyebrow>PERSONAL PREFERENCES</Eyebrow><h2>外观设置</h2>
        <label className="setting-row"><span>显示主题</span><select aria-label="显示主题" value={rawTheme} onChange={e => preference('theme', e.target.value, setThemePreference)}><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></label>
        <fieldset className="accent-picker"><legend>强调色</legend><div>{[['yellow', '标准黄'], ['ice', '冰蓝'], ['amber', '琥珀'], ['lime', '荧绿']].map(([key, label]) => <button key={key} className={`accent-choice ${key}`} aria-pressed={accent === key} onClick={() => preference('accent', key, setAccentPreference)}><i />{label}</button>)}</div></fieldset>
        <label className="setting-row"><span>列表密度</span><select aria-label="列表密度" value={compact ? 'compact' : 'standard'} onChange={e => preference('density', e.target.value, setDensityPreference)}><option value="standard">标准</option><option value="compact">紧凑</option></select></label>
        {([['overview', '总览主机显示'], ['nodes', '节点主机显示'], ['network', '网络主机显示']] as const).map(([target, label]) => <label className="setting-row" key={target}><span>{label}</span><select aria-label={label} value={resolveNodeView(target, viewPreferences, settings, legacyNodeView)} onChange={e => changeNodeView(e.target.value as NodeView, target)}><option value="list">列表</option><option value="cards">信息卡片</option></select></label>)}
        <label className="setting-row"><span>动效响应范围</span><select aria-label="动效响应范围" value={tiltScope} onChange={e => preference('tilt-scope', e.target.value, setTiltScopePreference)}><option value="component">仅组件</option><option value="page">整个页面</option></select></label>
        <button className="ef-btn" onClick={() => { ['theme', 'accent', 'density', 'tilt-scope', 'overview-mode', 'node-view', 'overview-node-view', 'nodes-node-view', 'network-node-view'].forEach(k => { try { localStorage.removeItem(`endfield-${k}`); } catch {} }); setThemePreference(''); setAccentPreference(''); setDensityPreference(''); setTiltScopePreference(''); setLegacyNodeView(''); setViewPreferences({ overview: '', nodes: '', network: '' }); }}>恢复站点默认设置</button>
      </div>
    </Modal>
  </>;
}
