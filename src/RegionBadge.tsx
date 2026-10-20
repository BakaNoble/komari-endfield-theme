import { regionCode } from './region';

// Emit local SVG files; only flags used by visible nodes are requested by the browser.
const assets = import.meta.glob<string>('../node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true, query: '?url&no-inline', import: 'default',
});
const flags = new Map(Object.entries(assets).map(([path, url]) => [path.split('/').pop()!.replace('.svg', '').toUpperCase(), url]));
const regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });

export function RegionBadge({ region }: { region: string }) {
  const code = regionCode(region);
  const flag = code ? flags.get(code) : undefined;
  const name = code && flag ? `${regionNames.of(code) || code} (${code})` : region.trim() || '未知地区';
  return <span className="region-code" title={name}>
    {flag ? <img src={flag} alt={name} width="32" height="24" loading="lazy" decoding="async" /> : <span className="region-text">{region.trim() || '—'}</span>}
  </span>;
}
