/** CSS runs the dial; only keep its animation active while it can be seen. */
export function observeInstrument(host: HTMLElement, active: boolean) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false;
  const update = () => host.toggleAttribute('data-instrument-running', active && visible && !document.hidden && !reduced.matches);
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    update();
  });
  observer.observe(host);
  document.addEventListener('visibilitychange', update);
  reduced.addEventListener('change', update);
  update();
  return () => {
    observer.disconnect();
    document.removeEventListener('visibilitychange', update);
    reduced.removeEventListener('change', update);
    host.removeAttribute('data-instrument-running');
  };
}
