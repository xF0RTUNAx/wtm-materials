// Онлайн «Мульти-волны» (2026-10-17, решения Mark — AIRDEF_PLAN.md «Мульти-волна: обучение и онлайн»): общие правила сервера
// (game-server/airdef-multi.js) и клиента. Две команды — восток и запад, два раунда со сменой сторон: в каждом одна команда
// собирает волну (наряд на цели, как в одиночной «За волну»), другая ставит ПВО. Победа — по сумме: чья волна разрушила больше
// ценности военных объектов. Подготовка — одновременная, общий таймер; атака не видит ПВО до обнаружения, оборона — план волны.
import { tr } from '../i18n.js?v=20261024t';
import { AG, THREAT, MULTI, multiBudget, multiItems } from '../arsenal.js?v=20261024t';
import { LIM_ON } from './combined.js?v=20261024t';

export const KIND = 'multi';
export const ROUNDS = 2;
export const PREP_T = 130;               // подготовка раунда, с (все «Готов» — раньше; Mark 2026-10-18: +30 с)
export const WAVE_MAX = 720;             // волна не дольше, с времени боя (дроны — пуск до 5 мин и ≈ 6 мин над районом; пустые отрезки — ×3)
export const DEBRIEF_T = 12, RESULTS_T = 25;
export const QUIET_K = 3;                // над районом пусто и никто не за пультом — сервер считает ×3
export const QUIET_R = 4000;             // «пусто»: ни одной ракеты или дрона ближе к военным объектам и комплексам ПВО, м (и ЗУР в воздухе нет)
export const LIM = LIM_ON;               // пределы расписания онлайна: носитель ≤ 3 мин, дроны ≤ 5, баллистика ≤ 6
export const SIZES = [1, 2, 3, 4, 5, 6];
export const TEAMS = ['east', 'west'];
export const TEAM_NAME = { east: tr('Восток'), west: tr('Запад') };
// бюджет на игрока: команда из n — у каждого base × (0,5 + 0,5/n): вдвоём — по 75 %, вшестером — по 58 % (на команду 3,5 × base)
export const share = (n) => (n <= 1 ? 1 : 0.5 + 0.5 / n);
export const atkBudget = (side, era, n) => Math.round(multiBudget(side, era) * share(n));
export const defBudget = (era, n, mode) => Math.round(MULTI.sam[era] * (mode === 'arcade' ? 1.2 : 1) * share(n));
// потолки нагрузки (сервер — ноутбук, клиенты — телефоны)
export const UNIT_CAP = 40;              // единиц одного типа у игрока
export const INFLIGHT_CAP = 160;         // ракет и дронов в воздухе на комнату: больше — пуски ждут (по секунде)
export const PLAN_RATE = 0.4;            // план от игрока — не чаще, с
export const PLAN_MAX = 24000;           // размер плана (JSON), знаков
// чат команды на подготовке: короткие сообщения, не чаще раза в 1,5 с, мат — звёздочками
export const CHAT_MAX = 120, CHAT_GAP = 1.5;
const BAD = /(?<![а-яёa-z])(?:за|на|по|от|у|вы|пере|до|об|раз|с)?(х[уy][йеёиюяe]|п[иi]зд|[её]б[аеуиыоё]|бля|муд[аио]|пид[оа]р|сук[аи]|шлюх|г[ао]ндон|залуп|f+u+c+k|sh[i1]t|b[i1]tch|cunt)[а-яёa-z]*/giu; // с начала слова (не «небо», не «хлеба»)
export function cleanChat(s) {
  let t = String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  t = t.replace(BAD, (w) => '*'.repeat(Math.min(6, w.length)));
  return t;
}
// баллистика на волну (одиночная) или на атакующую команду (онлайн), решение Mark 2026-10-12/13: «Кинжал» и «Искандер» (у него
// ложные цели) — только без другой баллистики, по 1 (у команды из 5–6 — по 2); иначе всего 2 ракеты (у 5–6 игроков — 3)
export const TBM_RULE = (n) => (n >= 5 ? { kinzhal: 2, iskander: 2, total: 3 } : { kinzhal: 1, iskander: 1, total: 2 });
export const TBM_CAP = (n) => TBM_RULE(n).total;
export const tbmOf = (n) => Object.entries(n || {}).reduce((s, [k, v]) => s + (AG[k] && AG[k].kind === 'tbm' ? v : 0), 0);
// суммарный состав баллистики команды (планы союзников и свой) → текст запрета или null
export function tbmCheck(n, players) {
  const r = TBM_RULE(players), K = n.kinzhal || 0, I = n.iskander || 0, A = tbmOf(n);
  if (K && A > K) return tr('«Кинжал» — только без другой баллистики');
  if (I && A > I) return tr('«Искандер» — только без другой баллистики');
  if (K > r.kinzhal) return tr('«Кинжал» — не больше {0}', [r.kinzhal]);
  if (I > r.iskander) return tr('«Искандер» — не больше {0}', [r.iskander]);
  if (A > r.total) return tr('Баллистика — не больше {0}', [r.total]);
  return null;
}
// сложить составы (план игрока и союзников): { ключ: n }
export const sumN = (...ns) => { const o = {}; for (const n of ns) for (const [k, v] of Object.entries(n || {})) o[k] = (o[k] || 0) + v; return o; };
// стоимость плана в очках угрозы
export const planCost = (n) => Object.entries(n || {}).reduce((s, [k, v]) => s + (THREAT[k] ?? 3) * v, 0);
// состав для sim/combined.js из плана игрока: [[ключ, n, эшелон, носитель]] (+ разведчик бесплатно)
export function compOf(side, era, n) {
  const out = [[side === 'east' ? 'scout_e' : 'scout', 1, 1]];
  for (const [k, via] of multiItems(side, era)) { const c = (n || {})[k] || 0; if (c) out.push([k, c, AG[k].uav ? 1 : AG[k].kind === 'tbm' ? 3 : 2, via || undefined]); }
  return out;
}
// проверка плана от клиента: только типы стороны и эпохи, число единиц, точки маршрута в районе, высота из списка, время — число,
// цель — военный объект (tgt), «ПВО противника» (sam) или засечённый комплекс (sid). Возвращает чистый план или null
const ALTS = new Set([null, 300, 3000]);
export function cleanPlan(raw, side, era, objIds, half) {
  if (!raw || typeof raw !== 'object') return null;
  const items = new Map(multiItems(side, era)), n = {}, cfg = {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const pts = (a) => (Array.isArray(a) ? a.slice(0, 3).filter((p) => Array.isArray(p) && num(p[0]) !== null && num(p[1]) !== null && Math.hypot(p[0], p[1]) < half).map((p) => [Math.round(p[0]), Math.round(p[1])]) : undefined);
  const unit = (u) => {
    if (!u || typeof u !== 'object') return undefined;
    const o = {};
    if (u.pts !== undefined) o.pts = pts(u.pts);
    if (u.alt !== undefined) o.alt = ALTS.has(u.alt) ? u.alt : null;
    if (u.t !== undefined && u.t !== null) { const t = num(u.t); if (t !== null) o.t = Math.max(0, Math.min(3600, Math.round(t))); }
    if (u.sam !== undefined) o.sam = !!u.sam;
    if (u.tgt !== undefined) o.tgt = u.tgt === null ? null : objIds.has(u.tgt) ? u.tgt : undefined;
    if (u.sid !== undefined) o.sid = Number.isInteger(u.sid) ? u.sid : undefined;
    return o;
  };
  for (const k of Object.keys(raw.n || {})) {
    if (!items.has(k)) continue;
    const c = Math.max(0, Math.min(UNIT_CAP, Math.floor(num(raw.n[k]) || 0))); if (c) n[k] = c;
  }
  for (const k of Object.keys(raw.cfg || {})) {
    if (!items.has(k)) continue;
    const r = raw.cfg[k] || {}, c = unit(r) || {};
    c.pts = c.pts || []; c.units = Array.isArray(r.units) ? r.units.slice(0, UNIT_CAP).map(unit) : [];
    cfg[k] = c;
  }
  return { n, cfg };
}
// счёт раунда: ценность военных объектов, разрушенная волной (разрушен — вся, повреждён — доля урона)
export function damageValue(objects) { let v = 0; for (const o of objects) if (!o.noTarget) v += o.value * (o.dead ? 1 : Math.min(1, (o.dmgTaken || 0) / o.hpMax)); return v; }
export const totalValue = (objects) => objects.reduce((s, o) => s + (o.noTarget ? 0 : o.value), 0);
// снимок оружия «Мульти-волны»: [id, x, y, z, vx, vy, vz, флаги] — 1 разгон баллистики, 2 ложная цель
export const W_BOOST = 1, W_DECOY = 2;
