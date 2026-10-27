// Перевод уже отформатированных строк, пришедших с сервера или из общего расчёта боя (sim/*): сервер говорит по-русски, а
// подставленные числа и имена в строке уже стоят. trFmt(s) находит в словаре шаблон 'Сбито: {0}/{1}', по которому строка
// собрана, достаёт значения и подставляет их в английский вариант. Нет шаблона — строка как есть. По-русски (LANG ≠ 'en') — не трогает.
// Подстановка {eta} (время, которое лента боя вставляет на месте) в шаблоне — обычный текст и в строке тоже.
import { LANG } from './i18n.js?v=20261027b';
import EN from './lang/en.js?v=20261027b';

let RX = null;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function build() {
  RX = [];
  for (const k of Object.keys(EN)) {
    if (!/\{\d+\}/.test(k)) continue;
    const parts = k.split(/\{(\d+)\}/); // текст, номер, текст, номер, …, текст
    const stat = parts.filter((_, i) => i % 2 === 0).join('');
    if (stat.trim().length < 4) continue; // почти одни подстановки — слишком расплывчато
    let src = '^'; const idx = [];
    parts.forEach((p, i) => { if (i % 2 === 0) src += esc(p); else { src += '([\\s\\S]*?)'; idx.push(+p); } });
    RX.push({ re: new RegExp(src + '$'), idx, en: EN[k], w: stat.length });
  }
  RX.sort((a, b) => b.w - a.w); // сначала самые определённые шаблоны
}
export function trFmt(s) {
  if (LANG !== 'en' || typeof s !== 'string' || !s) return s;
  const d = EN[s]; if (d !== undefined) return d;
  if (!RX) build();
  for (const r of RX) {
    const m = s.match(r.re); if (!m) continue;
    const a = []; r.idx.forEach((n, i) => { a[n] = trFmt(m[i + 1]); }); // значения тоже могут быть готовой русской фразой
    return r.en.replace(/\{(\d+)\}/g, (_x, n) => (a[n] ?? ''));
  }
  return s;
}
