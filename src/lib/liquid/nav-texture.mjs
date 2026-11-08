/**
 * A controlled texture source for this demo's three navigation buttons.
 *
 * This is not a DOM screenshot implementation. It redraws the existing pill's
 * flat CSS surface, its plain span labels, and the three SVG path icons using
 * their real viewport rectangles and computed styles. The selector and every
 * optical output are deliberately excluded, so there is no sampling feedback.
 * No semantic, focusable, or event-bearing DOM nodes are duplicated.
 */
export class NavigationTexture {
  constructor(stage, dock) {
    this.stage = stage;
    this.dock = dock;
    this.canvas = stage.ownerDocument.createElement('canvas');
    this.labels = stage.ownerDocument.createElement('canvas');
    this.context = this.canvas.getContext('2d', { alpha: false });
    this.labelContext = this.labels.getContext('2d');
    if (!this.context || !this.labelContext) throw new Error('Canvas2D unavailable');
    this.revision = 0;
    this.labelRevision = 0;
    this.invalid = true;
    this.destroyed = false;
    this.sourceRevision = Symbol('uninitialized');
    this.source = null;
    this.key = '';
    this._onFonts = () => this.invalidate();
    this.observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.invalidate()) : null;
    this.observer?.observe(stage);
    this.observer?.observe(dock);
    this.fonts = stage.ownerDocument.fonts;
    this.fonts?.addEventListener?.('loadingdone', this._onFonts);
    this.fonts?.ready?.then(() => { if (!this.destroyed) this.invalidate(); });
  }

  invalidate() { this.invalid = true; }

  /**
   * sourceCanvas must be the opaque scene background, excluding the navigation
   * and optical output. Canvas dimensions use physical pixels; all DOM geometry
   * is measured once per invalidation in stage-local CSS coordinates.
   */
  update(sourceCanvas, { dpr = 1, revision, selected } = {}) {
    if (this.destroyed) throw new Error('NavigationTexture has been destroyed');
    if (!sourceCanvas?.width || !sourceCanvas?.height) throw new Error('Empty scene texture');
    if (sourceCanvas === this.canvas || sourceCanvas === this.labels) {
      throw new Error('NavigationTexture cannot sample its own output');
    }
    const doc = this.stage.ownerDocument;
    // Class/selection checks are cheap. DOM Range/style measurement happens
    // only when these change, on resize, on font load, or after invalidate().
    const key = [sourceCanvas.width, sourceCanvas.height, dpr, selected,
      this.stage.className, this.dock.className, doc.body.className].join('|');
    const rebuild = this.invalid || key !== this.key;
    if (rebuild) {
      this._rasterize(sourceCanvas.width, sourceCanvas.height);
      this.key = key;
      this.invalid = false;
      this.labelRevision++;
    }
    if (rebuild || this.source !== sourceCanvas || this.sourceRevision !== revision || revision === undefined) {
      if (this.canvas.width !== sourceCanvas.width || this.canvas.height !== sourceCanvas.height) {
        this.canvas.width = sourceCanvas.width;
        this.canvas.height = sourceCanvas.height;
      }
      const c = this.context;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'copy';
      // The source is opaque by contract. The alpha:false destination ensures
      // all returned texture pixels remain opaque even if a caller violates it.
      c.drawImage(sourceCanvas, 0, 0, this.canvas.width, this.canvas.height);
      c.globalCompositeOperation = 'source-over';
      c.drawImage(this.labels, 0, 0);
      this.source = sourceCanvas;
      this.sourceRevision = revision;
      this.revision++;
    }
    return { canvas: this.canvas, revision: this.revision };
  }

  _rasterize(width, height) {
    this.labels.width = width;
    this.labels.height = height;
    const stageRect = this.stage.getBoundingClientRect();
    if (!stageRect.width || !stageRect.height) return;
    const c = this.labelContext;
    c.setTransform(width / stageRect.width, 0, 0, height / stageRect.height, 0, 0);
    const rect = this.dock.getBoundingClientRect();
    const panel = getComputedStyle(this.dock);
    const x = rect.left - stageRect.left, y = rect.top - stageRect.top;
    const border = Number.parseFloat(panel.borderLeftWidth) || 0;
    const radius = Math.min(Number.parseFloat(panel.borderTopLeftRadius) || rect.height / 2,
      rect.width / 2, rect.height / 2);
    c.beginPath();
    c.roundRect(x, y, rect.width, rect.height, radius);
    c.fillStyle = panel.backgroundColor;
    c.fill();
    if (border > 0 && panel.borderLeftStyle !== 'none') {
      c.beginPath();
      c.roundRect(x + border / 2, y + border / 2,
        Math.max(0, rect.width - border), Math.max(0, rect.height - border), Math.max(0, radius - border / 2));
      c.strokeStyle = panel.borderLeftColor;
      c.lineWidth = border;
      c.stroke();
    }

    // Only the actual buttons are read, never #selector or other canvas layers.
    // insulin adaptation: retain the real anchor semantics and rasterize only labels.
    for (const button of this.dock.querySelectorAll('a[data-liquid-tab]')) {
      for (const svg of button.querySelectorAll('svg')) this._drawIcon(c, svg, stageRect);
      for (const span of button.querySelectorAll('[data-liquid-label]')) this._drawText(c, span, stageRect);
    }
  }

  _drawText(c, span, stageRect) {
    const text = span.textContent || '';
    if (!text) return;
    const style = getComputedStyle(span);
    const range = span.ownerDocument.createRange();
    range.selectNodeContents(span);
    const rect = range.getBoundingClientRect();
    range.detach?.();
    if (!rect.width || !rect.height) return;
    c.save();
    c.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    c.fillStyle = style.color;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.direction = style.direction;
    if ('fontKerning' in c) c.fontKerning = style.fontKerning || 'auto';
    if ('letterSpacing' in c) c.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
    const metrics = c.measureText(text);
    // A Range reports the browser's font rectangle rather than its parent
    // flex line-height. Use font metrics to recover that rectangle's baseline;
    // fall back to the actual glyph ink bounds on older Canvas implementations.
    const ascent = Number.isFinite(metrics.fontBoundingBoxAscent)
      ? metrics.fontBoundingBoxAscent : metrics.actualBoundingBoxAscent;
    const descent = Number.isFinite(metrics.fontBoundingBoxDescent)
      ? metrics.fontBoundingBoxDescent : metrics.actualBoundingBoxDescent;
    const baseline = rect.top - stageRect.top + (rect.height - ascent - descent) / 2 + ascent;
    c.fillText(text, rect.left - stageRect.left, baseline);
    c.restore();
  }

  _drawIcon(c, svg, stageRect) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const view = svg.viewBox.baseVal;
    const viewWidth = view.width || 24, viewHeight = view.height || 24;
    c.save();
    c.translate(rect.left - stageRect.left, rect.top - stageRect.top);
    c.scale(rect.width / viewWidth, rect.height / viewHeight);
    c.translate(-view.x, -view.y);
    for (const element of svg.querySelectorAll('path')) {
      const d = element.getAttribute('d');
      if (!d) continue;
      const style = getComputedStyle(element);
      const path = new Path2D(d);
      c.globalAlpha = Number.parseFloat(style.opacity) || 1;
      c.lineWidth = Number.parseFloat(style.strokeWidth) || 1.5;
      c.lineCap = style.strokeLinecap;
      c.lineJoin = style.strokeLinejoin;
      if (style.fill !== 'none') { c.fillStyle = style.fill; c.fill(path); }
      if (style.stroke !== 'none') { c.strokeStyle = style.stroke; c.stroke(path); }
    }
    c.restore();
  }

  destroy() {
    this.observer?.disconnect();
    this.fonts?.removeEventListener?.('loadingdone', this._onFonts);
    this.destroyed = true;
  }
}
