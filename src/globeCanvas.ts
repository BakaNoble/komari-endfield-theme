// Canvas projection and interaction adapted from komari-theme-aero (MIT).
// See licenses/aero-LICENSE. Earth point data is derived from Natural Earth.
import { advanceGlobeLongitude, GLOBE_LATITUDE, GLOBE_TILT, projectGlobe, unrollGlobeDrag, wrapLongitude, type Coordinates, type GlobeRegion } from './globeModel.ts';
import type { TrafficNode } from './globeTraffic.ts';
import { TrafficScheduler } from './globeTrafficSchedule.ts';

export interface GlobeModel { regions: GlobeRegion[]; selected: string; dark: boolean; accent: string; trafficEffects?: boolean; trafficInterval?: number; trafficConcurrent?: boolean; trafficNodes?: TrafficNode[] }
interface Callbacks { onSelect: (code: string) => void; onRunning: (running: boolean) => void; onReduced: (reduced: boolean) => void }
export interface GlobeController {
  update: (model: GlobeModel) => void; focus: (coordinates: Coordinates) => void;
  toggle: () => void; zoom: (delta: number) => void; reset: () => void; destroy: () => void;
}

export function createGlobe(canvas: HTMLCanvasElement, land: number[][], callbacks: Callbacks): GlobeController | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const context = ctx;
  const landSet = new Set(land.map(([lon, lat]) => `${lon},${lat}`));
  const terrain = land.map(([lon, lat]) => ({ lon, lat, edge: [[lon - 2, lat], [lon + 2, lat], [lon, lat - 2], [lon, lat + 2]].some(point => !landSet.has(point.join(','))) }));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let model: GlobeModel = { regions: [], selected: 'all', dark: false, accent: 'yellow' };
  const latitude = GLOBE_LATITUDE;
  let longitude = 110, scale = 1, running = !reduced.matches;
  let flight: { from: number; delta: number; elapsed: number; duration: number } | null = null;
  let visible = true, frame = 0, last = 0, destroyed = false;
  let redraw = true;
  const traffic = new TrafficScheduler();
  let drag: { id: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null = null;
  let markers: { x: number; y: number; code: string }[] = [];
  const hint = '拖动沿 Y 轴旋转 · ← / → 调整 · + / − 缩放';
  const setRunning = (value: boolean) => { running = value && !reduced.matches; callbacks.onRunning(running); };
  const stopFrame = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
  const trafficActive = () => traffic.active && !reduced.matches;

  function draw() {
    const { width: w, height: h } = canvas.getBoundingClientRect();
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, w, h);
    const dark = model.dark, cx = w / 2, cy = h / 2, aperture = Math.min(w * .47, h * .49), radius = aperture * scale;
    const water = dark ? '#161917' : '#f0f2ed', ink = dark ? '#e3e8dc' : '#29372e';
    const grid = dark ? '#3c493f' : '#c5cdbf', muted = dark ? '#a3ae9a' : '#68765f';
    const accent = ({ yellow: '#fffa00', ice: '#7de6ff', amber: '#ffb31f', lime: '#b8ff3d' } as Record<string, string>)[model.accent] || '#fffa00';
    function project(lon: number, lat: number, elevation = 1) {
      const point = projectGlobe(lon, lat, longitude, latitude, GLOBE_TILT);
      return { x: cx + point.x * radius * elevation, y: cy - point.y * radius * elevation, z: point.z };
    }
    // Only the planet is drawn here; no separate viewport or instrument frame.
    context.fillStyle = water; context.strokeStyle = muted; context.lineWidth = .8;
    // The silhouette belongs to the scaled sphere. The canvas rectangle is the
    // viewport; the original unzoomed circle must never act as a fixed window.
    context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill(); context.stroke();
    context.save(); context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.clip();
    context.strokeStyle = grid; context.lineWidth = .65;
    const gridLine = (points: Coordinates[]) => {
      context.beginPath(); let pen = false;
      for (const coordinates of points) {
        const point = project(...coordinates);
        if (point.z > 0) { if (pen) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y); pen = true; }
        else pen = false;
      }
      context.stroke();
    };
    for (let lat = -75; lat <= 75; lat += 15) {
      if (lat !== 0) gridLine(Array.from({ length: 121 }, (_, i) => [-180 + i * 3, lat]));
    }
    for (let lon = -180; lon < 180; lon += 30) gridLine(Array.from({ length: 61 }, (_, i) => [lon, -90 + i * 3]));
    context.fillStyle = ink;
    for (const { lon, lat, edge } of terrain) {
      const point = project(lon, lat);
      if (point.z <= 0) continue;
      const size = (.55 + point.z * .75) * Math.max(1, aperture / 140) * Math.min(scale, 1.3);
      context.globalAlpha = (edge ? .9 : dark ? .58 : .4) * (.3 + point.z * .7);
      context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }
    context.globalAlpha = 1; context.restore();
    // Physical rim and sparse bearings scale with the globe, never with a fixed aperture.
    context.strokeStyle = muted; context.lineWidth = .75;
    for (let i = 0; i < 120; i++) {
      const angle = i * Math.PI / 60;
      const outer = radius * (i % 10 === 0 ? 1.045 : 1.025);
      context.globalAlpha = i % 10 === 0 ? .7 : .3;
      context.beginPath(); context.moveTo(cx + Math.cos(angle) * radius * 1.014, cy + Math.sin(angle) * radius * 1.014);
      context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer); context.stroke();
    }
    context.globalAlpha = .65; context.lineWidth = 2;
    for (const angle of [-.7, 2.44]) {
      context.beginPath(); context.arc(cx, cy, radius * 1.055, angle, angle + .6); context.stroke();
    }
    context.globalAlpha = 1;
    for (const pole of [90, -90]) {
      const point = project(0, pole), dx = point.x - cx, dy = point.y - cy;
      context.strokeStyle = muted; context.lineWidth = 1;
      context.beginPath(); context.moveTo(cx + dx * 1.025, cy + dy * 1.025); context.lineTo(cx + dx * 1.14, cy + dy * 1.14); context.stroke();
      context.fillStyle = ink; context.font = '600 10px Saira, sans-serif'; context.textAlign = 'center';
      context.fillText(pole > 0 ? 'N' : 'S', cx + dx * 1.18, cy + dy * 1.18 + 3);
    }
    if (trafficActive() && traffic.packets.length) {
      context.save(); context.lineCap = 'round'; context.lineJoin = 'round';
      for (const { route, started } of traffic.packets) {
        const points = route.points.map(point => project(...point.coordinates, point.elevation));
        // Fade the packet smoothly when either endpoint crosses the horizon.
        const visibility = Math.min(1, Math.max(0, Math.min(points[0].z, points.at(-1)!.z) / .2));
        if (visibility) {
          const opacity = visibility * (model.selected === 'all' || route.from === model.selected || route.to === model.selected ? 1 : .3);
          const sample = (progress: number) => {
            const index = Math.max(0, Math.min(1, progress)) * (points.length - 1), left = Math.floor(index), right = Math.min(left + 1, points.length - 1), fraction = index - left;
            return { x: points[left].x + (points[right].x - points[left].x) * fraction, y: points[left].y + (points[right].y - points[left].y) * fraction };
          };
          const progress = Math.min(1, (traffic.time - started) / route.duration);
          const fade = Math.min(1, progress * 12, (1 - progress) * 12);
          context.strokeStyle = dark ? accent : ink; context.lineWidth = 1.6;
          for (let tail = 0; tail < 6; tail++) {
            const from = progress - tail * .012, to = from - .012;
            if (Math.min(from, to) < 0 || Math.max(from, to) > 1) continue;
            const a = sample(from), b = sample(to);
            context.globalAlpha = opacity * fade * (1 - tail / 6) * .8;
            context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
          }
          const head = sample(progress);
          context.globalAlpha = opacity * fade; context.fillStyle = accent; context.strokeStyle = ink; context.lineWidth = .8;
          context.beginPath(); context.arc(head.x, head.y, 2.6, 0, Math.PI * 2); context.fill(); context.stroke();
        }
      }
      context.restore();
    }
    markers = [];
    const labels: { x: number; y: number }[] = [];
    for (const region of model.regions) {
      const point = project(...region.coordinates);
      if (point.z <= .03 || Math.hypot(point.x - cx, point.y - cy) > radius - 4 || point.x < 4 || point.x > w - 4 || point.y < 4 || point.y > h - 4) continue;
      markers.push({ x: point.x, y: point.y, code: region.code });
      const selected = model.selected === region.code;
      if (selected) {
        const arm = 13 + (flight ? 8 * (1 - Math.min(1, flight.elapsed / flight.duration)) : 0);
        context.strokeStyle = ink; context.lineWidth = 1.2;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          context.beginPath(); context.moveTo(point.x + sx * (arm - 5), point.y + sy * arm);
          context.lineTo(point.x + sx * arm, point.y + sy * arm); context.lineTo(point.x + sx * arm, point.y + sy * (arm - 5)); context.stroke();
        }
      }
      context.strokeStyle = muted; context.lineWidth = .7;
      context.beginPath(); context.arc(point.x, point.y, selected ? 10 : 7, 0, Math.PI * 2); context.stroke();
      context.fillStyle = region.online ? accent : water;
      context.strokeStyle = region.online ? ink : muted;
      context.lineWidth = region.online ? 1.4 : 1;
      if (region.pending === region.total) context.setLineDash([2, 2]);
      const size = selected ? 6 : 4;
      context.beginPath(); context.moveTo(point.x, point.y - size); context.lineTo(point.x + size, point.y); context.lineTo(point.x, point.y + size); context.lineTo(point.x - size, point.y); context.closePath(); context.fill(); context.stroke(); context.setLineDash([]);
      const side = point.x < cx ? -1 : 1, labelWidth = 64, labelHeight = 24;
      const x = Math.max(4, Math.min(w - labelWidth - 4, point.x + side * 28 - (side < 0 ? labelWidth : 0)));
      let y = Math.max(4, Math.min(h - labelHeight - 44, point.y - 32));
      for (let attempt = 0; attempt < 5 && labels.some(label => Math.abs(label.x - x) < labelWidth + 2 && Math.abs(label.y - y) < labelHeight + 3); attempt++) y += labelHeight + 4;
      y = Math.max(4, Math.min(h - labelHeight - 44, y)); labels.push({ x, y });
      context.strokeStyle = selected ? ink : muted; context.lineWidth = .7;
      context.beginPath(); context.moveTo(point.x + side * 6, point.y); context.lineTo(point.x + side * 11, y + labelHeight / 2); context.lineTo(side > 0 ? x : x + labelWidth, y + labelHeight / 2); context.stroke();
      context.fillStyle = selected ? accent : water; context.fillRect(x, y, labelWidth, labelHeight);
      context.strokeRect(x, y, labelWidth, labelHeight);
      context.fillStyle = region.online ? accent : muted; context.fillRect(x, y, 3, labelHeight);
      context.font = '650 11px Saira, sans-serif'; context.textAlign = 'left'; context.fillStyle = selected ? '#171a18' : ink;
      context.fillText(region.code, x + 8, y + 16);
      context.font = '500 10px Saira, sans-serif'; context.textAlign = 'right';
      context.fillText(region.online + '/' + region.total, x + labelWidth - 6, y + 16);
    }
    // Camera telemetry is real view state; it does not imply network routes.
    context.font = '500 10px Saira, sans-serif'; context.fillStyle = muted; context.textAlign = 'left';
    context.fillText(`${Math.abs(longitude).toFixed(1)}°${longitude < 0 ? 'W' : 'E'}  /  ${latitude.toFixed(0)}°N`, 8, h - 56);
    context.textAlign = 'right'; context.fillText(`×${scale.toFixed(2)}`, w - 8, h - 56);
    // Public DOM state also describes the current camera when the canvas is controlled by keyboard.
    canvas.dataset.longitude = longitude.toFixed(2); canvas.dataset.latitude = latitude.toFixed(2); canvas.dataset.zoom = scale.toFixed(2); canvas.dataset.tilt = String(GLOBE_TILT); canvas.dataset.animating = String(!!flight);
    canvas.dataset.traffic = trafficActive() ? 'on' : 'off';
    canvas.dataset.trafficInterval = String(traffic.interval);
    canvas.dataset.trafficConcurrent = String(traffic.concurrent);
  }
  function tick(time: number) {
    frame = 0;
    if (destroyed || !visible || document.hidden) { last = 0; return; }
    const elapsed = last ? Math.max(0, Math.min(time - last, 80)) : 0;
    const wasMoving = !!flight || running && !drag, hadPacket = traffic.packets.length > 0;
    if (flight) {
      flight.elapsed += elapsed;
      const progress = Math.min(1, flight.elapsed / flight.duration);
      longitude = wrapLongitude(flight.from + flight.delta * (1 - (1 - progress) ** 3));
      if (progress === 1) flight = null;
    } else if (running && !drag) longitude = advanceGlobeLongitude(longitude, elapsed);
    if (trafficActive()) {
      const visibleRegions = new Set(model.regions.filter(region => projectGlobe(...region.coordinates, longitude, latitude, GLOBE_TILT).z > .2).map(region => region.code));
      traffic.advance(elapsed, visibleRegions);
    }
    last = time;
    if (redraw || wasMoving || hadPacket || traffic.packets.length) { draw(); redraw = false; }
    if (running || flight || trafficActive()) frame = requestAnimationFrame(tick);
  }
  function wake() { redraw = true; if (!destroyed && visible && !document.hidden && !frame) frame = requestAnimationFrame(tick); }
  function focus(coordinates: Coordinates) {
    setRunning(false); last = 0;
    const target = wrapLongitude(coordinates[0]), delta = wrapLongitude(target - longitude);
    if (reduced.matches || Math.abs(delta) < .01) { longitude = target; flight = null; }
    else flight = { from: longitude, delta, elapsed: 0, duration: 650 + Math.abs(delta) * 4 };
    wake();
  }
  function zoom(delta: number) { scale = Math.max(.8, Math.min(1.8, scale + delta)); wake(); }
  function reset() { flight = null; longitude = 110; scale = 1; setRunning(false); wake(); }
  function hit(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return [...markers].sort((a, b) => Math.hypot(a.x - event.clientX + rect.left, a.y - event.clientY + rect.top) - Math.hypot(b.x - event.clientX + rect.left, b.y - event.clientY + rect.top))
      .find(p => Math.hypot(p.x - event.clientX + rect.left, p.y - event.clientY + rect.top) < 14);
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId); flight = null; setRunning(false); wake();
  };
  const move = (event: PointerEvent) => {
    if (!drag) { const marker = hit(event); canvas.title = marker ? `${marker.code} · 点击筛选该地区节点` : hint; return; }
    if (drag.id !== event.pointerId) return;
    drag.moved ||= Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) > 4;
    const movement = unrollGlobeDrag(event.clientX - drag.x, event.clientY - drag.y);
    longitude = wrapLongitude(longitude - movement.x * .35 / scale);
    drag.x = event.clientX; drag.y = event.clientY; wake();
  };
  const up = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    const click = !drag.moved; drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (click) { const marker = hit(event); if (marker) callbacks.onSelect(marker.code === model.selected ? 'all' : marker.code); }
    wake();
  };
  const cancel = () => { drag = null; wake(); };
  const key = (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', '+', '=', '-', '_', 'Home'].includes(event.key)) return;
    event.preventDefault(); flight = null; setRunning(false);
    if (event.key === 'Home') reset();
    else if (['+', '=', '-', '_'].includes(event.key)) zoom(['+', '='].includes(event.key) ? .15 : -.15);
    else {
      longitude = wrapLongitude(longitude + (event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0));
      wake();
    }
  };
  const visibility = () => { if (document.hidden) stopFrame(); else wake(); };
  const motion = () => {
    if (reduced.matches) {
      setRunning(false);
      traffic.reset();
      if (flight) { longitude = wrapLongitude(flight.from + flight.delta); flight = null; }
    }
    callbacks.onReduced(reduced.matches); wake();
  };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel);
  canvas.addEventListener('keydown', key); document.addEventListener('visibilitychange', visibility); reduced.addEventListener('change', motion);
  const resize = new ResizeObserver(wake); resize.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) wake(); else stopFrame(); }); intersection.observe(canvas);
  callbacks.onRunning(running); callbacks.onReduced(reduced.matches); canvas.title = hint; wake();
  return {
    update(next) {
      model = next;
      traffic.configure({ enabled: !!next.trafficEffects, concurrent: !!next.trafficConcurrent, interval: next.trafficInterval, nodes: next.trafficNodes ?? next.regions });
      wake();
    }, focus, zoom, reset,
    toggle() { flight = null; setRunning(!running); last = 0; wake(); },
    destroy() {
      destroyed = true; stopFrame(); resize.disconnect(); intersection.disconnect();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel); canvas.removeEventListener('lostpointercapture', cancel); canvas.removeEventListener('keydown', key);
      document.removeEventListener('visibilitychange', visibility); reduced.removeEventListener('change', motion);
    },
  };
}
