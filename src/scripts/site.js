const preferenceKey = 'insulin-language';
document.querySelectorAll('[data-language]').forEach(link => link.addEventListener('click', () => {
  try { localStorage.setItem(preferenceKey, link.dataset.language); } catch { /* Storage is optional. */ }
}));

const dialog = document.querySelector('.lightbox');
if (dialog && typeof dialog.showModal === 'function') {
  const image = dialog.querySelector('.lightbox-image');
  const caption = dialog.querySelector('.lightbox-caption');
  const previous = dialog.querySelector('[data-prev]');
  const next = dialog.querySelector('[data-next]');
  let items = [], position = 0, opener, oldOverflow = '', touchStart = null;
  const show = () => {
    const source = items[position].querySelector('img');
    image.src = items[position].href;
    image.alt = source.alt;
    caption.textContent = items[position].closest('figure').querySelector('figcaption')?.textContent || source.alt;
    dialog.querySelector('.lightbox-count').textContent = `${position + 1} / ${items.length}`;
    dialog.querySelector('.lightbox-original').href = items[position].href;
    previous.hidden = next.hidden = items.length < 2;
  };
  const move = delta => { position = (position + delta + items.length) % items.length; show(); };
  document.querySelectorAll('[data-lightbox]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    opener = link;
    items = [...link.closest('[data-gallery]').querySelectorAll('[data-lightbox]')];
    position = items.indexOf(link);
    oldOverflow = document.body.style.overflow;
    show();
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector('[data-close]').focus();
  }));
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { document.body.style.overflow = oldOverflow; image.removeAttribute('src'); opener?.focus(); });
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  });
  image.addEventListener('touchstart', event => { touchStart = event.changedTouches[0].clientX; }, { passive: true });
  image.addEventListener('touchend', event => {
    const delta = event.changedTouches[0].clientX - touchStart;
    if (touchStart !== null && Math.abs(delta) > 50 && items.length > 1) move(delta < 0 ? 1 : -1);
    touchStart = null;
  }, { passive: true });
}

document.querySelectorAll('video').forEach(video => {
  const error = video.closest('.video-wrap').querySelector('.video-error');
  const fail = () => { error.hidden = false; };
  video.addEventListener('error', fail);
  video.querySelectorAll('source').forEach(source => source.addEventListener('error', fail));
  video.addEventListener('playing', () => { error.hidden = true; });
});

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const desktop = matchMedia('(min-width: 900px)');
const layers = [...document.querySelectorAll('[data-parallax] svg')];
let frame = 0;
const draw = () => {
  frame = 0;
  layers.forEach(layer => {
    if (motion.matches || !desktop.matches) { layer.style.transform = ''; return; }
    const rect = layer.parentElement.getBoundingClientRect();
    const offset = Math.max(-18, Math.min(18, (innerHeight / 2 - rect.top - rect.height / 2) * .035));
    layer.style.transform = `translateY(${offset}px)`;
  });
};
const queue = () => { if (!frame) frame = requestAnimationFrame(draw); };
if (layers.length) {
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  motion.addEventListener('change', queue);
  desktop.addEventListener('change', queue);
  draw();
}
