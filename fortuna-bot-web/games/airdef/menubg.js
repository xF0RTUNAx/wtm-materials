// Фон главного меню — готовые кадры (shots/shots.js, снимаются tools/airdef-shots/capture.js из «Съёмки»): смена раз в
// ~6,5 с с плавной склейкой и медленным наездом (CSS — на видеокарте почти бесплатно). 3D-сцена в меню не рисуется и бой
// не считается (idle) — телефон в меню не греется. Звук — эмбиент (sound.js ambient).
// Порядок (Mark 2026-10-27): все кадры вперемешку, без меток режима; показанный не выпадает снова в следующих 10 — недавние
// хранятся в localStorage, так что и после перезапуска игры первым не придёт только что виденный.
import { SHOTS } from './shots/shots.js?v=20261027d';

const RECENT = 10, LS_KEY = 'fortuna_airdef_bgrecent';

export function createMenuBg(C) {
  const el = document.getElementById('menuBg'), layers = el ? [...el.querySelectorAll('.mbi')] : [];
  const base = new URL('./shots/', import.meta.url).href;
  let k = 0, timer = 0, pend = null;
  let recent = (() => { try { return (JSON.parse(localStorage.getItem(LS_KEY) || '[]') || []).filter((f) => SHOTS.some((s) => s.f === f)); } catch (_) { return []; } })();
  function pick() { // кадров меньше 11 — запрет на столько последних, сколько можно (хотя бы один кадр остаётся в розыгрыше)
    const ban = new Set(recent.slice(-Math.min(RECENT, SHOTS.length - 1))), P = SHOTS.filter((s) => !ban.has(s.f));
    const s = P[Math.floor(Math.random() * P.length)];
    recent = [...recent.filter((f) => f !== s.f), s.f].slice(-RECENT);
    try { localStorage.setItem(LS_KEY, JSON.stringify(recent)); } catch (_) { /* приватный режим — только в этой сессии */ }
    return s;
  }
  function next() {
    if (!SHOTS.length || !layers.length) return;
    const s = pick(), img = new Image(); pend = img;
    img.onload = () => { if (pend !== img) return; const L = layers[k]; L.style.backgroundImage = `url("${img.src}")`; L.classList.remove('on'); void L.offsetWidth; L.classList.add('on'); layers[1 - k].classList.remove('on'); k = 1 - k; };
    img.src = base + s.f; // сначала грузим, потом показываем — без белой вспышки
  }
  return {
    has: () => SHOTS.length > 0,
    sim: false, idle: () => true, skip3D: () => true,
    start() { if (el) el.style.display = 'block'; next(); C.snd.ambient(true, C.setup.game); clearInterval(timer); timer = setInterval(() => { if (C.state === 'menu' && !document.hidden) next(); }, 6500); },
    stop() { C.snd.ambient(false); clearInterval(timer); timer = 0; pend = null; if (el) el.style.display = 'none'; for (const L of layers) L.classList.remove('on'); },
    modeChanged() { C.snd.ambient(true, C.setup.game); }, // выбран другой режим — фоновые звуки под него (кадры — общие для всех режимов)
    update() {}, camera() {}, hud() {}, focus: () => C.camera.position,
  };
}
