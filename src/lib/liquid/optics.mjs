/*
 * Nexio Liquid Lab — controlled-canvas, two-dimensional WebGL lens adapter.
 * SDF/circleMap adapted from:
 * NexioSchedule e67f3b79b9c465789ef7ae192b9c23740e7519da,
 * backdrop/src/commonMain/kotlin/com/kyant/backdrop/internal/Shaders.kt
 * https://github.com/HaoZai000/NexioSchedule/tree/e67f3b79b9c465789ef7ae192b9c23740e7519da
 * Original shader Copyright 2025 Kyant, Apache License 2.0.
 * https://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an AS IS basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 * The original shader's broad RGB seven-position weights have been replaced by
 * a Web-only seven-wavelength approximation (650, 610, 580, 550, 500, 460, 420nm).
 * Its wavelength-dependent sample positions follow a normalized 1/lambda^2
 * Cauchy term; RGB response weights are illustrative and channel-normalized.
 * Web coordinate handling, blur, magnification, light and pressure response are
 * new adaptations. This is neither an AGSL parameter replica nor ray tracing.
 */

const bandDefinitions = [
  ['red',    650, [1, 0, 0]],
  ['orange', 610, [1, .37, 0]],
  ['yellow', 580, [.85, 1, 0]],
  ['green',  550, [.03, 1, .02]],
  ['cyan',   500, [0, .75, .8]],
  ['blue',   460, [.05, .08, 1]],
  ['violet', 420, [.45, 0, .9]]
];
const channelTotals = [0, 1, 2].map(channel =>
  bandDefinitions.reduce((total, band) => total + band[2][channel], 0));
const cauchySpan = 1 / 420 ** 2 - 1 / 650 ** 2;
const referenceCauchy = 1 / 550 ** 2;

/** Public diagnostics for the shader's exact seven-band inputs. RGB weights
 * sum to one PER CHANNEL, keeping constant white/neutral regions neutral. */
export const SPECTRUM_BANDS = Object.freeze(bandDefinitions.map(([name, wavelengthNm, response]) =>
  Object.freeze({
    name, wavelengthNm,
    offset: (1 / wavelengthNm ** 2 - referenceCauchy) / cauchySpan,
    weights: Object.freeze(response.map((value, channel) => value / channelTotals[channel]))
  })));

const bandSamplesGLSL = SPECTRUM_BANDS.map((band, i) =>
  `vec4 band${i} = softSample(p - spread * ${band.offset.toFixed(9)}, blurAmount);`
).join('\n  ');
const bandRGBGLSL = SPECTRUM_BANDS.map((band, i) =>
  `band${i}.rgb * vec3(${band.weights.map(weight => weight.toFixed(9)).join(', ')})`
).join(' +\n    ');
const bandAlphaGLSL = SPECTRUM_BANDS.map((_, i) => `band${i}.a`).join(' + ');

const VERTEX = `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0., 1.); }
`;

const FRAGMENT = `
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_size;
uniform vec2 u_frame;
uniform vec4 u_rect;
uniform vec3 u_shape;
uniform vec2 u_light;
uniform float u_refract;
uniform float u_dispersion;
uniform float u_blur;
uniform float u_tint;
uniform float u_dark;
uniform float u_saturation;
uniform float u_content;

float roundedDistance(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  return length(max(q, vec2(0.))) + min(max(q.x, q.y), 0.) - radius;
}

vec2 roundedNormal(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;
  vec2 s = vec2(p.x < 0. ? -1. : 1., p.y < 0. ? -1. : 1.);
  vec2 positive = max(q, vec2(0.));
  float len = length(positive);
  if (len > .0001) return positive / len * s;
  return q.x > q.y ? vec2(s.x, 0.) : vec2(0., s.y);
}

vec4 sampleAt(vec2 p) {
  // Canvas upload is deliberately NOT flipped. All public geometry is top-left
  // CSS pixels, and v=0 therefore addresses the source canvas's top row.
  vec2 uv = clamp(p / u_size, .5 / u_size, vec2(1.) - .5 / u_size);
  return texture2D(u_source, uv);
}

vec4 softSample(vec2 p, float blurAmount) {
  vec4 c = sampleAt(p);
  if (blurAmount < .01) return c;
  // Five-sample, separable-looking softening, not a CSS backdrop-filter.
  vec2 b = vec2(blurAmount * .65, 0.);
  return c * .4 + (
    sampleAt(p + b) + sampleAt(p - b) +
    sampleAt(p + b.yx) + sampleAt(p - b.yx)
  ) * .15;
}

vec4 spectral(vec2 p, vec2 spread, float blurAmount) {
  // Shorter wavelengths sample farther along the curved-surface refraction.
  // The generated values share SPECTRUM_BANDS with the diagnostic export.
  ${bandSamplesGLSL}
  return vec4(
    ${bandRGBGLSL},
    (${bandAlphaGLSL}) / 7.
  );
}

void main() {
  vec2 p = vec2(gl_FragCoord.x / u_frame.x,
                1. - gl_FragCoord.y / u_frame.y) * u_size;
  vec2 halfSize = u_rect.zw * .5;
  vec2 center = u_rect.xy + halfSize;
  vec2 local = p - center;
  float radius = clamp(u_shape.x, 0., min(halfSize.x, halfSize.y));
  float sd = roundedDistance(local, halfSize, radius);
  float pixel = max(u_size.x / u_frame.x, u_size.y / u_frame.y);
  // Everything outside the current contour remains transparent.
  if (sd >= pixel * .6) discard;
  float coverage = 1. - smoothstep(-pixel * .6, pixel * .6, sd);
  vec2 normal = roundedNormal(local, halfSize, radius);
  float pressure = clamp(u_shape.y, 0., 1.);
  float speed = min(abs(u_shape.z), 10.) / 10.;
  float edgeWidth = max(.5, min(14. + pressure * 9. + speed * 5.,
                               min(halfSize.x, halfSize.y) * .88));
  float t = clamp(1. - max(-sd, 0.) / edgeWidth, 0., 1.);
  float sag = 1. - sqrt(max(1. - t * t, 0.));
  float amount = (15. + pressure * 17. + speed * 9.) * u_refract;
  float magnify = (.022 + pressure * .035) * u_refract;
  vec2 warped = p - normal * sag * amount - local * magnify;
  // Peak red-to-violet separation is ~7.5 CSS px at the default .65 control
  // while held, versus ~.5px idle. All separation is SAMPLE displacement.
  vec2 spread = normal * sag * u_dispersion * (.8 + pressure * 10.8 + speed * 3.);
  // Foreground labels remain comparatively legible at the lens center; the
  // curved edge receives the blur. Background glass keeps its slider-wide blur.
  float blurAmount = u_blur * mix(1., .06 + .7 * pow(t, .7), u_content);
  vec4 source = spectral(warped, spread, blurAmount);
  vec3 color = source.rgb;
  float lum = dot(color, vec3(.2126, .7152, .0722));
  color = mix(vec3(lum), color, u_saturation);
  color = mix(color, mix(vec3(1.), vec3(.045, .055, .075), u_dark), u_tint);

  // The same animated contour and its normal drive the edge lighting.
  vec2 lightPoint = u_light * u_size;
  vec2 toLight = lightPoint - center;
  vec2 lightDirection = length(toLight) > .1 ? normalize(toLight) : vec2(-.6, -.8);
  float facing = dot(normal, lightDirection);
  float rim = exp(-max(-sd, 0.) / 1.15);
  float inner = exp(-pow((max(-sd, 0.) - 3.1) / 2.4, 2.));
  float environmental = .16 + .1 * (1. - lum) + pressure * .09;
  float highlight = rim * (max(facing, 0.) * .46 + .075) +
                    inner * max(facing, 0.) * environmental;
  float shade = rim * max(-facing, 0.) * (.12 + pressure * .02);
  color = mix(color, vec3(1.), clamp(highlight, 0., .74));
  color *= 1. - shade;
  gl_FragColor = vec4(clamp(color, 0., 1.), coverage * source.a);
}
`;

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;

export class OpticsRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.available = false;
    this.error = '';
    this.revision = Symbol('uninitialized');
    this.source = null;
    this.uploadCount = 0;
    this.drawCount = 0;
    this._lost = event => {
      event.preventDefault();
      this.available = false;
      this.error = 'WebGL context lost';
      this._clearCSS();
    };
    this._restored = () => this._initialize();
    canvas.addEventListener('webglcontextlost', this._lost);
    canvas.addEventListener('webglcontextrestored', this._restored);
    this._initialize();
  }

  _clearCSS() { this.canvas.dataset.optics = 'fallback'; }

  _initialize() {
    this.available = false;
    this.error = '';
    try {
      const gl = this.canvas.getContext('webgl', {
        alpha: true, antialias: false, premultipliedAlpha: false,
        preserveDrawingBuffer: false, depth: false, stencil: false,
        powerPreference: 'default'
      });
      if (!gl) throw new Error('WebGL unavailable');
      this.gl = gl;
      const compile = (type, text) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, text);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const reason = gl.getShaderInfoLog(shader) || 'Shader compilation failed';
          gl.deleteShader(shader);
          throw new Error(reason);
        }
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, VERTEX);
      let fragment;
      try { fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT); }
      catch (error) { gl.deleteShader(vertex); throw error; }
      const program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const reason = gl.getProgramInfoLog(program) || 'Shader linking failed';
        gl.deleteProgram(program);
        throw new Error(reason);
      }
      this.program = program;
      gl.useProgram(program);
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      this.uniform = {};
      for (const name of ['source','size','frame','rect','shape','light','refract','dispersion','blur','tint','dark','saturation','content']) {
        this.uniform[name] = gl.getUniformLocation(program, 'u_' + name);
      }
      gl.uniform1i(this.uniform.source, 0);
      gl.disable(gl.DEPTH_TEST);
      // Later lenses replace earlier glass, avoiding double tint or feedback.
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      this.source = null;
      this.revision = Symbol('restored');
      this.available = true;
      this.canvas.dataset.optics = 'webgl';
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this._clearCSS();
    }
  }

  /**
   * Render lenses over an opaque controlled Canvas2D scene. Coordinates and
   * blur are CSS px; source may have any pixel density. Give revision a new
   * value when the source changes; omit revision to upload on every call.
   * Return false on unavailable/lost contexts, leaving CSS fallback to caller.
   */
  render(sourceCanvas, lenses = [], options = {}) {
    if (!this.available || !sourceCanvas?.width || !sourceCanvas?.height) return false;
    const gl = this.gl;
    if (gl.isContextLost()) return false;
    try {
      const bounds = this.canvas.getBoundingClientRect();
      const dpr = clamp(finite(options.dpr, Math.min(globalThis.devicePixelRatio || 1, 2)), .5, 3);
      const width = finite(options.width, bounds.width) || sourceCanvas.clientWidth || sourceCanvas.width / dpr;
      const height = finite(options.height, bounds.height) || sourceCanvas.clientHeight || sourceCanvas.height / dpr;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;
      }
      gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.disable(gl.SCISSOR_TEST);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      if (this.source !== sourceCanvas || !Object.hasOwn(options, 'revision') ||
          this.revision !== options.revision || this.sourceWidth !== sourceCanvas.width ||
          this.sourceHeight !== sourceCanvas.height) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        this.source = sourceCanvas;
        this.sourceWidth = sourceCanvas.width;
        this.sourceHeight = sourceCanvas.height;
        this.revision = options.revision;
        this.uploadCount++;
      }
      const u = this.uniform;
      gl.uniform2f(u.size, width, height);
      gl.uniform2f(u.frame, pixelWidth, pixelHeight);
      gl.uniform2f(u.light, finite(options.light?.[0], .15), finite(options.light?.[1], .1));
      gl.uniform1f(u.refract, clamp(finite(options.refraction, 1), 0, 3));
      gl.uniform1f(u.dispersion, clamp(finite(options.dispersion, .65), 0, 5));
      gl.uniform1f(u.blur, clamp(finite(options.blur, 4), 0, 24));
      gl.uniform1f(u.tint, clamp(finite(options.tint, .07), 0, 1));
      gl.uniform1f(u.dark, options.dark ? 1 : 0);
      gl.uniform1f(u.saturation, clamp(finite(options.saturation, 1.25), 0, 2));
      gl.uniform1f(u.content, options.content ? 1 : 0);
      const ratioX = pixelWidth / width;
      const ratioY = pixelHeight / height;
      gl.enable(gl.SCISSOR_TEST);
      for (const lens of lenses) {
        if (!lens || ![lens.x,lens.y,lens.w,lens.h].every(Number.isFinite) || lens.w <= 0 || lens.h <= 0) continue;
        const left = clamp(Math.floor((lens.x - 2) * ratioX), 0, pixelWidth);
        const top = clamp(Math.floor((lens.y - 2) * ratioY), 0, pixelHeight);
        const right = clamp(Math.ceil((lens.x + lens.w + 2) * ratioX), 0, pixelWidth);
        const bottom = clamp(Math.ceil((lens.y + lens.h + 2) * ratioY), 0, pixelHeight);
        if (right <= left || bottom <= top) continue;
        gl.scissor(left, pixelHeight - bottom, right - left, bottom - top);
        gl.uniform4f(u.rect, lens.x, lens.y, lens.w, lens.h);
        gl.uniform1f(u.refract, clamp(finite(options.refraction, 1) * finite(lens.refraction, 1), 0, 3));
        gl.uniform1f(u.dispersion, clamp(finite(options.dispersion, .65) * finite(lens.dispersion, 1), 0, 5));
        gl.uniform1f(u.blur, clamp(finite(options.blur, 4) * finite(lens.blur, 1), 0, 24));
        gl.uniform3f(u.shape, finite(lens.r, Math.min(lens.w,lens.h) / 2),
          finite(lens.pressure, 0), finite(lens.velocity, 0));
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.drawCount++;
      }
      gl.disable(gl.SCISSOR_TEST);
      this.lastSize = { width, height, dpr };
      return true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.available = false;
      this._clearCSS();
      return false;
    }
  }

  /** Call synchronously immediately after render(); pixels use WebGL bottom-up rows. */
  readback() {
    if (!this.available || this.gl.isContextLost()) return null;
    const { width, height } = this.canvas;
    const pixels = new Uint8Array(width * height * 4);
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    return { width, height, pixels };
  }

  clear() {
    if (!this.available || this.gl.isContextLost()) return;
    this.gl.disable(this.gl.SCISSOR_TEST);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this._lost);
    this.canvas.removeEventListener('webglcontextrestored', this._restored);
    if (this.gl && !this.gl.isContextLost()) {
      this.gl.deleteTexture(this.texture);
      this.gl.deleteBuffer(this.buffer);
      this.gl.deleteProgram(this.program);
    }
    this.available = false;
  }
}
