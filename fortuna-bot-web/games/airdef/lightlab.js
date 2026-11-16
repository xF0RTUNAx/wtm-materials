// Стенд света «Воздушного превосходства» (Mark 2026-11-16): ?lab=1 - панель с ползунками света сцены и цвета кадра, ракурсы камеры, погода и карта.
// Значения живут в localStorage (по ключу карта/погода), автосохранение через 2 с после последнего движения и кнопка «Сохранить» шлют их на
// tools/airdef-light/lab-server.js (127.0.0.1:8939), чтобы главный чат прочитал, что выставлено. Грузится только с ?lab=1 (main.js).
// Всё применяется прямо к объектам сцены, без перезагрузки: свет - C.G.sun / C.G.hemi, дымка - scene.fog, кадр - pipe.grade (uniforms постобработки).
/* global THREE */

const SAVE_URL = 'http://127.0.0.1:8939';
const WX = { // погоды карт: ключ, подпись
  city: [['day', 'Ясный день'], ['morning', 'Утро'], ['evening', 'Вечер'], ['sunset', 'Закат'], ['overcast', 'Пасмурно']],
  winter: [['w_clear', 'Мороз, ясно'], ['w_frost', 'Морозная дымка'], ['w_snow', 'Снегопад']],
  autumn: [['a_eve', 'Осенний вечер'], ['a_dusk', 'Сумерки'], ['a_fog', 'Туман']],
};
const MAPN = { city: 'Город (Речной узел)', winter: 'Зима (Северный рубеж)', autumn: 'Осень (Туманная топь)' };

// ═════════════ Ракурсы ═════════════
// pos / look: [x, y, z]; abs - высота y абсолютная, иначе - метры над землёй в этой точке; fov - угол обзора (по умолчанию 62)
// sun: ракурс строится по направлению солнца (C.G.sunDir): pos - точка (x, высота над землёй, z), tilt - предел угла взгляда вверх, back - спиной к солнцу
const RIVER = (z) => 1300 * Math.sin(z * 0.00019 + 0.6) + 450 * Math.sin(z * 0.00052 + 2.1) - 300; // русло города (city.js riverX)
const VIEWS = {
  city: [
    { id: 'street', name: 'Улица', abs: true, pos: [-5786, 8.9, -2160], look: [-5796, 6.6, -2130] },
    { id: 'cross', name: 'Перекрёсток', abs: true, pos: [-5976, 13.1, -2310], look: [-5992, 10.8, -2280] },
    { id: 'park', name: 'Парк', abs: true, pos: [-5963, 4, -2761], look: [-5955, 3, -2745] },
    { id: 'h70', name: '70 м над кварталами', abs: true, pos: [-5900, 70, -2420], look: [-5800, 8, -2250] },
    { id: 'h320', name: '320 м, общий план', abs: true, pos: [-6500, 320, -3500], look: [-5500, 10, -1800] },
    { id: 'sunup', name: 'На солнце (позиция ПВО)', sun: { x: -5786, h: 3, z: -2160, tilt: 34 } },
    { id: 'sunback', name: 'Спиной к солнцу (фасады)', sun: { x: -5900, h: 25, z: -2420, tilt: 4, back: true } },
    { id: 'river', name: 'Вдоль реки', river: { z: -2400, h: 10, len: 1300, side: 150 } },
  ],
  winter: [
    { id: 'air_low', name: 'Аэродром, у земли', pos: [1960, 2.6, -720], look: [2032, 5, -600] },
    { id: 'air70', name: 'Аэродром, 70 м', pos: [1900, 70, -800], look: [2032, 4, -600] },
    { id: 'gar70', name: 'Гарнизон, 70 м', pos: [-1230, 60, 7400], look: [-1106, 4, 7540] },
    { id: 'dam300', name: 'Плотина, 300 м', pos: [-1700, 320, -9800], look: [-1125, 10, -9200] },
    { id: 'sunup', name: 'На солнце (аэродром)', sun: { x: 1960, h: 3, z: -720, tilt: 34 } },
  ],
  autumn: [
    { id: 'cp_low', name: 'КП, у земли', pos: [520, 2.6, 80], look: [600, 5, 200] },
    { id: 'fuel70', name: 'Склад, 70 м', pos: [4240, 65, 960], look: [4355, 4, 1080] },
    { id: 'gar300', name: 'Гарнизон, 300 м', pos: [-1600, 300, 4700], look: [-1040, 10, 5300] },
    { id: 'sunup', name: 'На солнце (КП)', sun: { x: 520, h: 3, z: 80, tilt: 34 } },
  ],
};
// самолёт игрока в кадре: камера привязана к нему (смещение: вперёд, вправо, вверх - в метрах по осям самолёта; sunK - вдоль солнца)
const PLANE_VIEWS = [
  { id: 'p_side', name: 'Самолёт сбоку', off: [0, 40, 4] },
  { id: 'p_front', name: 'Самолёт спереди-сбоку', off: [34, 22, 6] },
  { id: 'p_below', name: 'Самолёт снизу', off: [0, 12, -34] },
  { id: 'p_back', name: 'Самолёт: контровой свет', sunK: -48, up: 3 },
  { id: 'p_lit', name: 'Самолёт: по свету', sunK: 48, up: 3 },
];

// ═════════════ Цвет ═════════════
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const cl = (v, a, b) => Math.min(b, Math.max(a, v));
const hex2lin = (h) => [s2l(((h >> 16) & 255) / 255), s2l(((h >> 8) & 255) / 255), s2l((h & 255) / 255)];
const lin2hex = (c) => ((Math.round(cl(l2s(c[0]), 0, 1) * 255) << 16) | (Math.round(cl(l2s(c[1]), 0, 1) * 255) << 8) | Math.round(cl(l2s(c[2]), 0, 1) * 255));
const hexStr = (h) => '#' + h.toString(16).padStart(6, '0');
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// цвет чёрного тела по температуре (приближение Таннера Хелланда), в линейных долях
function bb(K) {
  const t = cl(K, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [s2l(cl(r, 0, 255) / 255), s2l(cl(g, 0, 255) / 255), s2l(cl(b, 0, 255) / 255)];
}
// температура, при которой чёрное тело имеет то же отношение синего к красному, что и цвет c (линейный): точка «без сдвига» для ползунка
function estK(c) {
  const q = Math.log(Math.max(c[2], 1e-4) / Math.max(c[0], 1e-4)); let best = 6500, bd = 1e9;
  for (let K = 2000; K <= 12000; K += 50) { const m = bb(K), d = Math.abs(Math.log(Math.max(m[2], 1e-4) / Math.max(m[0], 1e-4)) - q); if (d < bd) { bd = d; best = K; } }
  return cl(best, 2200, 11000);
}
// множитель цвета: температура K относительно K0 и оттенок tint (-1 зелёный … +1 пурпурный), яркость не меняется
function shift(K0, K, tint) {
  const a = bb(K0), b = bb(K), m = [b[0] / Math.max(a[0], 1e-4), b[1] / Math.max(a[1], 1e-4), b[2] / Math.max(a[2], 1e-4)];
  m[0] *= 1 + 0.12 * tint; m[1] *= 1 - 0.2 * tint; m[2] *= 1 + 0.12 * tint;
  const L = luma(m) || 1; return [m[0] / L, m[1] / L, m[2] / L];
}
// значение цветового ползунка {hex, k0, k, tint}: итоговый линейный цвет
const colOut = (o) => { const m = shift(o.k0, o.k, o.tint), l = hex2lin(o.hex); return hex2lin(lin2hex([l[0] * m[0], l[1] * m[1], l[2] * m[2]])); };
const mkCol = (hex) => ({ hex, k0: estK(hex2lin(hex)), k: estK(hex2lin(hex)), tint: 0 });
const linHex = (c) => lin2hex(c);

export function startLab(C, ctx) {
  const { renderer, scene, pipe, W_KEY, MAP, Q } = ctx;
  const KEY = `fortuna_airdef_lab/${MAP}/${W_KEY}`;
  const wxList = WX[MAP] || WX.city, views = VIEWS[MAP] || VIEWS.city;
  let god = (() => { try { return localStorage.getItem('fortuna_airdef_lab_god') !== '0'; } catch (_) { return true; } })();
  let leaving = false;
  // страницу перезагружает сам стенд: вопрос «Покинуть сайт?» из shell.js (в бою) не нужен - отмена вопроса гасится
  function noPrompt() {
    const pd = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function () { if (this.type === 'beforeunload') return undefined; return pd.apply(this, arguments); };
    try { Object.defineProperty(BeforeUnloadEvent.prototype, 'returnValue', { get() { return ''; }, set() { /* без вопроса */ }, configurable: true }); } catch (_) { /* нет */ }
  }
  let BASE = null, S = null, ready = false, dirty = false, saveT = 0, curView = 'game', savedAt = 0, diskOk = null, plane = null;
  const ui = {}; // элементы, которые обновляются из значений: ключ -> функция показа

  // ───────── Панель ─────────
  const css = document.createElement('style');
  css.textContent = `
#lab{position:fixed;top:8px;right:8px;width:340px;max-height:calc(100vh - 16px);overflow:auto;z-index:99999;background:rgba(14,16,20,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
 color:#e8ecf2;font:12px/1.35 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 10px 10px;user-select:none;-webkit-user-select:none;box-sizing:border-box}
#lab.min{width:auto;overflow:visible;padding:5px 9px}
#lab.min .body{display:none}
#lab .hd{display:flex;align-items:center;gap:8px;font-weight:600;font-size:13px}
#lab .hd span{flex:1}
#lab button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:3px 8px;font:inherit;cursor:pointer}
#lab button:hover{background:rgba(255,255,255,.22)}
#lab button.on{background:#3b82f6;border-color:#60a5fa}
#lab h4{margin:9px 0 3px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9fb0c8;border-top:1px solid rgba(255,255,255,.12);padding-top:6px}
#lab .row{display:flex;align-items:center;gap:6px;margin:2px 0}
#lab .row label{width:104px;flex:none;color:#cfd8e4}
#lab .row input[type=range]{flex:1;min-width:0;height:16px}
#lab .row output{width:50px;text-align:right;flex:none;font-variant-numeric:tabular-nums;color:#fff}
#lab .row.off{opacity:.38;pointer-events:none}
#lab .col{margin:3px 0 5px;padding:3px 0 1px 0}
#lab .col .ct{display:flex;align-items:center;gap:6px}
#lab .col .ct b{font-weight:500;color:#cfd8e4;flex:1}
#lab .col input[type=color]{width:38px;height:20px;padding:0;border:1px solid rgba(255,255,255,.3);border-radius:4px;background:none;cursor:pointer}
#lab .col code{font:11px ui-monospace,Menlo,monospace;color:#fff}
#lab .col .row label{width:64px;color:#9fb0c8}
#lab .btns{display:flex;flex-wrap:wrap;gap:4px;margin:3px 0}
#lab .btns button{flex:none}
#lab .st{margin-top:6px;color:#9fb0c8;font-size:11px}
#lab .st.bad{color:#ffb4a8}
#lab .note{color:#9fb0c8;font-size:11px;margin:2px 0}
body.labclean > *:not(#c):not(#lab):not(style):not(script){visibility:hidden !important}
#lab select{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:6px;padding:2px 4px;font:inherit}
#lab select option{color:#000}
`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'lab';
  document.body.appendChild(root);
  // клавиши и мышь на панели - не игре (иначе стрелки и пробел в ползунке рулят самолётом)
  for (const ev of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel', 'contextmenu', 'click', 'dblclick']) root.addEventListener(ev, (e) => e.stopPropagation());
  const el = (tag, props, ...kids) => { const e = document.createElement(tag); if (props) Object.assign(e, props); for (const k of kids) if (k != null) e.append(k); return e; };
  const body = el('div', { className: 'body' });
  const minBtn = el('button', { textContent: '−', title: 'Свернуть' });
  root.append(el('div', { className: 'hd' }, el('span', { textContent: '☀ Стенд света' }), minBtn), body);
  minBtn.onclick = () => { root.classList.toggle('min'); minBtn.textContent = root.classList.contains('min') ? '+' : '−'; };

  const section = (t) => body.append(el('h4', { textContent: t }));
  // обычный ползунок: ключ значения в S, подпись, диапазон
  function slider(key, label, min, max, step, parent, digits = 2) {
    const out = el('output'), inp = el('input', { type: 'range', min, max, step });
    const row = el('div', { className: 'row' }, el('label', { textContent: label }), inp, out);
    inp.oninput = () => { S[key] = +inp.value; out.textContent = (+inp.value).toFixed(digits); touch(); };
    ui[key] = () => { inp.value = S[key]; out.textContent = (+S[key]).toFixed(digits); };
    (parent || body).append(row); return row;
  }
  // цвет: окошко цвета (точное значение) + температура К (как в студии) + оттенок; итоговый цвет показан кодом
  function colorCtl(key, label, kmin = 2000, kmax = 12000) {
    const sw = el('input', { type: 'color' }), code = el('code'), box = el('div', { className: 'col' });
    const ct = el('div', { className: 'ct' }, el('b', { textContent: label }), sw, code);
    const kS = el('input', { type: 'range', min: kmin, max: kmax, step: 50 }), kO = el('output'), tS = el('input', { type: 'range', min: -1, max: 1, step: 0.01 }), tO = el('output');
    box.append(ct, el('div', { className: 'row' }, el('label', { textContent: 'темп., К', title: 'Цветовая температура: ниже - теплее (оранжевее), выше - холоднее (голубее); середина - как в игре' }), kS, kO), el('div', { className: 'row' }, el('label', { textContent: 'оттенок', title: 'Влево - зеленее, вправо - пурпурнее' }), tS, tO));
    const show = () => { const o = S[key]; sw.value = hexStr(o.hex); kS.value = o.k; kO.textContent = Math.round(o.k); tS.value = o.tint; tO.textContent = o.tint.toFixed(2); code.textContent = '→ ' + hexStr(linHex(colOut(o))); };
    sw.oninput = () => { S[key] = mkCol(parseInt(sw.value.slice(1), 16)); show(); touch(); }; // новая основа цвета: ползунки в нейтраль
    kS.oninput = () => { S[key].k = +kS.value; show(); touch(); };
    tS.oninput = () => { S[key].tint = +tS.value; show(); touch(); };
    ui[key] = show; body.append(box);
  }
  // сдвиг вектора (gGain): температура и оттенок от исходного значения
  function vecCtl(key, label) {
    const box = el('div', { className: 'col' }), code = el('code');
    const kS = el('input', { type: 'range', min: 2000, max: 12000, step: 50 }), kO = el('output'), tS = el('input', { type: 'range', min: -1, max: 1, step: 0.01 }), tO = el('output');
    box.append(el('div', { className: 'ct' }, el('b', { textContent: label }), code), el('div', { className: 'row' }, el('label', { textContent: 'темп., К', title: 'Цветовая температура: ниже - теплее (оранжевее), выше - холоднее (голубее); середина - как в игре' }), kS, kO), el('div', { className: 'row' }, el('label', { textContent: 'оттенок', title: 'Влево - зеленее, вправо - пурпурнее' }), tS, tO));
    const show = () => { const o = S[key]; kS.value = o.k; kO.textContent = Math.round(o.k); tS.value = o.tint; tO.textContent = o.tint.toFixed(2); code.textContent = vecOut(o).map((v) => v.toFixed(3)).join(' '); };
    kS.oninput = () => { S[key].k = +kS.value; show(); touch(); };
    tS.oninput = () => { S[key].tint = +tS.value; show(); touch(); };
    ui[key] = show; ui[key + '_box'] = box; body.append(box);
  }
  const vecOut = (o) => { const m = shift(o.k0, o.k, o.tint); return [o.v[0] * m[0], o.v[1] * m[1], o.v[2] * m[2]]; };

  // ───────── Строки панели ─────────
  // погода и карта
  section('Карта и погода');
  const selMap = el('select'), selWx = el('select');
  for (const m of Object.keys(WX)) selMap.append(el('option', { value: m, textContent: MAPN[m], selected: m === MAP }));
  const fillWx = (m, cur) => { selWx.textContent = ''; for (const [k, n] of WX[m]) selWx.append(el('option', { value: k, textContent: n, selected: k === cur })); };
  fillWx(MAP, W_KEY);
  // адрес - из исходных параметров (Q): игра после старта вычищает go и weather из адресной строки; map и weather - новые, lab=1 остаётся
  const nav = (set) => { leaving = true; noPrompt(); const u = new URL(location.href); u.search = ''; for (const [k, v] of Q) u.searchParams.set(k, v); u.searchParams.set('lab', '1'); for (const k of Object.keys(set)) u.searchParams.set(k, set[k]); location.href = u.toString(); };
  const reload = (map, wx) => nav({ map, weather: wx });
  selMap.onchange = () => { if (dirty) saveNow(); reload(selMap.value, WX[selMap.value][0][0]); };
  selWx.onchange = () => { if (dirty) saveNow(); reload(selMap.value, selWx.value); };
  body.append(el('div', { className: 'row' }, el('label', { textContent: 'Карта' }), selMap), el('div', { className: 'row' }, el('label', { textContent: 'Погода' }), selWx));
  const goRow = el('div', { className: 'btns' });
  const goBtn = el('button', { textContent: 'Начать вылет', title: 'Перезагрузить страницу сразу в бой (go=air)' });
  goBtn.onclick = () => nav({ go: 'air', map: MAP, weather: W_KEY });
  const stateNote = el('div', { className: 'note' }), msgNote = el('div', { className: 'note' });
  if (!Q.get('go')) goRow.append(goBtn);
  body.append(goRow, stateNote, msgNote);

  // ракурсы
  section('Ракурсы');
  const viewBtns = new Map(), vBox = el('div', { className: 'btns' });
  const addView = (id, name, fn) => { const b = el('button', { textContent: name }); b.onclick = () => fn(); vBox.append(b); viewBtns.set(id, b); };
  addView('game', 'Игра', () => setView('game'));
  for (const v of views) addView(v.id, v.name, () => setView(v.id));
  body.append(vBox);
  const pBox = el('div', { className: 'btns' });
  body.append(el('div', { className: 'note', textContent: 'Ситуации: самолёт игрока в кадре' }), pBox);
  for (const v of PLANE_VIEWS) { const b = el('button', { textContent: v.name }); b.onclick = () => setView(v.id); pBox.append(b); viewBtns.set(v.id, b); }
  const sBox = el('div', { className: 'btns' });
  const pauseBtn = el('button', { textContent: 'Пауза' });
  pauseBtn.onclick = () => { C.paused = !C.paused; pauseBtn.classList.toggle('on', C.paused); wake(); };
  const lowBtn = el('button', { textContent: 'Самолёт над кварталами', title: 'Поставить самолёт игрока низко над городом и включить ракурс «сбоку»' });
  lowBtn.onclick = () => placePlane();
  const godBtn = el('button', { textContent: 'Самолёт неуязвим', title: 'Здоровье и топливо не убывают, высота и район держатся сами: бой идёт, самолёт не сбивают' });
  godBtn.onclick = () => { god = !god; godBtn.classList.toggle('on', god); if (!god && C.ctrl && C.ctrl.game && C.ctrl.game.opts) C.ctrl.game.opts.invuln = false; try { localStorage.setItem('fortuna_airdef_lab_god', god ? '1' : '0'); } catch (_) { /* нет */ } if (god) keepAlive(); };
  const hudBtn = el('button', { textContent: 'Скрыть интерфейс игры', title: 'Только картинка и эта панель' });
  hudBtn.onclick = () => { document.body.classList.toggle('labclean'); hudBtn.classList.toggle('on', document.body.classList.contains('labclean')); wake(); };
  sBox.append(pauseBtn, godBtn, hudBtn);
  if (MAP === 'city') sBox.append(lowBtn);
  body.append(sBox);

  // свет сцены
  section('Солнце');
  slider('sunI', 'Сила', 0, 6, 0.01);
  colorCtl('sunC', 'Цвет солнца');
  section('Небесный свет');
  slider('hemiI', 'Сила', 0, 3, 0.01);
  colorCtl('hemiSky', 'Небо');
  colorCtl('hemiGnd', 'Отражённый от земли');
  section('Дымка');
  colorCtl('fogC', 'Цвет дымки');
  slider('fogMul', 'Плотность ×', 0, 4, 0.01);
  section('Экспозиция');
  slider('exposure', 'Экспозиция', 0.3, 2.5, 0.01);

  // цвет кадра
  section('Цвет кадра');
  const frameNote = el('div', { className: 'note' }); body.append(frameNote);
  const frameRows = [];
  frameRows.push(slider('bloom', 'Свечение', 0, 1.5, 0.01));
  frameRows.push(slider('grade', 'Холод/тепло', 0, 1, 0.01));
  frameRows.push(slider('vignette', 'Виньетка', 0, 0.8, 0.01));
  frameRows.push(slider('gSat', 'Насыщенность', 0.3, 1.8, 0.01));
  frameRows.push(slider('gCon', 'Контраст', 0.7, 1.4, 0.005, null, 3));
  vecCtl('gGain', 'Света (тёплые/холодные)');
  frameRows.push(ui.gGain_box);
  const liftHd = el('div', { className: 'note', textContent: 'Тени: оттенок (прибавка к тёмному)' }); body.append(liftHd);
  frameRows.push(liftHd);
  for (const [k, n] of [['gLr', 'красный'], ['gLg', 'зелёный'], ['gLb', 'синий']]) frameRows.push(slider(k, n, -0.02, 0.06, 0.001, null, 3));

  // кнопки
  section('Значения');
  const actions = el('div', { className: 'btns' });
  const bReset = el('button', { textContent: 'Как в игре' }), bCopy = el('button', { textContent: 'Скопировать' }), bSave = el('button', { textContent: 'Сохранить' });
  actions.append(bReset, bCopy, bSave); body.append(actions);
  const status = el('div', { className: 'st' }); body.append(status);

  // ───────── Значения и применение ─────────
  const cfgOk = !!(pipe && pipe.cfg && !pipe.cfg.ldr), bloomOk = cfgOk && (pipe.cfg.bloom || 0) > 0;
  function readBase() {
    const G = C.G, g = pipe && pipe.grade, gg = cfgOk ? g : null;
    const v3 = (u, d) => (u ? [u.value.x, u.value.y, u.value.z] : d);
    const gain = v3(gg && gg.gGain, [1, 1, 1]), lift = v3(gg && gg.gLift, [0, 0, 0]);
    const tolin = (c) => hexStr(linHex([c.r, c.g, c.b]));
    return {
      sunI: G.sun.intensity, sunC: mkCol(parseInt(tolin(G.sun.color).slice(1), 16)),
      hemiI: G.hemi.intensity, hemiSky: mkCol(parseInt(tolin(G.hemi.color).slice(1), 16)), hemiGnd: mkCol(parseInt(tolin(G.hemi.groundColor).slice(1), 16)),
      fogC: mkCol(parseInt(tolin(scene.fog.color).slice(1), 16)), fogMul: 1, fogD: scene.fog.density,
      exposure: cfgOk && g ? g.exposure.value : renderer.toneMappingExposure,
      bloom: gg ? gg.bloom.value : 0, grade: gg ? gg.grade.value : 0, vignette: gg ? gg.vignette.value : 0, gSat: gg ? gg.gSat.value : 1, gCon: gg ? gg.gCon.value : 1,
      gGain: { v: gain, k0: estK(gain), k: estK(gain), tint: 0 }, gLr: lift[0], gLg: lift[1], gLb: lift[2],
    };
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // зависимые шейдерные цвета (дальняя дымка и солнце в земле, деревьях, облаках): запоминаем исходные и пересчитываем по ползункам
  let deps = { tree: [], sunCol: [], atmo: [], gnd: [], at: 0 };
  const known = new WeakMap();
  function scanDeps() {
    deps.at = performance.now(); const tree = new Set(), sunCol = new Set(), atmo = new Set(), gnd = new Set();
    scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        const u = m && m.uniforms; if (!u) continue;
        if (u.uHS && u.uHG && u.uSL) tree.add(u);
        if (u.uSunCol && u.uSunCol.value && u.uSunCol.value.isColor) sunCol.add(u.uSunCol);
        if (u.atmoSunCol && u.atmoSunCol.value) atmo.add(u.atmoSunCol);
        if (u.uGnd && u.uGnd.value && u.uGnd.value.isColor) gnd.add(u.uGnd);
      }
    });
    const keep = (set, tag) => { const out = []; for (const u of set) { if (!known.has(u.value)) known.set(u.value, u.value.clone()); out.push([u, known.get(u.value)]); } deps[tag] = out; };
    deps.tree = [...tree]; keep(sunCol, 'sunCol'); keep(gnd, 'gnd'); deps.atmo = [...atmo].map((u) => [u]);
  }
  const L = (c) => { const x = colOut(c); return x; };
  function apply() {
    if (!ready) return;
    const G = C.G, sc = L(S.sunC), sk = L(S.hemiSky), gk = L(S.hemiGnd), fc = L(S.fogC);
    G.sun.intensity = S.sunI; G.sun.color.setRGB(sc[0], sc[1], sc[2]);
    G.hemi.intensity = S.hemiI; G.hemi.color.setRGB(sk[0], sk[1], sk[2]); G.hemi.groundColor.setRGB(gk[0], gk[1], gk[2]);
    scene.fog.color.setRGB(fc[0], fc[1], fc[2]); scene.fog.density = BASE.fogD * S.fogMul;
    renderer.toneMappingExposure = S.exposure;
    if (cfgOk) {
      const u = pipe.grade; u.exposure.value = S.exposure; u.bloom.value = bloomOk ? S.bloom : u.bloom.value; u.grade.value = S.grade; u.vignette.value = S.vignette;
      u.gSat.value = S.gSat; u.gCon.value = S.gCon; const gv = vecOut(S.gGain); u.gGain.value.set(gv[0], gv[1], gv[2]); u.gLift.value.set(S.gLr, S.gLg, S.gLb);
    }
    // зависимое: цвет солнца и дымки в шейдерах земли, деревьев, воздушной перспективы
    if (performance.now() - deps.at > 3000) scanDeps();
    const b = BASE, bs = L(b.sunC), bf = L(b.fogC), r = (n, o) => (o > 1e-5 ? n / o : 1);
    for (const [u, base] of deps.sunCol) u.value.setRGB(base.r * r(sc[0], bs[0]), base.g * r(sc[1], bs[1]), base.b * r(sc[2], bs[2]));
    for (const [u] of deps.atmo) { const v = u.value; v.x = fc[0] * 0.4 + sc[0] * 0.9; v.y = fc[1] * 0.4 + sc[1] * 0.9; v.z = fc[2] * 0.4 + sc[2] * 0.9; }
    for (const [u, base] of deps.gnd) u.value.setRGB(base.r * r(fc[0], bf[0]), base.g * r(fc[1], bf[1]), base.b * r(fc[2], bf[2]));
    for (const u of deps.tree) {
      u.uHS.value.setRGB(sk[0], sk[1], sk[2]).multiplyScalar(S.hemiI); u.uHG.value.setRGB(gk[0], gk[1], gk[2]).multiplyScalar(S.hemiI); u.uSL.value.setRGB(sc[0], sc[1], sc[2]).multiplyScalar(S.sunI);
    }
    wake();
  }
  // на паузе кадр держится, пока что-то не шевельнулось: событие input будит его (main.js stillWake)
  function wake() { try { window.dispatchEvent(new Event('input')); } catch (_) { /* нет */ } }
  function showAll() { for (const k of Object.keys(ui)) if (typeof ui[k] === 'function' && k.indexOf('_box') < 0) ui[k](); }

  // ───────── Сохранение ─────────
  // значения для чтения главным чатом: итоговые числа (то, что видит игра), и то, из чего они получены
  function colJ(o) { return { hex: hexStr(o.hex), kelvin: Math.round(o.k), tint: +o.tint.toFixed(2), out: hexStr(linHex(colOut(o))) }; }
  function toJson(s) {
    const gv = vecOut(s.gGain), r = (x, n = 4) => +x.toFixed(n);
    return {
      sun: { intensity: r(s.sunI), color: colJ(s.sunC) },
      hemi: { intensity: r(s.hemiI), sky: colJ(s.hemiSky), ground: colJ(s.hemiGnd) },
      fog: { color: colJ(s.fogC), densityMul: r(s.fogMul), density: +(BASE.fogD * s.fogMul).toPrecision(5) },
      exposure: r(s.exposure),
      frame: { bloom: r(s.bloom), grade: r(s.grade), vignette: r(s.vignette), gSat: r(s.gSat), gCon: r(s.gCon, 3), gGain: gv.map((x) => r(x, 3)), gGainKelvin: Math.round(s.gGain.k), gGainTint: +s.gGain.tint.toFixed(2), gLift: [s.gLr, s.gLg, s.gLb].map((x) => r(x, 4)) },
    };
  }
  const payload = () => ({ map: MAP, weather: W_KEY, view: curView, values: toJson(S), base: toJson(BASE), ts: new Date().toISOString() });
  function local() { try { localStorage.setItem(KEY, JSON.stringify({ S, view: curView })); } catch (_) { /* приватный режим */ } }
  function setStatus() {
    if (!ready) { status.textContent = 'ждём сцену…'; return; }
    const t = savedAt ? new Date(savedAt).toLocaleTimeString() : '';
    if (diskOk === false) { status.textContent = 'не сохранено на диск (сервер 8939 недоступен), значения только в браузере'; status.className = 'st bad'; }
    else if (dirty) { status.textContent = 'изменено, сохраню на диск через 2 с…'; status.className = 'st'; }
    else if (diskOk) { status.textContent = `сохранено на диск ${t}`; status.className = 'st'; }
    else { status.textContent = 'без изменений'; status.className = 'st'; }
  }
  async function saveNow() {
    clearTimeout(saveT); saveT = 0; if (!ready) return; local();
    try {
      const r = await fetch(SAVE_URL + '/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      diskOk = r.ok; if (r.ok) { savedAt = Date.now(); dirty = false; }
    } catch (_) { diskOk = false; }
    setStatus();
  }
  function touch() { dirty = true; apply(); local(); clearTimeout(saveT); saveT = setTimeout(saveNow, 2000); setStatus(); }
  bSave.onclick = () => saveNow();
  bReset.onclick = () => { S = clone(BASE); showAll(); apply(); dirty = true; local(); clearTimeout(saveT); saveT = setTimeout(saveNow, 2000); setStatus(); };
  bCopy.onclick = async () => {
    const txt = JSON.stringify(payload(), null, 2);
    try { await navigator.clipboard.writeText(txt); } catch (_) { const ta = el('textarea', { value: txt }); document.body.append(ta); ta.select(); try { document.execCommand('copy'); } catch (_e) { /* нет */ } ta.remove(); }
    status.textContent = 'JSON скопирован в буфер'; status.className = 'st'; setTimeout(setStatus, 1800);
  };
  addEventListener('beforeunload', () => { if (dirty && ready) { local(); try { navigator.sendBeacon(SAVE_URL + '/save', new Blob([JSON.stringify(payload())], { type: 'text/plain' })); } catch (_) { /* нет */ } } });

  // ───────── Ракурсы: камера поверх ctrl.camera ─────────
  const hooked = []; // {ctrl, orig}: вид «Игра» возвращает всё, как было
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), FW = new THREE.Vector3(), RT = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const gh = (x, z) => C.city.groundH(x, z);
  function viewDef(id) { return views.find((v) => v.id === id) || PLANE_VIEWS.find((v) => v.id === id) || null; }
  function craftOf() { const c = C.ctrl; return c && (c.craft || (c.inner && c.inner.craft)) || null; }
  function placeCam(def) {
    const cam = C.camera; let fov = def.fov || 62;
    if (def.off || def.sunK !== undefined) {
      const cr = craftOf(); if (!cr) return;
      const sd = C.G.sunDir;
      if (def.sunK !== undefined) { V.copy(cr.pos).addScaledVector(sd, def.sunK); V.y += def.up || 0; }
      else {
        // оси самолёта: вперёд по курсу и тангажу, вправо - от вертикали
        FW.set(-Math.sin(cr.yaw) * Math.cos(cr.pitch), Math.sin(cr.pitch), -Math.cos(cr.yaw) * Math.cos(cr.pitch)); RT.crossVectors(FW, UP).normalize();
        V.copy(cr.pos).addScaledVector(FW, def.off[0]).addScaledVector(RT, def.off[1]); V.y += def.off[2];
      }
      cam.position.copy(V); cam.up.set(0, 1, 0); cam.lookAt(cr.pos);
    } else if (def.sun) {
      const s = def.sun, sd = C.G.sunDir, y = gh(s.x, s.z) + s.h; cam.position.set(s.x, y, s.z);
      const el = Math.min(Math.asin(cl(sd.y, -1, 1)), s.tilt * Math.PI / 180), hz = Math.hypot(sd.x, sd.z) || 1, k = s.back ? -1 : 1;
      V.set(k * sd.x / hz * Math.cos(el), s.back ? Math.sin(el) : Math.sin(el), k * sd.z / hz * Math.cos(el)); cam.up.set(0, 1, 0); cam.lookAt(V2.copy(cam.position).addScaledVector(V, 500));
    } else if (def.river) {
      const r = def.river, z0 = r.z, x0 = RIVER(z0), x1 = RIVER(z0 + r.len);
      const cx = x0 + r.side; cam.position.set(cx, Math.max(gh(cx, z0), -4) + r.h, z0); cam.up.set(0, 1, 0); cam.lookAt(x1, 0, z0 + r.len); // берег: выше уровня воды (WATER_Y -4)
    } else {
      const p = def.pos, t = def.look, py = def.abs ? p[1] : gh(p[0], p[2]) + p[1], ty = def.abs ? t[1] : gh(t[0], t[2]) + t[1];
      cam.position.set(p[0], Math.max(py, gh(p[0], p[2]) + 1.2), p[2]); cam.up.set(0, 1, 0); cam.lookAt(t[0], ty, t[2]);
    }
    if (C.setFov) C.setFov(fov); cam.updateMatrixWorld();
  }
  function hook() {
    const c = C.ctrl; if (!c || !c.camera) return; if (hooked.some((h) => h.ctrl === c && c.camera === h.wrap)) return;
    if (hooked.some((h) => h.ctrl === c)) return; // уже обёрнут, и обёртка на месте (ниже)
    const orig = c.camera, rec = { ctrl: c, orig, wrap: null };
    rec.wrap = function (dt, t) { orig.call(this, dt, t); const d = viewDef(curView); if (d) placeCam(d); }; // сначала обычная камера (она ставит модель самолёта), затем наш ракурс
    c.camera = rec.wrap; hooked.push(rec);
  }
  function unhook() { for (const h of hooked) { if (h.ctrl.camera === h.wrap) h.ctrl.camera = h.orig; } hooked.length = 0; }
  function setView(id) {
    curView = id; for (const [k, b] of viewBtns) b.classList.toggle('on', k === id);
    if (id === 'game') { unhook(); } else { hook(); }
    wake(); if (ready) { local(); if (dirty) { clearTimeout(saveT); saveT = setTimeout(saveNow, 2000); } }
  }
  // самолёт игрока - низко над кварталами города, вдоль улицы, и камера «сбоку»; на паузе остаётся так
  function placePlane() {
    const c = C.ctrl, cr = craftOf(); if (!cr || !c || !c.place) { msgNote.textContent = 'самолёта нет: начните вылет'; return; }
    const x = -5880, z = -2330, yaw = 2.1; // курс на запад-юго-запад над кварталами
    c.place({ x, y: gh(x, z) + 130, z, yaw }); if (god) keepAlive();
    setView('p_side'); msgNote.textContent = 'самолёт поставлен над кварталами; «Пауза» держит кадр';
  }

  // неуязвимый самолёт: флаг invuln учебного вылета (air.js hurt: попадания не считаются, топливо не убывает, под землю не уходит);
  // за край карты не улетает - разворачиваем к центру; вылет не заканчивается (noEnd)
  function keepAlive() {
    const c = C.ctrl, cr = craftOf(); if (!cr || !c || !c.game || !c.game.opts || C.state !== 'play') return;
    c.game.opts.invuln = true; c.game.opts.noEnd = true;
    if (cr.dead) return;
    const HALF = 16000;
    if (Math.max(Math.abs(cr.pos.x), Math.abs(cr.pos.z)) > HALF - 3500) {
      const n = Math.hypot(cr.pos.x, cr.pos.z) || 1; cr.yaw = Math.atan2(cr.pos.x / n, cr.pos.z / n); cr.q = null;
      if (cr.vel) { const sp = cr.vel.length() || 150; cr.vel.set(-Math.sin(cr.yaw), 0, -Math.cos(cr.yaw)).multiplyScalar(sp); }
    }
  }
  const aliveT = setInterval(() => { if (god) keepAlive(); }, 100);

  // ───────── Старт: ждём сцену ─────────
  const tick = setInterval(() => {
    const play = C.state === 'play'; stateNote.textContent = play ? '' : (Q.get('go') ? 'идёт загрузка…' : 'Сейчас меню: ракурсы и ситуации работают в бою. Нажмите «Начать вылет».');
    if (play && curView !== 'game') hook();
    if (!ready && C.G && C.G.sun && C.G.hemi && scene.fog && (C.state === 'play' || C.state === 'menu')) init();
    if (ready) { pauseBtn.classList.toggle('on', !!C.paused); godBtn.classList.toggle('on', god); }
  }, 250);
  function init() {
    scanDeps(); BASE = readBase(); S = clone(BASE); ready = true;
    // сохранённые значения этой карты и погоды - поверх исходных
    try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.S) { for (const k of Object.keys(S)) if (j.S[k] !== undefined) S[k] = j.S[k]; if (S.fogD !== undefined) S.fogD = BASE.fogD; } } catch (_) { /* повреждено - исходные */ }
    for (const row of frameRows) row.classList.toggle('off', !cfgOk);
    if (cfgOk && !bloomOk) { ui.bloom_row = true; const b = frameRows[0]; b.classList.add('off'); frameNote.textContent = 'Свечение выключено в этом пресете графики (bloom = 0); остальное работает.'; }
    if (!cfgOk) frameNote.textContent = 'В этом пресете графики постобработки нет (облегчённый кадр): ползунки кадра не действуют. Включите «Высокий» или «Ультра».';
    showAll(); apply(); dirty = false; setStatus();
    fetch(SAVE_URL + '/ping').then((r) => { diskOk = r.ok ? null : false; setStatus(); }).catch(() => { diskOk = false; setStatus(); });
  }
  window.__lab = { C, get S() { return S; }, get BASE() { return BASE; }, setView, placePlane, saveNow, payload, apply, touch, views, get ready() { return ready; }, mkCol, colOut, ui, get deps() { return deps; }, stop() { clearInterval(tick); clearInterval(aliveT); } };
  setStatus();
}
