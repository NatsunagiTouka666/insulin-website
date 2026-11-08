// New portable adaptation. No DOM renderer or background refraction is provided here.
const finite = (x, name) => { if (!Number.isFinite(x)) throw new TypeError(`${name} must be finite`); return x; };
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const TOKENS = Object.freeze({
  springs: Object.freeze({
    index: Object.freeze({ dampingRatio: 1, stiffness: 1000, positionThreshold: .001 }),
    velocity: Object.freeze({ dampingRatio: .5, stiffness: 300, positionThreshold: .01 }),
    press: Object.freeze({ dampingRatio: 1, stiffness: 1000, positionThreshold: .001 }),
    scaleX: Object.freeze({ dampingRatio: .6, stiffness: 250, positionThreshold: .001 }),
    scaleY: Object.freeze({ dampingRatio: .7, stiffness: 250, positionThreshold: .001 })
  }),
  pressedScale: 78 / 56,
  captureIconScale: 1.2
});

/** Unit mass, analytic spring. A new target preserves value and velocity. dt is seconds. */
export class Spring {
  constructor({ value = 0, target = value, velocity = 0, dampingRatio = 1, stiffness = 1000,
    positionThreshold = .001, velocityThreshold = .01 } = {}) {
    for (const [n, x] of Object.entries({value,target,velocity,dampingRatio,stiffness,positionThreshold,velocityThreshold})) finite(x,n);
    if (dampingRatio < 0 || stiffness <= 0 || positionThreshold <= 0 || velocityThreshold <= 0) throw new RangeError('Invalid spring configuration');
    Object.assign(this, {value,target,velocity,dampingRatio,stiffness,positionThreshold,velocityThreshold});
  }
  retarget(value) { this.target = finite(value, 'target'); return this; }
  snap(value = this.target) { this.value = this.target = finite(value, 'value'); this.velocity = 0; return this; }
  get settled() { return Math.abs(this.value-this.target) < this.positionThreshold && Math.abs(this.velocity) < this.velocityThreshold; }
  step(deltaSeconds) {
    finite(deltaSeconds, 'deltaSeconds');
    if (deltaSeconds < 0) throw new RangeError('deltaSeconds must be non-negative');
    const t = Math.min(deltaSeconds, .064);
    if (t === 0) return this.value;
    const w = Math.sqrt(this.stiffness), z = this.dampingRatio, x = this.value-this.target, v = this.velocity;
    let nx, nv;
    if (Math.abs(z-1) < 1e-7) {
      const b = v+w*x, decay = Math.exp(-w*t);
      nx = decay*(x+b*t); nv = decay*(v-w*b*t);
    } else if (z < 1) {
      const a = z*w, wd = w*Math.sqrt(1-z*z), decay = Math.exp(-a*t), c = Math.cos(wd*t), s = Math.sin(wd*t);
      nx = decay*(x*c+(v+a*x)/wd*s);
      nv = decay*(v*c-(a*v+w*w*x)/wd*s);
    } else {
      const q = Math.sqrt(z*z-1), r1 = -w/(z+q), r2 = -w*(z+q), a = (v-r2*x)/(r1-r2), b = x-a;
      const e1 = Math.exp(r1*t), e2 = Math.exp(r2*t);
      nx = a*e1+b*e2; nv = r1*a*e1+r2*b*e2;
    }
    this.value = this.target+nx; this.velocity = nv;
    if (this.settled) this.snap();
    return this.value;
  }
}

/** velocity is filtered, range-normalized INDEX velocity, not pixels/second. */
export function selectorScale(scaleX, scaleY, normalizedIndexVelocity) {
  finite(scaleX,'scaleX'); finite(scaleY,'scaleY'); finite(normalizedIndexVelocity,'velocity');
  const v = normalizedIndexVelocity/10;
  return { x: scaleX/(1-clamp(v*.75,-.2,.2)), y: scaleY*(1-clamp(v*.25,-.2,.2)) };
}

export function tabMetrics(width, count, padding = 4) {
  finite(width,'width'); finite(padding,'padding');
  if (!Number.isInteger(count) || count < 1 || padding < 0 || width <= padding*2) throw new RangeError('Invalid dock geometry');
  return { width, count, padding, tabWidth: (width-padding*2)/count, maxIndex: count-1 };
}
export function tabAt(x, metrics, rtl = false) {
  finite(x,'x');
  return clamp(Math.floor(((rtl ? metrics.width-x : x)-metrics.padding)/metrics.tabWidth),0,metrics.maxIndex);
}
export function selectorX(index, metrics, rtl = false, panelOffset = 0) {
  finite(index,'index'); finite(panelOffset,'panelOffset');
  const i = clamp(index,0,metrics.maxIndex);
  return (rtl ? metrics.width-metrics.padding-(i+1)*metrics.tabWidth : metrics.padding+i*metrics.tabWidth)+panelOffset;
}
export function nextTab(current, key, count, rtl = false) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be positive');
  if (!Number.isInteger(current)) throw new RangeError('current must be an integer');
  const i = clamp(current,0,count-1);
  if (key === 'Home') return 0;
  if (key === 'End') return count-1;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return i;
  return (i+(key === 'ArrowRight' ? 1 : -1)*(rtl ? -1 : 1)+count)%count;
}
