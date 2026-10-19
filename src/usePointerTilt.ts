import { useEffect, useRef } from 'react';

export type TiltScope = 'component' | 'page';

/** Coalesce mouse movement into one transform update per frame, without React renders. */
export function usePointerTilt(scope: TiltScope = 'component') {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const surface: HTMLElement = scope === 'page' ? document.documentElement : host;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let point: { x: number; y: number } | null = null;

    const enabled = () => finePointer.matches && !reducedMotion.matches;
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      point = null;
      host.removeAttribute('data-tilt-active');
      host.style.setProperty('--ring-pointer-x', '0');
      host.style.setProperty('--ring-pointer-y', '0');
    };
    const paint = () => {
      frame = 0;
      if (!point || !enabled()) { reset(); return; }
      // Page mode uses the full viewport for a smooth range instead of
      // reaching maximum tilt as soon as the cursor leaves the small ring.
      // Component mode measures its stationary hit area, never the 3D scene.
      const rect = scope === 'page'
        ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
        : host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) { reset(); return; }
      const clamp = (value: number) => Math.max(-1, Math.min(1, value));
      const x = clamp((point.x - rect.left) / rect.width * 2 - 1);
      const y = clamp((point.y - rect.top) / rect.height * 2 - 1);
      host.setAttribute('data-tilt-active', '');
      host.style.setProperty('--ring-pointer-x', x.toFixed(4));
      host.style.setProperty('--ring-pointer-y', y.toFixed(4));
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !enabled()) { reset(); return; }
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const visibility = () => { if (document.hidden) reset(); };

    surface.addEventListener('pointerenter', move);
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerleave', reset);
    surface.addEventListener('pointercancel', reset);
    finePointer.addEventListener('change', reset);
    reducedMotion.addEventListener('change', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    window.addEventListener('scroll', reset, true);
    document.addEventListener('visibilitychange', visibility);

    return () => {
      reset();
      surface.removeEventListener('pointerenter', move);
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerleave', reset);
      surface.removeEventListener('pointercancel', reset);
      finePointer.removeEventListener('change', reset);
      reducedMotion.removeEventListener('change', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('resize', reset);
      window.removeEventListener('scroll', reset, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [scope]);

  return ref;
}
