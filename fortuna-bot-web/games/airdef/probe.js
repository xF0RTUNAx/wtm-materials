// Замер на телефоне (?probe=1; Mark 2026-10-24: «где ещё сэкономить без заметных потерь» — на всех картах и в режимах): через 12 с боя игра
// встаёт, кадр рисуется без предела 60 к/с и без динамического разрешения; по 4 с — всё, без земли, без техники и объектов, без мелких
// экземпляров (деревья, реквизит), без частиц и дыма, без сглаживания и апскейла, снова всё. Время кадра — среднее между кадрами (на телефоне
// упор в видеокарту — это её время); таблица поверх игры — для скриншота. Части пропускаются при отрисовке (как стенд gpu-parts в scratchpad).
/* global THREE */
export function startProbe(C, { renderer, scene, pipe }) {
  const STEP = 4000, WARM = 1200;
  const steps = [['всё', null], ['без земли', 'ground'], ['без домов', 'tiles'], ['без техники и объектов', 'obj'], ['без деревьев и реквизита', 'inst'],
    ['без частиц и дыма', 'fx'], ['без сглаживания', 'post'], ['всё (повтор)', null]];
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:calc(env(safe-area-inset-left,0px) + 12px);top:calc(env(safe-area-inset-top,0px) + 60px);z-index:99;background:rgba(0,0,0,.78);color:#e8f5e9;font:13px/1.45 ui-monospace,Menlo,monospace;padding:10px 12px;border-radius:6px;white-space:pre;pointer-events:none';
  document.body.appendChild(box);
  const G = () => C.G || {};
  const cat = (obj, mat) => {
    const g = G(); if (obj === g.ground || obj === g.roads) return 'ground';
    if (g.tiles && (g.tiles.includes(obj) || g.tiles.includes(obj.parent))) return 'tiles'; // плитки города и деревень — слитые дома
    if (obj === g.sky) return 'sky';
    if (obj.isPoints || (mat && (mat.blending === THREE.AdditiveBlending || (mat.transparent && !obj.isInstancedMesh)))) return 'fx';
    if (obj.isInstancedMesh) return 'inst';
    return 'obj';
  };
  // кадр на время замера рисуется K раз (время делится на K): иначе быстрый кадр упирается в частоту экрана (16,7 мс) и разницы не видно
  // K подбирается в начале (кадр ≥ 26 мс — заведомо медленнее экрана 60–120 Гц)
  let K = 3, cal = 0; const rp = pipe && pipe.render, rr = renderer.render;
  const multi = (on) => {
    if (pipe) pipe.render = on ? function (...a) { for (let k = 0; k < K; k++) rp.apply(this, a); } : rp;
    else renderer.render = on ? function (sc, cam) { const n = sc === scene && cam === C.camera ? K : 1; for (let k = 0; k < n; k++) rr.call(this, sc, cam); } : rr;
  };
  const orig = renderer.renderBufferDirect; let skip = null;
  renderer.renderBufferDirect = function (cam, sc, geo, mat, obj) {
    if (skip && skip !== 'post' && !(cam && cam.isOrthographicCamera && mat && mat.isShaderMaterial) && cat(obj, mat) === skip) return;
    return orig.apply(this, arguments);
  };
  let i = -1, t0 = 0, last = 0; const res = [], iv = [];
  const pc = pipe && pipe.cfg, aa0 = pc && pc.aa, up0 = pc && pc.upscaler;
  // что умеет браузер (2026-10-25: решение о переходе на WebGPU — по телефонам и окну Telegram тестеров)
  const api = `WebGPU ${typeof navigator !== 'undefined' && navigator.gpu ? 'есть' : 'нет'} · WebGL ${renderer.capabilities.isWebGL2 ? 2 : 1}`;
  const show = (head) => {
    const b = res.length ? res[0][1] : 0;
    box.textContent = `Замер ${C.probeMap || ''} · кадр ×${K} · ${head}\n${api}\n` + res.map(([n, ms]) => `${n.padEnd(26)} ${ms.toFixed(1).padStart(5)} мс${ms && b ? '  ' + (ms - b >= 0 ? '+' : '') + (ms - b).toFixed(1) : ''}`).join('\n');
  };
  const begin = () => { C.probeOn = true; C.paused = true; if (pipe && pipe.scale !== (C.perfScale || 1)) pipe.setScale(C.perfScale || 1); multi(true); cal = 1; t0 = performance.now(); last = 0; iv.length = 0; show('подбор… не трогайте телефон'); };
  const next = (now) => {
    if (i >= 0) { const a = iv.filter((x) => x < 750); res.push([steps[i][0], a.length ? a.reduce((s, x) => s + x, 0) / a.length / K : 0]); }
    i++; iv.length = 0; t0 = now; last = 0;
    if (i >= steps.length) { renderer.renderBufferDirect = orig; multi(false); if (pc) { pc.aa = aa0; pc.upscaler = up0; } C.probeOn = false; C.paused = false; show('готово — скриншот'); return; }
    skip = steps[i][1]; if (pc) { pc.aa = skip === 'post' ? 'off' : aa0; pc.upscaler = skip === 'post' ? 'off' : up0; }
    show(`${steps[i][0]}… не трогайте телефон`);
  };
  const tick = (now) => {
    if (i >= steps.length) return;
    requestAnimationFrame(tick);
    if (!C.probeOn) { if (C.state === 'play' && (C.probeT = (C.probeT || 0) + 1) > 12 * 60) begin(); else if (C.state === 'play') box.textContent = 'Замер начнётся через ' + Math.ceil(12 - C.probeT / 60) + ' с'; return; }
    if (now - t0 > WARM && last) iv.push(now - last); last = now;
    if (cal && now - t0 > WARM + 1000) { // подбор K: кадр быстрее 26 мс — повторов больше (до 24)
      const a = iv.filter((x) => x < 750), avg = a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
      if (avg < 26 && K < 24 && cal < 4) { K = Math.min(24, Math.ceil(K * 32 / Math.max(avg, 4))); cal++; t0 = now; last = 0; iv.length = 0; return; }
      cal = 0; next(now); return;
    }
    if (!cal && now - t0 > STEP) next(now);
  };
  requestAnimationFrame(tick);
}
