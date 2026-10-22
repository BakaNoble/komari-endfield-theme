import type { Page } from './viewPreferences.ts';

const pages: Page[] = ['overview', 'nodes', 'network'];
export function pageFromRoute(route: string): Page | null {
  const value = route.replace(/^\//, '');
  return pages.includes(value as Page) ? value as Page : null;
}

/** Interruptible exit/enter animations; page controls remain live throughout. */
export function createPageNavigator(options: { current: () => Page; commit: (route: string, page: Page | null) => void }) {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let animation: Animation | null = null;
  let pending: { route: string; page: Page } | null = null;
  let revision = 0;

  function navigate(route: string) {
    const next = pageFromRoute(route), previous = options.current(), version = ++revision;
    const content = document.querySelector<HTMLElement>('.workspace');
    const before = content ? getComputedStyle(content) : null;
    const opacity = before?.opacity ?? '1', transform = before?.transform ?? 'none';
    animation?.cancel(); animation = null; pending = null;
    delete root.dataset.pageTransition;
    if (!next || next === previous || document.hidden || reduced.matches || !content || typeof content.animate !== 'function') {
      options.commit(route, next); return;
    }
    const direction = pages.indexOf(next) > pages.indexOf(previous) ? 1 : -1;
    pending = { route, page: next };
    root.dataset.pageTransition = direction === 1 ? 'forward' : 'backward';
    const finish = () => {
      if (version === revision) { animation?.cancel(); animation = null; pending = null; delete root.dataset.pageTransition; }
    };
    animation = content.animate([{ opacity, transform }, { opacity: 0, transform: `translateX(${-direction * 10}px)` }],
      { duration: 100, easing: 'cubic-bezier(0.2, 0.7, 0.1, 1)', fill: 'forwards' });
    void animation.finished.then(() => {
      if (version !== revision) return;
      animation?.cancel();
      options.commit(route, next); pending = null;
      animation = content.animate([{ opacity: 0, transform: `translateX(${direction * 14}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
      void animation.finished.then(finish, () => {});
    }, () => {});
  }

  function settle() {
    if (!document.hidden && !reduced.matches) return;
    revision++; animation?.cancel(); animation = null;
    if (pending) { const target = pending; pending = null; options.commit(target.route, target.page); }
    delete root.dataset.pageTransition;
  }
  document.addEventListener('visibilitychange', settle);
  reduced.addEventListener('change', settle);
  return {
    navigate,
    destroy() {
      revision++;
      animation?.cancel(); animation = null; pending = null;
      document.removeEventListener('visibilitychange', settle);
      reduced.removeEventListener('change', settle);
      delete root.dataset.pageTransition;
    },
  };
}
