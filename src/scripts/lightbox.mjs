import { easeOut, motionEnabled } from './motion.mjs';

const centered = { transform: 'none', opacity: '1' };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function initLightbox(dialog, signal) {
  if (!dialog || typeof dialog.showModal !== 'function') return () => {};

  const media = dialog.querySelector('.lightbox-media');
  const wash = dialog.querySelector('.lightbox-wash');
  const caption = dialog.querySelector('.lightbox-caption');
  const count = dialog.querySelector('.lightbox-count');
  const status = dialog.querySelector('.lightbox-status');
  const original = dialog.querySelector('.lightbox-original');
  const close = dialog.querySelector('[data-close]');
  const previous = dialog.querySelector('[data-prev]');
  const next = dialog.querySelector('[data-next]');
  const compact = matchMedia('(max-width: 600px)');
  const animations = new WeakMap();
  let items, opener, frame, scroll, overflow;
  let shown = 0, wanted = 0, request = 0, phase = 'closed';
  let drag = null, ignoreBackdropUntil = 0;

  function visual(element) {
    const { transform, opacity } = getComputedStyle(element);
    return { transform, opacity };
  }

  function play(element, from, to, duration) {
    animations.get(element)?.cancel();
    Object.assign(element.style, to);
    if (!motionEnabled() || !element.animate) return Promise.resolve();
    const animation = element.animate([from, to], { duration, easing: easeOut });
    animations.set(element, animation);
    return animation.finished.catch(() => {}).then(() => {
      if (animations.get(element) === animation) animations.delete(element);
    });
  }

  function thumbnailTransform(link) {
    const rect = link.getBoundingClientRect();
    const bounds = media.getBoundingClientRect();
    const width = frame.offsetWidth, height = frame.offsetHeight;
    const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0;
    if (!width || !height || !rect.width || !rect.height || rect.bottom <= headerBottom || rect.top >= innerHeight) return null;
    const x = rect.left + rect.width / 2 - (bounds.left + bounds.width / 2);
    const y = rect.top + rect.height / 2 - (bounds.top + bounds.height / 2);
    return `translate(${x}px, ${y}px) scale(${rect.width / width}, ${rect.height / height})`;
  }

  function makeFrame(link, image) {
    const layer = document.createElement('div');
    layer.className = 'lightbox-frame';
    const thumb = link.querySelector('img');
    const width = Number(thumb.getAttribute('width')) || thumb.naturalWidth || 1000;
    const height = Number(thumb.getAttribute('height')) || thumb.naturalHeight || 750;
    layer.style.setProperty('--photo-width', `${width}px`);
    layer.style.setProperty('--photo-ratio', width / height);
    if (image) layer.append(image);
    return layer;
  }

  function label(index) {
    const link = items[index];
    caption.textContent = link.closest('figure').querySelector('figcaption')?.textContent || link.querySelector('img').alt;
    count.textContent = `${index + 1} / ${items.length}`;
    original.href = link.href;
  }

  function placeCaption() {
    if (frame) caption.style.setProperty('--frame-height', `${frame.offsetHeight}px`);
  }

  function loadImage(link) {
    const image = new Image();
    image.alt = link.querySelector('img').alt;
    image.draggable = false;
    if (image.decode) {
      image.src = link.href;
      return image.decode().then(() => image);
    }
    return new Promise((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = link.href;
    });
  }

  function removeOldFrames() {
    for (const child of media.children) {
      if (child === frame) continue;
      animations.get(child)?.cancel();
      child.remove();
    }
  }

  function open(link) {
    if (phase !== 'closed') return;
    phase = 'open';
    opener = link;
    items = [...link.closest('[data-gallery]').querySelectorAll('[data-lightbox]')];
    shown = wanted = items.indexOf(link);
    request++;
    const thumb = link.querySelector('img');
    const preview = thumb.complete && thumb.naturalWidth ? new Image() : null;
    if (preview) {
      preview.alt = thumb.alt;
      preview.draggable = false;
      preview.src = thumb.currentSrc;
    }

    frame = makeFrame(link, preview);
    const openedFrame = frame;
    media.replaceChildren(frame);
    label(shown);
    previous.hidden = next.hidden = items.length < 2;
    status.hidden = true;
    scroll = { left: scrollX, top: scrollY, behavior: 'instant' };
    overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    close.focus({ preventScroll: true });
    placeCaption();

    const origin = thumbnailTransform(link);
    play(wash, { opacity: '0' }, { opacity: '1' }, 240);
    play(frame, { transform: origin || 'scale(.98)', opacity: origin && preview ? '1' : '.25' }, centered, compact.matches ? 320 : 380);
    loadImage(link).then(image => {
      if (phase === 'open' && frame === openedFrame) frame.replaceChildren(image);
    }).catch(() => {
      if (phase === 'open' && frame === openedFrame && wanted === shown) status.hidden = false;
    });
  }

  function finish(restoreFocus) {
    if (phase === 'closed') return;
    phase = 'closed';
    request++;
    releaseDrag();
    dialog.getAnimations?.({ subtree: true }).forEach(animation => animation.cancel());
    if (dialog.open) dialog.close();
    document.body.style.overflow = overflow;
    if (restoreFocus) {
      if (scrollX !== scroll.left || scrollY !== scroll.top) scrollTo(scroll);
      opener?.focus({ preventScroll: true });
    }
    media.replaceChildren();
    items = opener = frame = scroll = null;
    status.hidden = true;
    ignoreBackdropUntil = 0;
  }

  function dismiss() {
    if (phase !== 'open') return;
    phase = 'closing';
    const id = ++request;
    releaseDrag();
    if (!motionEnabled()) { finish(true); return; }
    const destination = thumbnailTransform(items[shown]);
    const duration = compact.matches ? 220 : 260;
    for (const outgoing of media.children) {
      if (outgoing !== frame) play(outgoing, visual(outgoing), { opacity: '0' }, Math.min(duration, 140));
    }
    play(wash, { opacity: getComputedStyle(wash).opacity }, { opacity: '0' }, duration);
    play(frame, visual(frame), { transform: destination || 'scale(.98)', opacity: destination ? '.82' : '0' }, duration)
      .then(() => { if (request === id) finish(true); });
  }

  function restoreDrag(duration = 200) {
    play(frame, visual(frame), centered, duration);
    play(wash, { opacity: getComputedStyle(wash).opacity }, { opacity: '1' }, duration);
  }

  async function move(direction) {
    if (phase !== 'open' || items.length < 2) return;
    releaseDrag();
    wanted = (wanted + direction + items.length) % items.length;
    const index = wanted, id = ++request;
    status.hidden = true;
    restoreDrag(160);
    try {
      const image = await loadImage(items[index]);
      if (phase !== 'open' || request !== id) return;
      if (drag?.axis) return;
      releaseDrag();
      if (index === shown) { frame.replaceChildren(image); return; }

      removeOldFrames();
      const old = frame;
      const offset = compact.matches ? 24 : 36;
      const duration = compact.matches ? 180 : 210;
      const matrix = visual(old);
      old.setAttribute('aria-hidden', 'true');
      frame = makeFrame(items[index], image);
      media.append(frame);
      shown = index;
      label(shown);
      placeCaption();
      play(old, matrix, { transform: `translateX(${-direction * offset}px)`, opacity: '0' }, duration).then(() => old.remove());
      play(frame, { transform: `translateX(${direction * offset}px)`, opacity: '0' }, centered, duration);
    } catch {
      if (phase !== 'open' || request !== id) return;
      wanted = shown;
      status.hidden = false;
    }
  }

  function releaseDrag() {
    if (!drag) return;
    const { pointer, layer } = drag;
    drag = null;
    if (layer.hasPointerCapture(pointer)) layer.releasePointerCapture(pointer);
  }

  function cancelDrag() {
    if (!drag) return;
    if (drag.axis) ignoreBackdropUntil = performance.now() + 240;
    releaseDrag();
    restoreDrag();
  }

  function dragMove(event) {
    if (!drag || event.pointerId !== drag.pointer) return;
    const x = event.clientX - drag.x, y = event.clientY - drag.y;
    if (!drag.axis) {
      if (Math.max(Math.abs(x), Math.abs(y)) < 10) return;
      drag.axis = Math.abs(x) >= Math.abs(y) ? 'x' : 'y';
      request++;
      wanted = shown;
      removeOldFrames();
    }
    const distance = drag.axis === 'x' ? x : Math.max(0, y);
    const dt = Math.max(1, event.timeStamp - drag.time);
    const speed = (distance - drag.distance) / dt;
    drag.velocity = drag.velocity * .35 + speed * .65;
    drag.distance = distance;
    drag.time = event.timeStamp;
    if (!motionEnabled()) return;

    if (drag.axis === 'x') {
      frame.style.transform = `translateX(${items.length > 1 ? distance : distance * .14}px) ${drag.base}`.trim();
    } else {
      const progress = Math.min(1, distance / (innerHeight * .55));
      frame.style.transform = `translateY(${distance}px) scale(${1 - progress * .2}) ${drag.base}`.trim();
      wash.style.opacity = String(drag.wash * (1 - progress * .7));
    }
  }

  media.addEventListener('pointerdown', event => {
    if (phase !== 'open' || event.pointerType === 'mouse') return;
    if (!event.isPrimary) { cancelDrag(); return; }
    if (event.button !== 0 || !frame.contains(event.target)) return;
    const pose = visual(frame);
    animations.get(frame)?.cancel();
    Object.assign(frame.style, pose);
    const washOpacity = getComputedStyle(wash).opacity;
    animations.get(wash)?.cancel();
    wash.style.opacity = washOpacity;
    drag = { pointer: event.pointerId, layer: frame, x: event.clientX, y: event.clientY, time: event.timeStamp, distance: 0, velocity: 0,
      axis: null, base: pose.transform === 'none' ? '' : pose.transform, wash: Number(washOpacity) };
    frame.setPointerCapture(event.pointerId);
  }, { signal });
  media.addEventListener('pointermove', dragMove, { signal });
  media.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if ((drag.axis === 'x' && event.clientX - drag.x !== drag.distance) || (drag.axis === 'y' && Math.max(0, event.clientY - drag.y) !== drag.distance) || !drag.axis) dragMove(event);
    const { axis, distance, velocity, time } = drag;
    releaseDrag();
    if (axis) ignoreBackdropUntil = performance.now() + 240;
    const flick = event.timeStamp - time < 85 && Math.abs(distance) >= 24 && Math.abs(velocity) >= .6 && Math.sign(distance) === Math.sign(velocity);
    if (axis === 'x' && items.length > 1 && (Math.abs(distance) >= clamp(frame.offsetWidth * .18, 48, 96) || flick)) move(distance < 0 ? 1 : -1);
    else if (axis === 'y' && (distance >= clamp(innerHeight * .18, 72, 128) || flick)) dismiss();
    else restoreDrag();
  }, { signal });
  for (const name of ['pointercancel', 'lostpointercapture']) {
    media.addEventListener(name, event => { if (event.pointerId === drag?.pointer) cancelDrag(); }, { signal });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest?.('[data-lightbox]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(link);
  }, { signal });
  close.addEventListener('click', dismiss, { signal });
  previous.addEventListener('click', () => move(-1), { signal });
  next.addEventListener('click', () => move(1), { signal });
  dialog.addEventListener('click', event => {
    if (performance.now() >= ignoreBackdropUntil && !event.target.closest('a, button, .lightbox-frame, figcaption, .lightbox-toolbar, .lightbox-status')) dismiss();
  }, { signal });
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); }, { signal });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowLeft' ? -1 : 1);
  }, { signal });
  document.addEventListener('insulin:motionchange', () => {
    if (motionEnabled() || phase === 'closed') return;
    if (phase === 'closing') { finish(true); return; }
    releaseDrag();
    removeOldFrames();
    restoreDrag();
  }, { signal });
  addEventListener('resize', placeCaption, { signal });
  signal.addEventListener('abort', () => finish(false), { once: true });
  return () => finish(false);
}
