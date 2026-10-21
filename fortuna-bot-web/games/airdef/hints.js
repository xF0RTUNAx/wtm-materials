// Постоянные подсказки управления в бою (ПК; просьба Mark 2026-10-20 — проще запомнить клавиши). Включаются в «Настройках»
// (C.sens.keys) или клавишей F1. Панель в левом нижнем углу, полупрозрачная, клики сквозь неё; набор клавиш — под то,
// чем сейчас управляет игрок: самолёт, вертолёт, оператор комплекса ПВО, карта обороны. На сенсорных устройствах не показывается.
const K = (k) => k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ');
const SETS = {
  plane: [['W / S', 'газ больше / меньше'], ['Shift', 'форсаж'], ['A / D', 'крен'], ['↑ / ↓', 'тангаж'], ['Мышь', 'куда лететь'], ['Пробел / F', 'пуск, сброс'], ['Q / Tab', 'следующее оружие'],
    ['X / C', 'ловушки'], ['G', 'вид контейнера'], ['R', 'следующая цель контейнера'], ['Z', 'увеличение контейнера'], ['O', 'лазер: авто / вкл / выкл'], ['V', 'камера'], ['N', 'камера за оружием'], ['L', 'обзор мышью'], ['M', 'карта'], ['T', 'АВТО: захват и пуск'], ['Esc', 'пауза']],
  heli: [['W / S', 'разгон / торможение (держать)'], ['A / D', 'поворот'], ['↑ / Shift', 'вверх'], ['↓ / Ctrl', 'вниз'], ['← / →', 'шаг вбок'], ['Мышь', 'прицел и камера'],
    ['Пробел / F', 'пуск ПТУР, залп НАР'], ['Q / Tab', 'следующее оружие'], ['X / C', 'ловушки'], ['G', 'вид прицела'], ['R', 'следующая цель'], ['Z', 'увеличение'], ['V', 'камера'], ['M', 'карта'], ['T', 'АВТО'], ['Esc', 'пауза']],
  heliR: [['W / S', 'наклон вперёд / назад (ручка)'], ['A / D', 'крен влево / вправо (ручка)'], ['↑ / Shift', 'шаг-газ: вверх'], ['↓ / Ctrl', 'шаг-газ: вниз'], ['← / →', 'педали: поворот'],
    ['Мышь', 'прицел и камера'], ['Пробел / F', 'пуск ПТУР, залп НАР'], ['Q / Tab', 'следующее оружие'], ['X / C', 'ловушки'], ['G', 'вид прицела'], ['V', 'камера'], ['Esc', 'пауза']], // «Реализм»: честное управление
  op: [['Мышь / WASD', 'поворот'], ['Колесо / Z', 'увеличение'], ['Щелчок', 'выбрать цель'], ['Tab', 'следующая цель'], ['Пробел / F', 'пуск (пушки — держать)'], ['E', 'РЛС вкл / выкл'], ['M', 'метод наведения'],
    ['B', 'бинокль'], ['V', 'камера'], ['Q', 'на карту'], ['T', 'АВТО'], ['Esc', 'пауза']],
  map: [['Тянуть', 'сдвиг карты'], ['Колесо', 'масштаб'], ['Щелчок', 'выбрать, поставить'], ['Enter', 'подтвердить место'], ['Пробел', 'начать волну'], ['Esc', 'отмена, пауза']],
};
export function createHints(C, ctrls) {
  const off = { refresh() {} };
  if (C.IS_TOUCH || typeof document === 'undefined' || !document.body || !document.body.appendChild) return off; // телефон и стенды без DOM
  const el = document.createElement('div'); el.id = 'keyHints'; document.body.appendChild(el);
  const css = document.createElement('style');
  css.textContent = `#keyHints{position:fixed;left:12px;bottom:12px;z-index:30;pointer-events:none;display:none;max-width:290px;padding:8px 10px;background:rgba(14,17,12,.62);border:1px solid rgba(233,230,220,.12);border-radius:4px;font:12px/1.55 'IBM Plex Sans',-apple-system,sans-serif;color:#e9e6dc}
#keyHints.on{display:block}#keyHints b{display:block;font:11px 'IBM Plex Sans';color:#a9b19c;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}
#keyHints div{display:flex;gap:8px;justify-content:space-between}#keyHints span{color:#c9c6bc;text-align:right}
#keyHints kbd{display:inline-block;min-width:14px;padding:0 4px;border:1px solid rgba(233,230,220,.35);border-bottom-width:2px;border-radius:3px;font:600 11px 'IBM Plex Mono',monospace;color:#fff;text-align:center;background:rgba(255,255,255,.06)}
body.msheetOn #keyHints{display:none}`;
  (document.head || document.body).appendChild(css);
  let last = '';
  function which() {
    if (C.state !== 'play' || !C.ctrl || C.paused) return '';
    if (C.ctrl === ctrls.air) { const p = C.player; return p && !p.dead ? (p.heli ? (p.hm && !p.hm.arcade ? 'heliR' : 'heli') : 'plane') : ''; }
    if (C.ctrl === ctrls.defense || C.ctrl === ctrls.multi) { const s = ctrls.defense.st; return s && s.view === 'op' ? 'op' : s && s.view === 'map' ? 'map' : ''; }
    return '';
  }
  function refresh() {
    const on = !!(C.sens && C.sens.keys), w = on ? which() : '';
    el.classList.toggle('on', !!w);
    if (!w || w === last) return; last = w;
    el.innerHTML = `<b>${{ plane: 'Самолёт', heli: 'Вертолёт', heliR: 'Вертолёт · Реализм', op: 'Оператор комплекса', map: 'Карта обороны' }[w]} · F1 — скрыть</b>` + SETS[w].map(([k, t]) => `<div>${K(k)}<span>${t}</span></div>`).join('');
  }
  addEventListener('keydown', (e) => { if (e.code === 'F1' && C.sens) { e.preventDefault(); C.sens.keys = !C.sens.keys; C.saveSens(); last = ''; refresh(); } });
  setInterval(refresh, 300);
  return { refresh };
}
