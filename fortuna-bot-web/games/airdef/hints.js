// Постоянные подсказки управления в бою (ПК; просьба Mark 2026-10-20 — проще запомнить клавиши). Включаются в «Настройках»
// (C.sens.keys) или клавишей F1. Панель в левом нижнем углу, полупрозрачная, клики сквозь неё; набор клавиш — под то,
// чем сейчас управляет игрок: самолёт, вертолёт, оператор комплекса ПВО, карта обороны. На сенсорных устройствах не показывается.
import { tr } from './i18n.js?v=20261022u';
const K = (k) => k.split(' / ').map((x) => `<kbd>${x}</kbd>`).join(' ');
const SETS = {
  plane: [['W / S', tr('газ больше / меньше')], ['Shift', tr('форсаж')], ['A / D', tr('крен')], ['↑ / ↓', tr('тангаж')], [tr('Мышь'), tr('куда лететь')], [tr('Пробел / F'), tr('пуск, сброс')], ['Q / Tab', tr('следующее оружие')],
    ['X / C', tr('ловушки')], ['G', tr('вид контейнера')], ['R', tr('следующая цель контейнера')], ['Z', tr('увеличение контейнера')], ['O', tr('лазер: авто / вкл / выкл')], ['V', tr('камера')], ['N', tr('камера за оружием')], ['L', tr('обзор мышью')], ['M', tr('карта')], ['T', tr('АВТО: захват и пуск')], ['Esc', tr('пауза')]],
  heli: [['W / S', tr('разгон / торможение (держать)')], ['A / D', tr('поворот')], ['↑ / Shift', tr('вверх')], ['↓ / Ctrl', tr('вниз')], ['← / →', tr('шаг вбок')], [tr('Мышь'), tr('прицел и камера')],
    [tr('Пробел / F'), tr('пуск ПТУР, залп НАР')], ['Q / Tab', tr('следующее оружие')], ['X / C', tr('ловушки')], ['G', tr('вид прицела')], ['R', tr('следующая цель')], ['E', tr('подскок: вверх, пуск, вниз')], ['Z', tr('увеличение')], ['V', tr('камера')], ['M', tr('карта')], ['T', tr('АВТО')], ['Esc', tr('пауза')]],
  heliR: [['W / S', tr('наклон вперёд / назад (ручка)')], ['A / D', tr('крен влево / вправо (ручка)')], ['↑ / Shift', tr('шаг-газ: вверх')], ['↓ / Ctrl', tr('шаг-газ: вниз')], ['← / →', tr('педали: поворот')],
    [tr('Мышь'), tr('прицел и камера')], [tr('Пробел / F'), tr('пуск ПТУР, залп НАР')], ['Q / Tab', tr('следующее оружие')], ['X / C', tr('ловушки')], ['G', tr('вид прицела')], ['E', tr('подскок: на сколько подняться')], ['V', tr('камера')], ['Esc', tr('пауза')]], // «Реализм»: честное управление
  op: [[tr('Мышь / WASD'), tr('поворот')], [tr('Колесо / Z'), tr('увеличение')], [tr('Щелчок'), tr('выбрать цель')], ['Tab', tr('следующая цель')], [tr('Пробел / F'), tr('пуск (пушки — держать)')], ['E', tr('РЛС вкл / выкл')], ['M', tr('метод наведения')],
    ['B', tr('бинокль')], ['V', tr('камера')], ['Q', tr('на карту')], ['T', tr('АВТО')], ['Esc', tr('пауза')]],
  map: [[tr('Тянуть'), tr('сдвиг карты')], [tr('Колесо'), tr('масштаб')], [tr('Щелчок'), tr('выбрать, поставить')], ['Enter', tr('подтвердить место')], [tr('Пробел'), tr('начать волну')], ['Esc', tr('отмена, пауза')]],
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
    const cur = C.ctrl && C.ctrl.inner ? C.ctrl.inner : C.ctrl; // в уроке обучения режимом управляет обёртка урока (training.js)
    if (cur === ctrls.air) { const p = C.player; return p && !p.dead ? (p.heli ? (p.hm && !p.hm.arcade ? 'heliR' : 'heli') : 'plane') : ''; }
    if (cur === ctrls.defense || cur === ctrls.multi) { const s = ctrls.defense.st; return s && s.view === 'op' ? 'op' : s && s.view === 'map' ? 'map' : ''; }
    return '';
  }
  function refresh() {
    const on = !!(C.sens && C.sens.keys), w = on ? which() : '';
    el.classList.toggle('on', !!w);
    if (!w || w === last) return; last = w;
    el.innerHTML = '<b>' + tr('{0} · F1 — скрыть', [{ plane: tr('Самолёт'), heli: tr('Вертолёт'), heliR: tr('Вертолёт · Реализм'), op: tr('Оператор комплекса'), map: tr('Карта обороны') }[w]]) + '</b>' + SETS[w].map(([k, t]) => `<div>${K(k)}<span>${t}</span></div>`).join('');
  }
  addEventListener('keydown', (e) => { if (e.code === 'F1' && C.sens) { e.preventDefault(); C.sens.keys = !C.sens.keys; C.saveSens(); last = ''; refresh(); } });
  setInterval(refresh, 300);
  return { refresh };
}
