import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNodeView, type ViewPreferences } from '../src/viewPreferences.ts';
import { expiryInfo } from '../src/expiry.ts';

test('each page resolves its own layout and changing one page does not change the others', () => {
  const preferences: ViewPreferences = { overview: 'list', nodes: 'cards', network: 'list' };
  assert.equal(resolveNodeView('nodes', preferences, {}), 'cards');
  preferences.overview = 'cards';
  assert.equal(resolveNodeView('network', preferences, {}), 'list'); assert.equal(resolveNodeView('nodes', preferences, {}), 'cards');
  preferences.network = 'cards'; preferences.nodes = 'list';
  assert.equal(resolveNodeView('overview', preferences, {}), 'cards'); assert.equal(resolveNodeView('nodes', preferences, {}), 'list');
});
test('page-specific site defaults, old preferences and invalid preference values have explicit fallbacks', () => {
  const unset = { overview: '', nodes: '', network: '' };
  const defaults = { overview_node_view: 'list', nodes_node_view: 'cards', network_node_view: 'list', node_view: 'cards' };
  assert.equal(resolveNodeView('nodes', unset, defaults), 'cards'); assert.equal(resolveNodeView('network', unset, defaults), 'list');
  assert.equal(resolveNodeView('overview', unset, defaults, 'cards'), 'cards');
  assert.equal(resolveNodeView('overview', { ...unset, overview: 'list' }, defaults, 'cards'), 'list');
  assert.equal(resolveNodeView('network', { ...unset, network: 'invalid' }, { node_view: 'cards' }), 'cards');
  assert.equal(resolveNodeView('nodes', unset, {}), 'list');
});
const now = Date.parse('2026-10-20T00:00:00Z'), day = 86400000;
test('expiry only displays a real supplied date, without treating missing or Go zero dates as expired subscriptions', () => {
  for (const value of [null, undefined, '', 'invalid', '0001-01-01T00:00:00Z', 123, {}]) assert.equal(expiryInfo(value, now), null);
  const future = expiryInfo(new Date(now + 30 * day).toISOString(), now)!;
  assert.equal(future.days, 30); assert.equal(future.soon, false); assert.equal(future.expired, false); assert.match(future.date, /^2026\./);
});
test('expiry handles seven-day boundaries, fractional days and already expired dates', () => {
  const at = (delta: number) => expiryInfo(new Date(now + delta).toISOString(), now)!;
  assert.equal(at(7 * day).soon, true); assert.equal(at(7 * day + 1).soon, false);
  assert.equal(at(60000).label, '不足 1 天'); assert.equal(at(60000).expired, false);
  assert.equal(at(0).label, '已到期'); assert.equal(at(-2 * day).days, 0); assert.equal(at(-2 * day).expired, true);
});
