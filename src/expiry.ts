export interface Expiry { date: string; full: string; days: number; expired: boolean; soon: boolean; label: string }
export function expiryInfo(value: unknown, now = Date.now()): Expiry | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time <= 0) return null;
  const remaining = time - now, days = Math.max(0, Math.ceil(remaining / 86400000));
  const date = new Date(time);
  return { date: date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll('/', '.'),
    full: date.toLocaleString('zh-CN', { hour12: false }), days, expired: remaining <= 0, soon: remaining > 0 && days <= 7,
    label: remaining <= 0 ? '已到期' : remaining < 86400000 ? '不足 1 天' : `剩余 ${days} 天` };
}
