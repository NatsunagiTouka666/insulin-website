import { navigate } from 'astro:transitions/client';
import { cycleMotion, easeOut, initPageMotion, motionEnabled, syncMotion } from './motion.mjs';
import { initLiquidNavigation } from './liquid-navigation.mjs';
import { initLightbox } from './lightbox.mjs';

const root = document.documentElement;
let page, navigation, swap, photoPair, activeTransition;
let pageAnimations = [], outgoingLayer;

function mountPage({ restore = false, liquid } = {}) {
  page?.controller.abort();
  const controller = new AbortController();
  const { signal } = controller;
  syncMotion();
  initPageMotion({ signal, restore });
  const closeGallery = initLightbox(document.querySelector('.lightbox'), signal);
  const navigationState = initLiquidNavigation(document.querySelector('[data-liquid-navigation]'), {
    motionEnabled,
    signal,
    initial: liquid,
    navigate(link) {
      if (link.pathname !== location.pathname || navigation) navigate(link.href, { sourceElement: link });
    },
  });

  for (const video of document.querySelectorAll('video')) {
    const error = video.closest('.video-wrap')?.querySelector('.video-error');
    if (!error) continue;
    const showError = () => { error.hidden = false; };
    if (video.error) showError();
    video.addEventListener('error', showError, { signal });
    for (const source of video.querySelectorAll('source')) source.addEventListener('error', showError, { signal });
    video.addEventListener('playing', () => { error.hidden = true; }, { signal });
  }
  page = { controller, closeGallery, navigationState };
}

function readPosition() {
  if (scrollY < 24) return null;
  const line = innerHeight * .28;
  const middle = innerWidth / 2;
  let result, best = Infinity;
  for (const element of document.querySelectorAll('[data-reading-anchor]')) {
    const rect = element.getBoundingClientRect();
    if (rect.top >= innerHeight || rect.bottom <= 0) continue;
    const dy = Math.max(0, rect.top - line, line - rect.bottom);
    const dx = Math.max(0, rect.left - middle, middle - rect.right);
    const score = dy + dx * .18 + rect.height * .025;
    if (score >= best) continue;
    best = score;
    const progress = Math.max(0, Math.min(1, (line - rect.top) / rect.height));
    result = { key: element.dataset.readingAnchor, progress, y: rect.top + progress * rect.height };
  }
  return result;
}

function positionAt({ key, progress, y }) {
  const element = document.querySelector(`[data-reading-anchor="${CSS.escape(key)}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  scrollTo({ top: scrollY + rect.top + rect.height * progress - y, behavior: 'instant' });
  return element;
}

function visiblePhoto(elements) {
  const headerBottom = document.querySelector('.site-header')?.getBoundingClientRect().bottom || 0;
  return [...elements].filter(image => image.complete && image.naturalWidth).find(image => {
    const rect = image.getBoundingClientRect();
    return rect.width > 0 && rect.bottom > headerBottom + 12 && rect.top < innerHeight - 12;
  });
}

function transitionPhotos(event, language) {
  const newPage = event.newDocument;
  const oldDetail = document.querySelector('[data-detail]')?.dataset.detail;
  const newDetail = newPage.querySelector('[data-detail]')?.dataset.detail;
  let previous, next;

  if (language) {
    // The anchor distinguishes the featured image from repeated archive thumbnails.
    previous = visiblePhoto(document.querySelectorAll('main .photo-link img'));
    const anchor = previous?.closest('[data-reading-anchor]')?.dataset.readingAnchor;
    if (anchor) next = newPage.querySelector(`[data-reading-anchor="${CSS.escape(anchor)}"] .photo-link img`);
  } else if (oldDetail !== newDetail) {
    const id = newDetail || oldDetail;
    const selector = `[data-record="${CSS.escape(id)}"]`;
    const source = event.sourceElement?.closest(selector);
    const originals = source ? source.querySelectorAll('.photo-link img') : document.querySelectorAll(`${selector} .photo-link img`);
    const destinations = [...newPage.querySelectorAll(`${selector} .photo-link img`)];
    previous = visiblePhoto([...originals].filter(image => destinations.some(candidate => photoHref(candidate) === photoHref(image))));
    next = destinations.find(candidate => photoHref(candidate) === photoHref(previous));
  }

  if (!previous || !next || photoHref(previous) !== photoHref(next)) return;
  previous.dataset.transitionPhoto = '';
  next.dataset.transitionPhoto = '';
  if (previous.currentSrc) {
    // Use the decoded image for the new snapshot, then resume responsive selection.
    const responsive = ['src', 'srcset', 'sizes', 'loading'].map(name => [name, next.getAttribute(name)]);
    next.removeAttribute('srcset');
    next.removeAttribute('sizes');
    next.setAttribute('loading', 'eager');
    next.src = previous.currentSrc;
    return { previous, next, responsive };
  }
  return { previous, next, responsive: [] };
}

const photoHref = image => image?.closest('.photo-link').getAttribute('href');

function resetPair(pair = photoPair) {
  if (!pair) return;
  pair.previous.removeAttribute('data-transition-photo');
  pair.next.removeAttribute('data-transition-photo');
  for (const [name, value] of pair.responsive) {
    if (value === null) pair.next.removeAttribute(name);
    else pair.next.setAttribute(name, value);
  }
  if (pair === photoPair) photoPair = null;
}

function interruptTransition() {
  if (!activeTransition) return;
  activeTransition.ready.catch(() => {});
  activeTransition.skipTransition();
}

function captureOutgoingText() {
  return [...document.querySelectorAll('main, .site-footer')].flatMap(element => {
    const { top, left, width, bottom } = element.getBoundingClientRect();
    return top < innerHeight && bottom > 0 ? [{ element, top, left, width }] : [];
  });
}

function animateArrival(state) {
  const main = document.querySelector('main');
  if (!motionEnabled() || !main?.animate || state.restore || state.isSameRoute) return;
  if (!state.language) {
    const distance = innerWidth <= 600 ? 5 : 10;
    const first = state.pair ? { opacity: .6 } : { opacity: .55, transform: `translateY(${distance}px)` };
    pageAnimations.push(main.animate([first, { opacity: 1, transform: 'none' }], { duration: 240, easing: easeOut }));
    const photo = !state.pair && visiblePhoto(main.querySelectorAll('.photo-link img'));
    if (photo) pageAnimations.push(photo.animate([{ opacity: .45 }, { opacity: 1 }], { duration: 205, delay: 35, fill: 'backwards', easing: easeOut }));
    return;
  }

  const textSelector = 'h1,h2,h3,p,figcaption,.entry-heading,.eyebrow,.section-label,.member-number,.role-line,a:not(.photo-link),button';
  for (const text of document.querySelectorAll(`main :is(${textSelector}), footer :is(${textSelector}), .header-controls a`)) {
    const { top, bottom } = text.getBoundingClientRect();
    if (top < innerHeight && bottom > 0 && !text.parentElement.closest(textSelector)) {
      pageAnimations.push(text.animate([{ opacity: .25 }, { opacity: 1 }], { duration: 180, easing: easeOut }));
    }
  }

  if (!state.outgoingText?.length) return;
  const layer = document.createElement('div');
  layer.className = 'outgoing-language';
  layer.inert = true;
  layer.setAttribute('aria-hidden', 'true');
  state.pair?.previous.removeAttribute('data-transition-photo');
  for (const { element, top, left, width } of state.outgoingText) {
    element.removeAttribute('id');
    element.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
    Object.assign(element.style, { position: 'absolute', top: `${top}px`, left: `${left}px`, width: `${width}px`, margin: '0' });
    layer.append(element);
  }
  document.body.append(layer);
  outgoingLayer = layer;
  const animation = layer.animate([{ opacity: .7 }, { opacity: 0 }], { duration: 160, easing: easeOut });
  pageAnimations.push(animation);
  animation.finished.catch(() => {}).then(() => {
    layer.remove();
    if (outgoingLayer === layer) outgoingLayer = null;
  });
}

function clearArrival() {
  for (const animation of pageAnimations) animation.cancel();
  pageAnimations = [];
  outgoingLayer?.remove();
  outgoingLayer = null;
}

document.addEventListener('astro:before-preparation', event => {
  outgoingLayer?.remove();
  resetPair();
  const restore = event.navigationType === 'traverse';
  const language = event.from.pathname.slice(4) === event.to.pathname.slice(4)
    && /^\/(zh|en)\//.test(event.from.pathname) && /^\/(zh|en)\//.test(event.to.pathname)
    && event.from.pathname.slice(0, 4) !== event.to.pathname.slice(0, 4);
  const isSameRoute = event.from.pathname === event.to.pathname;
  const archiveOrigin = !restore && history.state?.insulinArchiveOrigin;
  const source = event.sourceElement;
  const keyboard = source?.matches(':focus-visible');
  const loader = event.loader;
  const state = { restore, language, isSameRoute, keyboard, source, archiveOrigin };
  navigation = state;

  event.signal.addEventListener('abort', () => {
    if (navigation === state) navigation = null;
    if (state.pair && state.pair === photoPair && !state.pair.next.isConnected) resetPair();
  }, { once: true });

  event.loader = async () => {
    await loader();
    if (event.signal.aborted || event.defaultPrevented) return;
    page?.closeGallery();
    if (isSameRoute && !restore) state.scroll = { left: scrollX, top: scrollY, behavior: 'instant' };
    if (language && !restore) state.position = readPosition();
    const record = source?.closest('.archive-grid [data-record]');
    if (source?.matches('[data-open-record]') && record) {
      state.newArchiveOrigin = { key: record.dataset.readingAnchor, progress: 0, y: record.getBoundingClientRect().top };
    }
    if (motionEnabled() && document.startViewTransition) {
      state.pair = photoPair = transitionPhotos(event, language);
    }
  };
});

document.addEventListener('astro:before-swap', event => {
  const state = navigation;
  if (!state || event.signal.aborted) return;
  swap = state;
  const incoming = event.newDocument.documentElement.dataset;
  incoming.motion = root.dataset.motion;
  incoming.motionPreference = root.dataset.motionPreference;
  if (root.hasAttribute('data-motion-lite')) incoming.motionLite = '';
  const archiveReturn = state.source?.matches('[data-archive-return]');
  const detailDirection = event.newDocument.querySelector('[data-detail]') ? 'detail' : 'return';
  incoming.swap = state.restore && !state.pair ? 'history' : state.language ? 'language' : state.pair ? detailDirection : 'page';
  if (state.isSameRoute) incoming.swap = 'history';

  if (state.language && !state.restore && motionEnabled()) state.outgoingText = captureOutgoingText();
  clearArrival();
  state.liquid = page?.navigationState?.();
  page?.controller.abort();
  activeTransition = event.viewTransition;
  event.viewTransition.ready.catch(() => {});
  const finish = () => {
    if (state.pair === photoPair) resetPair();
    if (activeTransition === event.viewTransition) {
      activeTransition = null;
      delete root.dataset.swap;
    }
  };
  event.viewTransition.finished.then(finish, finish);
  if (!motionEnabled() || !state.pair || state.isSameRoute) {
    event.viewTransition.skipTransition();
  }
  if (archiveReturn && state.archiveOrigin) state.position = state.archiveOrigin;
});

document.addEventListener('astro:after-swap', () => {
  const state = swap;
  swap = null;
  if (!state) return;
  if (navigation === state) navigation = null;
  if (state.scroll) scrollTo(state.scroll);
  const target = state.position && positionAt(state.position);
  const origin = state.newArchiveOrigin || (state.language ? state.archiveOrigin : null);
  if (origin && !state.restore && history.state) history.replaceState({ ...history.state, insulinArchiveOrigin: origin }, '');
  mountPage({ restore: state.restore || !!state.position, liquid: state.liquid });

  if (!state.restore) {
    let focus = document.querySelector('main');
    if (state.keyboard && state.source.matches('[data-language]')) {
      focus = document.querySelector(state.source.closest('footer') ? 'footer [data-language]' : '.language-switch');
    } else if (state.keyboard && state.source.matches('[data-liquid-tab]')) {
      focus = document.querySelector('[data-liquid-tab][aria-current]');
    } else if (state.keyboard && state.source.matches('[data-archive-return]')) {
      focus = target?.querySelector('[data-open-record]') || focus;
    }
    focus?.focus({ preventScroll: true });
  }

  animateArrival(state);
});

document.addEventListener('click', event => {
  if (event.target.closest('[data-motion-toggle]')) { cycleMotion(); return; }
  const link = event.target.closest('a');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (link.hasAttribute('data-lightbox')) interruptTransition();
  if (link.dataset.language) {
    try { localStorage.setItem('insulin-language', link.dataset.language); } catch { /* Storage is optional. */ }
  }
  if (!link.matches('.skip-link, .scroll-note, .to-top')) return;
  const target = document.getElementById(link.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  const skip = link.matches('.skip-link');
  const focus = skip || link.matches(':focus-visible');
  const start = { left: scrollX, top: scrollY, behavior: 'instant' };
  navigate(link.href, { sourceElement: link }).then(() => {
    if (!target.isConnected || location.hash !== link.hash) return;
    if (motionEnabled() && !skip) {
      // The router writes the hash and may scroll immediately. Start the smooth
      // scroll from the user's previous position in the same frame.
      scrollTo(start);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (focus) target.focus({ preventScroll: true });
  });
}, true);

const feedback = 'a:not([data-liquid-tab]), button';
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' || (event.key === ' ' && event.target.matches('button'))) {
    event.target.closest(feedback)?.classList.add('is-key-pressed');
  }
});
for (const name of ['keyup', 'focusout']) {
  document.addEventListener(name, event => event.target.closest(feedback)?.classList.remove('is-key-pressed'));
}
document.addEventListener('insulin:motionchange', () => {
  if (motionEnabled()) return;
  delete root.dataset.entrance;
  scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
  clearArrival();
  interruptTransition();
});
addEventListener('pagehide', () => page?.closeGallery());

mountPage({ restore: performance.getEntriesByType('navigation')[0]?.type === 'back_forward' });
