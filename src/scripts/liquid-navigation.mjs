import { Spring, TOKENS, selectorScale, clamp, nextTab } from '../lib/liquid/liquid-motion.mjs';
import { OpticsRenderer } from '../lib/liquid/optics.mjs';
import { NavigationTexture } from '../lib/liquid/nav-texture.mjs';
import profile from '../lib/liquid/profile.json';

export function initLiquidNavigation(stage, { motionEnabled, signal, initial, navigate }) {
  if (!stage) return;
  const dock = stage.querySelector('nav');
  const links = [...dock.querySelectorAll('[data-liquid-tab]')];
  if (!links.length) return;

  const source = stage.querySelector('.liquid-source');
  const canvas = stage.querySelector('.liquid-optics');
  const selector = stage.querySelector('.liquid-selector');
  const context = source.getContext('2d', { alpha: false });
  let renderer, texture;
  if (context) {
    try {
      renderer = new OpticsRenderer(canvas);
      texture = new NavigationTexture(stage, dock);
    } catch {
      renderer?.destroy();
      renderer = null;
    }
  }

  const selected = links.findIndex(link => link.getAttribute('aria-current') === 'page');
  const target = Math.max(0, selected);
  const entry = selected >= 0 && initial?.visible && motionEnabled() ? initial : null;
  const index = new Spring({ ...TOKENS.springs.index, value: entry?.index ?? target, velocity: entry?.velocity ?? 0, target });
  const velocity = new Spring({ ...TOKENS.springs.velocity, value: entry?.deformationVelocity ?? 0, target: 0 });
  const press = new Spring({ ...TOKENS.springs.press, value: entry?.pressure ?? 0, target: 0 });
  const scaleX = new Spring({ ...TOKENS.springs.scaleX, value: entry?.scaleX ?? 1, target: 1 });
  const scaleY = new Spring({ ...TOKENS.springs.scaleY, value: entry?.scaleY ?? 1, target: 1 });
  const springs = [index, velocity, press, scaleX, scaleY];
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const contrast = matchMedia('(forced-colors: active)');
  const compact = matchMedia('(max-width: 600px)');
  let geometry, revision = 0, frame = 0, last = 0, slowFrames = 0, dprQuery;
  let gesture = null, keyboard = null, releasing = false, suppressClick = false, focusPreview = false;

  function request() {
    if (!frame && !document.hidden && !signal.aborted) frame = requestAnimationFrame(draw);
  }

  function setPress(on) {
    press.retarget(on ? 1 : 0);
    scaleX.retarget(on ? profile.normal.selectorPressedScale : 1);
    scaleY.retarget(on ? profile.normal.selectorPressedScale : 1);
    request();
  }

  function cancel() {
    const id = gesture?.id;
    if (gesture) suppressClick = true;
    gesture = keyboard = null;
    focusPreview = false;
    index.retarget(target);
    releasing = true;
    if (id !== undefined && dock.hasPointerCapture(id)) dock.releasePointerCapture(id);
    request();
  }

  function measure() {
    if (gesture) cancel();
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, profile.normal.dprCap);
    const tabs = links.map(link => {
      const tab = link.getBoundingClientRect();
      return { x: tab.left - rect.left, y: tab.top - rect.top, w: tab.width, h: tab.height };
    });
    geometry = { dpr, tabs, left: rect.left };
    if (context) {
      source.width = Math.max(1, Math.round(rect.width * dpr));
      source.height = Math.max(1, Math.round(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = getComputedStyle(document.body).backgroundColor;
      context.fillRect(0, 0, rect.width, rect.height);
    }
    revision++;
    texture?.invalidate();
    request();
  }

  function draw(time) {
    frame = 0;
    if (!geometry || document.hidden || signal.aborted) return;
    const dt = last ? clamp((time - last) / 1000, 0, .064) : 1 / 60;
    last = Math.max(last, time);
    slowFrames = dt > .026 ? slowFrames + 1 : 0;
    if (slowFrames >= 4) document.documentElement.dataset.motionLite = '';

    const reduced = !motionEnabled();
    if (reduced) {
      index.snap();
      velocity.snap(0);
      press.snap();
      scaleX.snap(1);
      scaleY.snap(1);
    } else {
      index.step(dt);
      velocity.retarget(index.velocity / Math.max(1, links.length - 1));
      for (const spring of springs.slice(1)) spring.step(dt);
    }
    if (releasing && Math.abs(index.value - index.target) < profile.deformation.releaseDistanceFraction) {
      releasing = false;
      setPress(false);
    }

    const value = clamp(index.value, 0, links.length - 1);
    const low = Math.floor(value), fraction = value - low;
    const a = geometry.tabs[low], b = geometry.tabs[Math.min(links.length - 1, low + 1)];
    const base = { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, w: a.w + (b.w - a.w) * fraction, h: a.h + (b.h - a.h) * fraction };
    const scale = reduced ? { x: 1, y: 1 } : selectorScale(scaleX.value, scaleY.value, velocity.value);
    const lens = {
      x: base.x - base.w * (scale.x - 1) / 2, y: base.y - base.h * (scale.y - 1) / 2,
      w: base.w * scale.x, h: base.h * scale.y, r: base.h * scale.y / 2,
      pressure: press.value, velocity: velocity.value,
    };
    Object.assign(selector.style, { translate: `${lens.x}px ${lens.y}px`, width: `${lens.w}px`, height: `${lens.h}px` });

    const opaque = transparency.matches || contrast.matches;
    let rendered = false;
    if (renderer?.available && !opaque && press.value > profile.normal.contentCapturePressureThreshold) {
      const captured = texture.update(source, { dpr: geometry.dpr, revision, selected });
      const lite = document.documentElement.hasAttribute('data-motion-lite');
      const strength = lite ? .45 : compact.matches ? .82 : 1;
      rendered = renderer.render(captured.canvas, [lens], {
        dpr: geometry.dpr, refraction: profile.normal.refraction * strength, dispersion: profile.normal.dispersion * strength,
        blur: lite ? 0 : profile.normal.backgroundBlurCssPx * profile.normal.navigationBlurMultiplier,
        content: true, tint: profile.normal.tint, revision: captured.revision, light: [.2, .12],
      });
    } else if (stage.dataset.opticsActive === 'true') renderer?.clear();
    stage.dataset.ready = 'true';
    stage.dataset.showSelector = String(selected >= 0 || !!gesture || !!keyboard || focusPreview || press.value > .002);
    stage.dataset.opaque = String(opaque);
    stage.dataset.opticsActive = String(rendered);
    stage.dataset.pressure = press.value.toFixed(3);
    stage.dataset.index = index.value.toFixed(3);
    stage.dataset.renderer = renderer?.available ? 'webgl' : 'fallback';
    if (releasing || !springs.every(spring => spring.settled)) request();
    else { last = 0; slowFrames = 0; }
  }

  const follow = i => navigate(links[clamp(Math.round(i), 0, links.length - 1)]);
  const modified = event => event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
  dock.addEventListener('dragstart', event => event.preventDefault(), { signal });
  dock.addEventListener('pointerdown', event => {
    suppressClick = false;
    const link = event.target.closest('[data-liquid-tab]');
    if (!link || event.button !== 0 || !event.isPrimary || gesture || modified(event)) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
    keyboard = null;
    releasing = focusPreview = false;
    index.retarget(links.indexOf(link));
    setPress(true);
    dock.setPointerCapture(event.pointerId);
  }, { signal });
  dock.addEventListener('pointermove', event => {
    if (event.pointerId !== gesture?.id) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.dragging && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.4) { cancel(); return; }
    if (Math.abs(dx) > 6) gesture.dragging = true;
    if (gesture.dragging) {
      const a = geometry.tabs[0], b = geometry.tabs.at(-1);
      const fraction = (event.clientX - geometry.left - a.x - a.w / 2) / Math.max(1, b.x + b.w / 2 - a.x - a.w / 2);
      index.retarget(clamp(fraction * (links.length - 1), 0, links.length - 1));
      request();
    }
  }, { signal });
  dock.addEventListener('pointerup', event => {
    if (event.pointerId !== gesture?.id) return;
    const destination = Math.round(index.target), id = gesture.id;
    gesture = null;
    suppressClick = releasing = true;
    index.retarget(destination);
    if (dock.hasPointerCapture(id)) dock.releasePointerCapture(id);
    request();
    follow(destination);
  }, { signal });
  for (const name of ['pointercancel', 'lostpointercapture']) {
    dock.addEventListener(name, event => { if (event.pointerId === gesture?.id) cancel(); }, { signal });
  }
  dock.addEventListener('click', event => {
    if (modified(event)) return;
    if (event.detail !== 0 && suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    const link = event.target.closest('[data-liquid-tab]');
    if (!link) return;
    event.preventDefault();
    index.retarget(links.indexOf(link));
    request();
    navigate(link);
  }, { capture: true, signal });
  dock.addEventListener('keydown', event => {
    const link = event.target.closest('[data-liquid-tab]');
    if (!link || modified(event)) return;
    const i = links.indexOf(link);
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = nextTab(i, event.key, links.length);
      links[next].focus();
      focusPreview = true;
      index.retarget(next);
      request();
    }
    if (event.key === ' ') event.preventDefault();
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      keyboard = { key: event.key, index: i };
      releasing = false;
      index.retarget(i);
      setPress(true);
    }
  }, { signal });
  dock.addEventListener('keyup', event => {
    if (event.key !== keyboard?.key) return;
    const held = keyboard;
    keyboard = null;
    releasing = true;
    request();
    if (held.key === ' ') { event.preventDefault(); follow(held.index); }
  }, { signal });
  dock.addEventListener('focusout', event => { if (!dock.contains(event.relatedTarget) && !gesture) cancel(); }, { signal });

  const resized = new ResizeObserver(measure);
  resized.observe(stage);
  const theme = new MutationObserver(measure);
  for (const element of [document.documentElement, document.body]) theme.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
  const fonts = () => { if (!signal.aborted) { texture?.invalidate(); request(); } };
  document.fonts?.addEventListener('loadingdone', fonts, { signal });
  document.fonts?.ready.then(fonts);
  function dprChanged() {
    dprQuery?.removeEventListener('change', dprChanged);
    dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    dprQuery.addEventListener('change', dprChanged, { signal });
    measure();
  }
  function reset() {
    cancel();
    releasing = false;
    index.snap(target);
    velocity.snap(0);
    press.snap(0);
    scaleX.snap(1);
    scaleY.snap(1);
    stage.dataset.opticsActive = 'false';
    cancelAnimationFrame(frame);
    frame = last = 0;
  }
  for (const query of [transparency, contrast]) query.addEventListener('change', request, { signal });
  document.addEventListener('insulin:motionchange', () => { if (!motionEnabled()) reset(); request(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); else measure(); }, { signal });
  canvas.addEventListener('webglcontextlost', () => { stage.dataset.opticsActive = 'false'; request(); }, { signal });
  canvas.addEventListener('webglcontextrestored', fonts, { signal });
  addEventListener('pageshow', event => { if (event.persisted) measure(); }, { signal });
  addEventListener('pagehide', reset, { signal });
  signal.addEventListener('abort', () => {
    reset();
    resized.disconnect();
    theme.disconnect();
    dprQuery?.removeEventListener('change', dprChanged);
    texture?.destroy();
    renderer?.destroy();
  }, { once: true });
  dprChanged();
  cancelAnimationFrame(frame);
  draw(performance.now());
  return () => ({ visible: selected >= 0 || press.value > .002, index: index.value, velocity: index.velocity,
    deformationVelocity: velocity.value, pressure: press.value, scaleX: scaleX.value, scaleY: scaleY.value });
}
