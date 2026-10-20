export type Page = 'overview' | 'nodes' | 'network';
export type NodeView = 'list' | 'cards';
export type ViewPreferences = Record<Page, string>;
const view = (value: unknown): NodeView | null => value === 'cards' || value === 'list' ? value : null;
export function resolveNodeView(page: Page, preferences: ViewPreferences, settings: Record<string, unknown>, legacy = ''): NodeView {
  return view(preferences[page]) ?? view(legacy) ?? view(settings[`${page}_node_view`]) ?? view(settings.node_view) ?? 'list';
}
