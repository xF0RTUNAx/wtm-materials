// Headless-прогон «Симулятора Летки» в JavaScriptCore: настоящий three.js r128 + заглушки DOM/WebGL.
// Цель — поймать ошибки выполнения (порядок инициализации, опечатки, логика цикла), а не проверить картинку.
var G_ = globalThis;
G_.window = G_;
if (typeof console === 'undefined') G_.console = { log: print, warn: print, error: print };
var SEARCH = G_.SEARCH || '?mode=training&test=1&seed=12345';
function ctx2d() {
  var noop = function () {};
  return { createRadialGradient: function () { return { addColorStop: noop }; }, createLinearGradient: function () { return { addColorStop: noop }; },
    fillRect: noop, clearRect: noop, strokeRect: noop, arc: noop, beginPath: noop, closePath: noop, fill: noop, stroke: noop, moveTo: noop, lineTo: noop,
    save: noop, restore: noop, strokeText: noop, setTransform: noop, scale: noop, rect: noop, translate: noop, rotate: noop, quadraticCurveTo: noop, fillText: noop, setLineDash: noop, drawImage: noop, measureText: function () { return { width: 10 }; } };
}
var ELS = {};
function mkEl(tag) {
  var e = { tagName: tag, style: { setProperty: function (k, v) { this[k] = v; } }, dataset: {}, children: [], _h: '', textContent: '', width: 300, height: 300, offsetWidth: 120, disabled: false,
    classList: { _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; }, toggle: function (c, on) { if (on === undefined ? !this._s[c] : on) this._s[c] = 1; else delete this._s[c]; }, contains: function (c) { return !!this._s[c]; } },
    addEventListener: function (t, f) { (this._ev = this._ev || {})[t] = f; }, removeEventListener: function () {},
    appendChild: function (c) { this.children.push(c); c.parentNode = this; return c; }, insertBefore: function (c) { this.children.push(c); c.parentNode = this; return c; },
    remove: function () { var p = this.parentNode; if (p) { var i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); this.parentNode = null; } },
    getContext: function () { return ctx2d(); }, getBoundingClientRect: function () { return { left: 0, top: 0, right: 120, bottom: 20, width: 120, height: 20 }; },
    closest: function () { return null; }, setPointerCapture: function () {}, requestPointerLock: function () {}, querySelector: function () { return mkEl('q'); },
    querySelectorAll: function () { return []; }, scrollIntoView: function () {}, focus: function () {}, toDataURL: function () { return 'data:image/jpeg;base64,'; } };
  Object.defineProperty(e, 'innerHTML', { get: function () { return this._h; }, set: function (v) { this._h = String(v); } });
  Object.defineProperty(e, 'firstElementChild', { get: function () { return this._fc || (this._fc = mkEl('i')); } });
  Object.defineProperty(e, 'lastChild', { get: function () { return this._lc || (this._lc = mkEl('span')); } });
  Object.defineProperty(e, 'firstChild', { get: function () { return this.children[0] || null; } });
  return e;
}
G_.document = {
  body: mkEl('body'), documentElement: mkEl('html'), fullscreenElement: null, pointerLockElement: null, hidden: false,
  getElementById: function (id) { return ELS[id] || (ELS[id] = mkEl(id)); },
  createElement: function (t) { return mkEl(t); }, querySelectorAll: function () { return []; },
  addEventListener: function () {}, exitPointerLock: function () {}, exitFullscreen: function () { return Promise.resolve(); },
};
G_.innerWidth = 1280; G_.innerHeight = 720; G_.devicePixelRatio = 1; G_.parent = G_;
G_.addEventListener = function () {}; G_.removeEventListener = function () {};
G_.location = { search: SEARCH, reload: function () { print('reload()'); } };
G_.matchMedia = function () { return { matches: false }; };
G_.performance = { _t: 0, now: function () { return this._t; } };
var RAF = []; G_.requestAnimationFrame = function (cb) { RAF.push(cb); return RAF.length; }; // как в браузере: все колбэки кадра
var TIMERS = []; G_.setTimeout = function (f, ms) { TIMERS.push(f); return TIMERS.length; }; G_.clearTimeout = function () {};
G_.setInterval = function (f) { return 0; }; G_.clearInterval = function () {};
var LS = {}; G_.localStorage = { getItem: function (k) { return k in LS ? LS[k] : null; }, setItem: function (k, v) { LS[k] = String(v); }, removeItem: function (k) { delete LS[k]; } };
G_.navigator = {}; G_.screen = {}; G_.history = { pushState: function () {} };
G_.WebGL2RenderingContext = function () {}; G_.WebGL2RenderingContext.prototype = {};
G_.URLSearchParams = function (s) { var m = {}; String(s).replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var p = kv.split('='); m[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); this.get = function (k) { return k in m ? m[k] : null; }; };
G_.self = G_;

load(G_.THREE_PATH);
// рендерер без GL: считаем вызовы, обновляем матрицы (как настоящий)
THREE.WebGLRenderer = function () {
  this.capabilities = { isWebGL2: true, getMaxAnisotropy: function () { return 8; } }; this.shadowMap = { enabled: false, type: 0 }; this.outputEncoding = 0; this.toneMapping = 0; this.toneMappingExposure = 1;
  this._pr = 1; this.renders = 0; this.domElement = mkEl('canvas');
};
THREE.WebGLRenderer.prototype = {
  setPixelRatio: function (p) { this._pr = p; }, getPixelRatio: function () { return this._pr; }, setSize: function () {},
  getDrawingBufferSize: function (v) { return v.set(1280 * this._pr, 720 * this._pr); },
  render: function (scene, cam) { scene.updateMatrixWorld(); if (!cam.parent) cam.updateMatrixWorld(); this.renders++; },
  setRenderTarget: function () {}, getRenderTarget: function () { return null; }, compile: function () {}, getContext: function () { return { getExtension: function () { return null; }, getParameter: function () { return 'stub'; } }; }, dispose: function () {},
};
THREE.PMREMGenerator = function () {}; THREE.PMREMGenerator.prototype = { fromScene: function () { return { texture: new THREE.Texture() }; }, dispose: function () {} };

G_.runFrames = function (n, stepMs) { for (var i = 0; i < n; i++) { performance._t += stepMs; var cbs = RAF; RAF = []; cbs.forEach(function (cb) { cb(performance._t); }); } };
G_.runTimers = function () { var t = TIMERS; TIMERS = []; t.forEach(function (f) { try { f(); } catch (e) { print('timer error: ' + e + '\n' + e.stack); } }); };
