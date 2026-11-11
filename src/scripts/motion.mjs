export const easeOut = 'cubic-bezier(.22,.72,.22,1)';
export const motionEnabled = () => document.documentElement.dataset.motion === 'full';

const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
const modes = ['auto', 'full', 'reduced'];
const seenByPage = new Map();

export function syncMotion(mode = document.documentElement.dataset.motionPreference || 'auto') {
  const { dataset } = document.documentElement;
  dataset.motionPreference = mode;
  dataset.motion = mode === 'reduced' || (mode === 'auto' && systemMotion.matches) ? 'reduced' : 'full';
  const toggle = document.querySelector('[data-motion-toggle]');
  if (toggle) {
    const labels = toggle.dataset.lang === 'en'
      ? ['Motion: Auto', 'Motion: Full', 'Motion: Reduced']
      : ['动效：跟随系统', '动效：完整', '动效：减少'];
    toggle.textContent = labels[modes.indexOf(mode)];
  }
  document.dispatchEvent(new Event('insulin:motionchange'));
}

export function cycleMotion() {
  const mode = modes[(modes.indexOf(document.documentElement.dataset.motionPreference) + 1) % modes.length];
  try { localStorage.setItem('insulin-motion', mode); } catch { /* Storage is optional. */ }
  syncMotion(mode);
}

systemMotion.addEventListener('change', () => syncMotion());

export function initPageMotion({ signal, restore }) {
  const elements = document.querySelectorAll('.featured-photo, .home-about, .archive-heading, .archive-entry, .member-list>li, .next-section, .threads, .archive-empty-inline');
  const seen = restore ? seenByPage.get(location.pathname) || new Set() : new Set();
  seenByPage.set(location.pathname, seen);
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target;
        observer.unobserve(element);
        if (motionEnabled() && !element.contains(document.activeElement)) element.classList.add('reveal-enter');
        seen.add(element.dataset.revealIndex);
      }
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });

    elements.forEach((element, index) => {
      const id = String(index);
      element.dataset.revealIndex = id;
      // Visible content is already handled by the entrance/route animation.
      if (seen.has(id) || element.getBoundingClientRect().top < innerHeight) seen.add(id);
      else observer.observe(element);
    });
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  }

  const desktop = matchMedia('(min-width: 900px) and (pointer: fine)');
  const photos = [...document.querySelectorAll('[data-parallax-photo] .photo-link')];
  if (!photos.length) return;

  let frame = 0;
  function draw() {
    frame = 0;
    const enabled = motionEnabled() && desktop.matches && !document.documentElement.hasAttribute('data-motion-lite');
    for (const photo of photos) {
      if (!enabled) { photo.style.removeProperty('--photo-pan'); continue; }
      const rect = photo.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= innerHeight) continue;
      const offset = Math.max(-12, Math.min(12, (innerHeight / 2 - rect.top - rect.height / 2) * .03));
      photo.style.setProperty('--photo-pan', `${offset.toFixed(2)}px`);
    }
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(draw); };
  for (const name of ['scroll', 'resize', 'pageshow']) addEventListener(name, queue, { passive: true, signal });
  desktop.addEventListener('change', queue, { signal });
  document.addEventListener('insulin:motionchange', queue, { signal });
  signal.addEventListener('abort', () => cancelAnimationFrame(frame), { once: true });
  draw();
}
