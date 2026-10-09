// Расположение сенсорных кнопок (как в «Летке»): свои места, размер и прозрачность каждой кнопки — отдельно для вылета
// и для оператора ЗРК. Хранится в долях экрана, отдельно для горизонтального и вертикального положения телефона,
// поверх мест по умолчанию (air.js — layoutTouch, airdef.html — #opBtns). Открывается из «Настроек».
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const LAYOUT_SETS = {
  air: { name: 'Вылет', btns: { tFire: 'СБРОС', tThr: 'ГАЗ / ФОРСАЖ', tFlare: 'ЛОВУШКИ', tLock: 'ЦЕЛЬ', tMap: 'КАРТА', tAuto: 'АВТО', tPad: 'КРЕСТОВИНА' } },
  op: { name: 'Оператор ЗРК', btns: { opFire: 'ПУСК', opRadar: 'РЛС', opMethod: 'МЕТОД', opCam: 'КАМ.', opAuto: 'АВТО', opMap: 'КАРТА' } },
};
const ALL = Object.assign({}, LAYOUT_SETS.air.btns, LAYOUT_SETS.op.btns);
const KEY = 'fortuna_airdef_layout2'; // 2 — после объединения кнопок (газ+форсаж, ЛТЦ+диполи; без «ОРУЖ.», «КОНТ.») старые места не подходят
const ls = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* приватный режим */ } } };
let layout = {};
try { const v = JSON.parse(ls.get(KEY) || '{}'); if (v && typeof v === 'object') layout = v; } catch (_) { /* по умолчанию */ }
const orient = () => (innerWidth >= innerHeight ? 'land' : 'port');
const save = () => ls.set(KEY, JSON.stringify(layout));

// поставить кнопки по сохранённому (вызывается после мест по умолчанию и при повороте экрана)
export function applyLayout() {
  const L = layout[orient()] || {};
  for (const id of Object.keys(ALL)) {
    const el = $(id), c = L[id]; if (!el) continue;
    const moved = c && Number.isFinite(c.x) && Number.isFinite(c.y), sc = c && Number.isFinite(c.s) ? clamp(c.s, 0.5, 2) : 1;
    const op = id.startsWith('op'); // кнопки оператора стоят столбцом; сдвинутая — уходит из столбца
    if (op) el.style.position = moved ? 'fixed' : '';
    if (moved) { el.style.left = (clamp(c.x, 0, 1) * 100).toFixed(2) + '%'; el.style.top = (clamp(c.y, 0, 1) * 100).toFixed(2) + '%'; el.style.right = el.style.bottom = 'auto'; }
    else if (op) el.style.left = el.style.top = el.style.right = el.style.bottom = '';
    else { el.style.left = el.style.top = ''; el.style.right = el.dataset.r || ''; el.style.bottom = el.dataset.b || ''; } // места вылета по умолчанию — из air.js (layoutTouch)
    el.style.transform = moved ? `translate(-50%,-50%) scale(${sc})` : sc !== 1 ? `scale(${sc})` : '';
    el.style.transformOrigin = moved ? '' : 'right bottom';
    el.style.opacity = c && Number.isFinite(c.o) ? String(clamp(c.o, 0.15, 1)) : '';
  }
}
addEventListener('resize', () => applyLayout());

let led = null; // редактор: { bar, set, sel, drag }
function entry(id) { // запись кнопки (создаётся с текущим местом на экране)
  const L = layout[orient()] || (layout[orient()] = {});
  if (!L[id] || !Number.isFinite(L[id].x)) { const r = $(id).getBoundingClientRect(); L[id] = { ...(L[id] || {}), x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }; }
  return L[id];
}
function select(id) {
  if (!led) return; led.sel = id;
  for (const k of Object.keys(ALL)) $(k).classList.toggle('ledOn', k === id);
  const c = entry(id);
  $('ledSel').textContent = ALL[id]; $('ledS').value = c.s || 1; $('ledO').value = c.o || 1; $('ledCtl').classList.add('on');
  led.bar.classList.toggle('low', c.y < 0.45); // панель — с другой стороны экрана от выбранной кнопки
}
function showSet(set) {
  led.set = set; led.sel = null; $('ledCtl').classList.remove('on');
  for (const k of Object.keys(ALL)) $(k).classList.remove('ledOn');
  document.body.classList.toggle('ledAir', set === 'air'); document.body.classList.toggle('ledOp', set === 'op');
  for (const b of led.bar.querySelectorAll('[data-set]')) b.classList.toggle('on', b.dataset.set === set);
}
export function openLayoutEditor(onClose) {
  if (led) return;
  const bar = document.createElement('div'); bar.id = 'ledBar';
  bar.innerHTML = `<div class="ledTop"><span class="seg">${Object.entries(LAYOUT_SETS).map(([k, s]) => `<button data-set="${k}">${s.name}</button>`).join('')}</span>
      <span class="ledHelp">Перетащите кнопку пальцем, нажмите — размер и прозрачность.</span></div>
    <div id="ledCtl"><b id="ledSel"></b>
      <label>Размер <input type="range" id="ledS" min="0.6" max="1.8" step="0.05"></label>
      <label>Прозрачность <input type="range" id="ledO" min="0.2" max="1" step="0.05"></label>
      <button class="btn alt sm" id="ledReset1">Вернуть кнопку</button></div>
    <div class="ledBtns"><button class="btn alt sm" id="ledResetAll">Всё по умолчанию</button><button class="btn sm" id="ledDone">Готово</button></div>`;
  document.body.appendChild(bar); document.body.classList.add('layoutEdit');
  led = { bar, set: 'air', sel: null, drag: null, onClose }; showSet('air'); applyLayout();
  bar.addEventListener('input', (e) => {
    if (!led.sel) return; const c = entry(led.sel);
    if (e.target.id === 'ledS') c.s = +e.target.value; if (e.target.id === 'ledO') c.o = +e.target.value;
    applyLayout(); save();
  });
  bar.addEventListener('click', (e) => {
    const L = layout[orient()] || {}, s = e.target.closest('[data-set]');
    if (s) showSet(s.dataset.set);
    if (e.target.id === 'ledReset1' && led.sel) { delete L[led.sel]; applyLayout(); save(); select(led.sel); }
    if (e.target.id === 'ledResetAll') { for (const k of Object.keys(LAYOUT_SETS[led.set].btns)) delete L[k]; applyLayout(); save(); if (led.sel) select(led.sel); }
    if (e.target.id === 'ledDone') closeLayoutEditor();
  });
}
export function closeLayoutEditor() {
  if (!led) return;
  save(); led.bar.remove(); for (const c of ['layoutEdit', 'ledAir', 'ledOp']) document.body.classList.remove(c);
  for (const k of Object.keys(ALL)) $(k).classList.remove('ledOn');
  const cb = led.onClose; led = null; if (cb) cb();
}
export const layoutEditing = () => !!led;
// в редакторе нажатия на кнопки не доходят до игры (перехват на фазе погружения) — они только выбирают и двигают кнопку
addEventListener('pointerdown', (e) => {
  if (!led) return;
  const el = e.target.closest && e.target.closest('.tb');
  if (!el || !LAYOUT_SETS[led.set].btns[el.id]) { if (!(e.target.closest && e.target.closest('#ledBar'))) { e.stopPropagation(); e.preventDefault(); } return; }
  e.stopPropagation(); e.preventDefault();
  select(el.id);
  const r = el.getBoundingClientRect();
  led.drag = { id: el.id, pid: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) }; led.bar.classList.add('drag');
}, true);
addEventListener('pointermove', (e) => {
  if (!led || !led.drag || e.pointerId !== led.drag.pid) return;
  const c = entry(led.drag.id);
  c.x = clamp((e.clientX - led.drag.dx) / innerWidth, 0.03, 0.97); c.y = clamp((e.clientY - led.drag.dy) / innerHeight, 0.05, 0.97);
  applyLayout();
});
const up = (e) => { if (led && led.drag && e.pointerId === led.drag.pid) { const id = led.drag.id; led.drag = null; led.bar.classList.remove('drag'); save(); select(id); } };
addEventListener('pointerup', up); addEventListener('pointercancel', up);
applyLayout(); // кнопки оператора — сразу (кнопки вылета — после мест по умолчанию в air.js)
