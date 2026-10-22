// Фон главного меню — готовые кадры (shots/shots.js, снимаются tools/airdef-shots/capture.js из «Съёмки»): смена раз в
// ~6,5 с с плавной склейкой и медленным наездом (CSS — на видеокарте почти бесплатно). 3D-сцена в меню не рисуется и бой
// не считается (idle) — телефон в меню не греется. Звук — эмбиент (sound.js ambient). Кадры подбираются под выбранный режим (метки t), иначе — все.
import { SHOTS } from './shots/shots.js?v=20261022x';

const TAG = { air: 'air', defense: 'pvo', multi: 'multi', photo: null, training: null, online: null };

export function createMenuBg(C) {
  const el = document.getElementById('menuBg'), layers = el ? [...el.querySelectorAll('.mbi')] : [];
  const base = new URL('./shots/', import.meta.url).href;
  let k = 0, timer = 0, last = -1, pend = null;
  function pool() { const t = TAG[C.setup.game], own = t ? SHOTS.filter((s) => s.t.includes(t)) : []; return own.length >= 2 ? own : SHOTS; }
  function next() {
    const P = pool(); if (!P.length || !layers.length) return;
    let i = Math.floor(Math.random() * P.length); if (P.length > 1 && P[i].f === last) i = (i + 1) % P.length; // не тот же кадр подряд
    const s = P[i], img = new Image(); pend = img; last = s.f;
    img.onload = () => { if (pend !== img) return; const L = layers[k]; L.style.backgroundImage = `url("${img.src}")`; L.classList.remove('on'); void L.offsetWidth; L.classList.add('on'); layers[1 - k].classList.remove('on'); k = 1 - k; };
    img.src = base + s.f; // сначала грузим, потом показываем — без белой вспышки
  }
  return {
    has: () => SHOTS.length > 0,
    sim: false, idle: () => true, skip3D: () => true,
    start() { if (el) el.style.display = 'block'; next(); C.snd.ambient(true, C.setup.game); clearInterval(timer); timer = setInterval(() => { if (C.state === 'menu' && !document.hidden) next(); }, 6500); },
    stop() { C.snd.ambient(false); clearInterval(timer); timer = 0; pend = null; if (el) el.style.display = 'none'; for (const L of layers) L.classList.remove('on'); },
    modeChanged() { next(); C.snd.ambient(true, C.setup.game); }, // выбран другой режим — кадр и фоновые звуки под него
    update() {}, camera() {}, hud() {}, focus: () => C.camera.position,
  };
}
