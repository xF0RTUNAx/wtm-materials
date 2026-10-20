// Прокачка «Воздушного превосходства» (AIRDEF_PROGRESSION.md): дерево из арсенала, ранги, цены, паритет сторон, награда
// за бой. Чистый модуль — общий для клиента, игрового сервера и функций Supabase (тратит и начисляет только сервер).
// Опыт — исследование, серебро — покупка. Ранг единицы = её эпоха. Аркада и обучение открывают всё — прокачка только
// для «Реализма». Ветки: air — самолёты вылета, wpn — оружие подвесок, pvo — комплексы, strike — удары «Мульти-волны».
import { AG, SAM, LOADOUTS, MULTI, SAM_COST, CARRIERS, PLANES, AG_KIND, SAM_TYPE, THREAT, loadoutRole } from './arsenal.js?v=20261022q';
import { SPECS, SPEED_K } from './sim/flight.js?v=20261022q';
import { HSPECS } from './sim/heli.js?v=20261022q';

export const BRANCHES = [
  { id: 'air', name: 'Авиация', hint: 'самолёты для вылета' },
  { id: 'wpn', name: 'Вооружение', hint: 'бомбы и ракеты подвесок' },
  { id: 'pvo', name: 'ПВО', hint: 'комплексы для обороны' },
  { id: 'strike', name: 'Волна', hint: 'дроны, крылатые и баллистика «Мульти-волны»' },
  // вертолёты (Mark 2026-10-20): своя ветка (паритет, цели, цены — свои), в «Исследованиях» — внутри «Авиации» рядом с Востоком и Западом (sub)
  { id: 'heli', name: 'Вертолёты', hint: 'вертолёты для вылета', sub: 'air' },
];
export const SIDES = ['east', 'west'];
export const SIDE_NAME = { east: 'Восток', west: 'Запад' };
export const RANKS = [1, 2, 3, 4];
export const RANK_NAME = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

// старт (Mark 2026-10-19): всё для «Операции» эпохи I (охота за ПВО + удар) у обеих сторон и минимальная оборона
export const START = {
  air: ['e_su17', 'e_mig23', 'e_f4', 'e_mirage_f1'], // ветки 2026-10-20: Су-24М и Су-25 — в ранге II; у Востока старт — Су-17М4 (охота за ПВО: Х-28) и МиГ-23БН
  wpn: ['kh28', 'fab500', 'agm45', 'mk82', 'shturm', 's8', 'hydra'],
  pvo: ['s75', 'zsu234', 'strela2', 'hawk', 'm163', 'redeye'],
  strike: ['r17', 'agm86'],
  heli: ['h_mi24', 'h_uh1'], // вертолёты: Ми-24В и UH-1H с их оружием («Штурм», С-8, Hydra — в «Вооружении», стартовые)
};
// аналог у другой стороны (по роли): подсказка «что купить за другую сторону» и подбор в онлайне
export const PAIR = {
  e_su25: 'f16', e_su24: 'e_f4', e_su17: 'f18', su30: 'f18', e_su34: 'e_f15e', mig29: 'e_gripen', e_mig31: 'f18', e_su57: 'e_f35',
  e_mig23: 'e_f4', e_mig27: 'e_a10', e_tu22m2: 'e_f111', e_tornado: 'e_mig27', e_a10: 'e_mig27', e_f111: 'e_tu22m2', e_f15e: 'e_su34',
  e_mig21n: 'e_f5', e_su7b: 'e_f100', e_tu16: 'e_buccaneer', e_mig25: 'e_f4', e_f5: 'e_mig21n', e_f100: 'e_su7b', e_buccaneer: 'e_tu16', e_jaguar: 'e_mig27',
  e_harrier: 'e_yak38', e_vulcan: 'e_tu22m2', e_draken: 'e_mig21n', e_viggen: 'e_mig27', e_f117: 'e_su57', e_mirage: 'e_su24', e_rafale: 'su30', e_b2: 'e_tu22m2',
  e_yak38: 'e_harrier', e_il28: 'e_hunter', e_tu22: 'e_buccaneer', e_tu95: 'e_b52', e_su27: 'e_f18c', e_su35: 'e_typhoon', e_tu22m3: 'e_b1b', e_tu160: 'e_b2',
  e_hunter: 'e_il28', e_etendard: 'e_su17', e_mirage_f1: 'e_mig21n', e_f18c: 'e_su27', e_ea18g: 'e_mig31', e_b52: 'e_tu95', e_b1b: 'e_tu22m3', e_typhoon: 'e_su35',
  f16: 'e_su25', e_f4: 'e_su24', f18: 'e_su17', e_gripen: 'mig29', e_f35: 'e_su57', e_f22: 'e_su57',
  fab500: 'mk82', kh28: 'agm45', kab500l: 'gbu12', kh58: 'agm88', kab500kr: 'agm65b', kh29t: 'agm65b', kh25ml: 'agm65b', kab500s: 'gbu31',
  kh31p: 'agm88', ecm_e: 'ecm_w', kh59m: 'jassm', umpk: 'gbu39', decoy_e: 'mald', kh59mk2: 'jassm',
  mk82: 'fab500', bomb1000: 'fab500', agm45: 'kh28', gbu10: 'kab500l', gbu12: 'kab500l', agm88: 'kh58', agm65b: 'kh29t', gbu31: 'kab500s', ecm_w: 'ecm_e', gbu39: 'umpk',
  jassm: 'kh59mk2', mald: 'decoy_e', aargm: 'kh31p', fab100: 'mk82', fab250: 'mk82', ofab250: 'mk82', fab1000: 'gbu10', gbu24: 'kab500l', gbu57: 'kab500s',
  s75: 'hawk', s125: 'hawk', strela1: 'chaparral', zsu234: 'm163', strela10: 'chaparral', strela2: 'redeye', kub: 'hawk', osa: 'roland', igla: 'stinger', s300: 'patriot', tor: 'roland',
  iglas: 'stinger', tunguska: 'gepard', gpsjam: 'gpsjamw', s400: 'pac3', bukm3: 'nasams', torm2: 'roland', pantsir: 'skyguard', verba: 'stinger',
  zu23: 'm163', buk: 'patriot', phalanx: 'pantsir',
  hawk: 's75', m163: 'zsu234', chaparral: 'strela1', avenger: 'strela10', redeye: 'strela2', roland: 'osa', gepard: 'tunguska', stinger: 'igla', rapier: 'osa', skyguard: 'pantsir',
  patriot: 's300', gpsjamw: 'gpsjam', pac3: 's400', nasams: 'bukm3', sampt: 's400', khordad: 'bukm3',
  h_mi24: 'h_uh1', h_uh1: 'h_mi24', h_mi28: 'h_ah64', h_ah64: 'h_mi28', h_ka52: 'h_rah66', h_ah1: 'h_mi24', // вертолёты
  h_mi8: 'h_uh60', h_uh60: 'h_mi8', h_ka50: 'h_ah64', h_rah66: 'h_ka52', // 2026-10-21: Ми-8МТВ ↔ UH-60 (транспортно-боевые), Ка-50 → AH-64D (одноместные штурмовые), RAH-66 ↔ Ка-52 (ранг IV)
  shturm: 'hellfire', ataka: 'hellfire', hellfire: 'ataka', s8: 'hydra', hydra: 's8',
  r17: 'atacms', kh55d: 'quail', kh55_s: 'agm86', kh55: 'jassm', tochka: 'atacms', kh555: 'agm86', kh101_s: 'jassm_s', kh101: 'jassm', shahed: 'uav_w', kalibr: 'tomahawk', iskander: 'atacms', kinzhal: 'atacms',
  agm86: 'kh55_s', uav_w: 'shahed', slam: 'kh555', jsow: 'kh555', tomahawk: 'kalibr', atacms: 'iskander', quail: 'kh55d', sdb: 'kh55d', jassm_s: 'kh555', storm_s: 'kh555', storm: 'kh59mk2',
};
// линии дерева (Mark 2026-10-19: как в дереве исследований WTM): ключ → предыдущая единица линии; исследовать можно, когда
// предыдущая исследована. Без предыдущей — начало линии (открыта, когда открыт её ранг). Развилка — у одной предыдущей несколько
export const PARENT = {
  // авиация (Mark 2026-10-20: линии по преемственности, каждая — до ранга III–IV)
  // Восток: МиГ-23БН★ → МиГ-27К → МиГ-29 · Су-17М4★ → Су-24М → Су-34 → Су-57 · Су-7Б → Су-25 → Як-38М ·
  // МиГ-21бис → МиГ-25БМ → МиГ-31, развилка МиГ-25БМ → Су-27СМ → Су-30 → Су-35С · Ил-28 → Ту-16 → Ту-22 → Ту-22М2 → Ту-22М3 → Ту-95МС → Ту-160
  e_mig27: 'e_mig23', mig29: 'e_mig27', e_su24: 'e_su17', e_su34: 'e_su24', e_su57: 'e_su34', e_su25: 'e_su7b', e_yak38: 'e_su25',
  e_mig25: 'e_mig21n', e_mig31: 'e_mig25', e_su27: 'e_mig25', su30: 'e_su27', e_su35: 'su30',
  e_tu16: 'e_il28', e_tu22: 'e_tu16', e_tu22m2: 'e_tu22', e_tu22m3: 'e_tu22m2', e_tu95: 'e_tu22m3', e_tu160: 'e_tu95',
  // Запад: F-5E → F-16 → F-35, развилка F-16 → A-10; шведская ветка F-5E → Draken → Viggen → Gripen · F-4★ → F/A-18C → F/A-18E → EA-18G ·
  // F-100D → F-111 → F-15E → F-22, развилки F-111 → F-117 → B-2 и F-111 → B-52 → B-1B · Hunter → Buccaneer → Tornado → Typhoon,
  // развилки Hunter → Jaguar, Hunter → Harrier и Hunter → Vulcan · Mirage F1★ → Super Étendard → Mirage 2000D → Rafale
  f16: 'e_f5', e_draken: 'e_f5', e_viggen: 'e_draken', e_gripen: 'e_viggen', e_f35: 'f16', e_a10: 'f16', e_f18c: 'e_f4', f18: 'e_f18c', e_ea18g: 'f18',
  e_f111: 'e_f100', e_f15e: 'e_f111', e_f22: 'e_f15e', e_f117: 'e_f111', e_b2: 'e_f117', e_b52: 'e_f111', e_b1b: 'e_b52',
  e_buccaneer: 'e_hunter', e_tornado: 'e_buccaneer', e_typhoon: 'e_tornado', e_jaguar: 'e_hunter', e_harrier: 'e_hunter', e_vulcan: 'e_hunter',
  e_etendard: 'e_mirage_f1', e_mirage: 'e_etendard', e_rafale: 'e_mirage',
  // вооружение
  kab500l: 'fab1000', kab500kr: 'fab500', // ФАБ-500★ → ФАБ-1000 → КАБ-500Л → КАБ-500С → УМПК; развилки ФАБ-500★ → ФАБ-250 → ФАБ-100 / ОФАБ-250 и → КАБ-500Кр
  kab500s: 'kab500l', umpk: 'kab500s', kh58: 'kh28', kh31p: 'kh58', kh29t: 'kh28', kh25ml: 'kh28', kh59m: 'kh29t', kh59mk2: 'kh59m', decoy_e: 'ecm_e',
  fab100: 'fab250', fab250: 'fab500', ofab250: 'fab250', fab1000: 'fab500', gbu24: 'gbu10', gbu57: 'gbu31', kh55: 'kh29t', kh101: 'kh59m',
  bomb1000: 'mk82', gbu10: 'mk82', gbu12: 'mk82', gbu31: 'gbu12', gbu39: 'gbu31', agm88: 'agm45', aargm: 'agm88', agm65b: 'agm45', jassm: 'agm65b', mald: 'ecm_w',
  // ПВО
  s300: 's75', s400: 's300', kub: 's125', buk: 'kub', bukm3: 'buk', zu23: 'zsu234', phalanx: 'm163', osa: 'strela1', tor: 'osa', torm2: 'tor', tunguska: 'zsu234', pantsir: 'tunguska', strela10: 'strela1', igla: 'strela2', iglas: 'igla', verba: 'iglas',
  patriot: 'hawk', pac3: 'patriot', sampt: 'patriot', rapier: 'hawk', nasams: 'rapier', khordad: 'rapier', gepard: 'm163', skyguard: 'm163', roland: 'chaparral', stinger: 'redeye', avenger: 'stinger',
  // вертолёты (Mark 2026-10-20 — по веткам; 2026-10-21 — Ка-50, Ми-8МТВ, UH-60, RAH-66): Восток — Ми-24В★ → Ка-50 (III) → Ка-52 (IV) (Камов) и
  // Ми-24В★ → Ми-8МТВ (II) → Ми-28Н (III) (Миль); Запад — UH-1H★ → UH-60 (II) → RAH-66 (IV), развилки UH-1H★ → AH-1W (Bell) и UH-1H★ → AH-64D.
  // Их оружие: «Штурм»★ → «Атака», Hydra★ → Hellfire
  h_ka50: 'h_mi24', h_ka52: 'h_ka50', h_mi8: 'h_mi24', h_mi28: 'h_mi8', h_uh60: 'h_uh1', h_rah66: 'h_uh60', h_ah1: 'h_uh1', h_ah64: 'h_uh1', ataka: 'shturm', hellfire: 'hydra',
  // удары
  tochka: 'r17', iskander: 'tochka', kinzhal: 'tochka', kh555: 'kh55_s', kalibr: 'kh555', kh101_s: 'kh555', shahed: 'kh55d',
  tomahawk: 'agm86', slam: 'agm86', jsow: 'agm86', jassm_s: 'tomahawk', storm_s: 'slam', storm: 'agm65b', sdb: 'jsow', quail: 'uav_w',
};
// цена (опыт на исследование = серебро на покупку): «крупное» — самолёт, дальний/средний комплекс; остальное — «малое»
export const COST = { big: [600, 2500, 6000, 12000], small: [300, 1000, 2500, 5000] };
// множитель цены ветки (Mark 2026-10-20: каждая ветка до ранга IV — около недели): ПВО и «Волна» почти целиком из «малых» единиц;
// вооружение — ×1 (его качают вместе с самолётами: самолёт с оружием — ≈ 9–10 дней)
export const BRANCH_K = { air: 1, wpn: 1, pvo: 2.6, strike: 5.5, heli: 0.57 }; // heli: 8 → 12 вертолётов (2026-10-21) — множитель 1 → 0,57, чтобы путь до ранга IV остался ≈ 1,6 дня (Mark: «пусть так остаётся»)

// ── дерево ──
const node = (branch, key, side, rank, name, short, tier) => ({ id: branch + ':' + key, branch, key, side, rank, name, short, tier, start: START[branch].includes(key) });
const DUAL = new Set(['jassm', 'storm', 'kh55', 'kh101']); // и оружие самолёта, и заказ «Волны» (Х-55 у Ту-95МС, Х-101 у Ту-160)
function buildTree() {
  const T = [], seen = new Set(), add = (n) => { if (!seen.has(n.id)) { seen.add(n.id); T.push(n); } };
  for (const e of RANKS) for (const L of LOADOUTS[e] || []) {
    const s = L.heli ? HSPECS[L.plane] : SPECS[L.plane]; add(node(L.heli ? 'heli' : 'air', L.plane, L.side, e, s ? s.name : PLANES[L.plane], PLANES[L.plane] || L.plane, 'big'));
    for (const [k] of L.items) { const w = AG[k]; if (w) add(node('wpn', k, w.side, w.era, w.name, w.short, 'small')); }
  }
  for (const k in SAM) { const u = SAM[k]; add(node('pvo', k, u.side, u.era, u.name, u.short, (SAM_COST[k] || 0) >= 200 ? 'big' : 'small')); }
  // удары: JASSM и Storm Shadow — и оружие самолёта, и заказ «Мульти-волны» — у удара свой ключ узла (jassm_s), ключ оружия — item
  for (const s of SIDES) for (const [k, car, e] of MULTI.items[s]) { const w = AG[k] || {}; const n = node('strike', DUAL.has(k) ? k + '_s' : k, s, e, w.name || k, w.short || k, 'small'); n.item = k; n.carrier = car; add(n); }
  for (const n of T) { n.cost = n.start ? 0 : Math.round(COST[n.tier][n.rank - 1] * (BRANCH_K[n.branch] || 1) / 100) * 100; const pk = PARENT[n.key]; n.parent = pk && T.find((q) => q.branch === n.branch && q.key === pk) ? n.branch + ':' + pk : null; }
  return T;
}
export const TREE = buildTree();
export const NODE = Object.fromEntries(TREE.map((n) => [n.id, n]));
export const nodesOf = (branch, side, rank) => TREE.filter((n) => n.branch === branch && (!side || n.side === side) && (!rank || n.rank === rank));
export const pairOf = (n) => NODE[n.branch + ':' + PAIR[n.key]] || null;

// ── состояние игрока: { xp, silver, res: [id…] исследовано, own: [id…] куплено, goal: {branch: id} } ──
export const newProgress = () => ({ xp: 0, silver: 0, res: [], own: [], goal: {} });
const has = (P, id) => NODE[id] && (NODE[id].start || P.own.includes(id));
export const owned = (P, id) => !!has(P, id);
export const researched = (P, id) => !!NODE[id] && (NODE[id].start || P.res.includes(id) || P.own.includes(id));

// паритет: ранг N+1 ветки открыт обеим сторонам, когда у каждой стороны куплено ≥ 2 единиц ранга N сверх стартовых
// (если столько нет — все); внутри ранга одна сторона обгоняет другую не больше чем на GAP купленных
export const NEED = 2, GAP = 2;
function rankNeed(P, branch, side, rank) {
  const extra = nodesOf(branch, side, rank).filter((n) => !n.start);
  const need = Math.min(NEED, extra.length), got = extra.filter((n) => P.own.includes(n.id)).length;
  return { need, got, left: extra.filter((n) => !P.own.includes(n.id)) };
}
export function rankOpen(P, branch, rank) {
  if (rank <= 1) return true;
  if (!rankOpen(P, branch, rank - 1)) return false;
  return SIDES.every((s) => { const r = rankNeed(P, branch, s, rank - 1); return r.got >= r.need; });
}
// что мешает открыть ранг — для строки над колонкой: [{ side, need, got, left: [узлы] }]
export const rankBlock = (P, branch, rank) => (rank <= 1 ? [] : SIDES.map((s) => ({ side: s, ...rankNeed(P, branch, s, rank - 1) })).filter((r) => r.got < r.need));
const boughtIn = (P, branch, side, rank) => nodesOf(branch, side, rank).filter((n) => !n.start && P.own.includes(n.id)).length;

// можно ли исследовать / купить: { ok, why }
export function canResearch(P, id) {
  const n = NODE[id]; if (!n) return { ok: false, why: 'Нет такой единицы' };
  if (researched(P, id)) return { ok: false, why: 'Уже исследовано' };
  if (!rankOpen(P, n.branch, n.rank)) return { ok: false, why: `Ранг ${RANK_NAME[n.rank]} закрыт — нужен паритет в ранге ${RANK_NAME[n.rank - 1]}` };
  if (n.parent && !researched(P, n.parent)) return { ok: false, why: `Сначала исследуйте ${NODE[n.parent].short}` };
  if (P.xp < n.cost) return { ok: false, why: `Не хватает опыта: ${n.cost - P.xp}` };
  return { ok: true };
}
export function canBuy(P, id) {
  const n = NODE[id]; if (!n) return { ok: false, why: 'Нет такой единицы' };
  if (owned(P, id)) return { ok: false, why: 'Уже куплено' };
  if (!researched(P, id)) return { ok: false, why: 'Сначала исследуйте' };
  const other = n.side === 'east' ? 'west' : 'east', mine = boughtIn(P, n.branch, n.side, n.rank), theirs = boughtIn(P, n.branch, other, n.rank);
  const room = nodesOf(n.branch, other, n.rank).filter((q) => !q.start && !P.own.includes(q.id)).length; // у другой стороны нечего купить — не держим
  if (mine + 1 - theirs > GAP && room > 0) { const p = pairOf(n); return { ok: false, why: `Паритет: сначала купите единицу ранга ${RANK_NAME[n.rank]} за ${SIDE_NAME[other]}${p && !owned(P, p.id) && p.rank === n.rank ? ` — например, ${p.short}` : ''}` }; }
  if (P.silver < n.cost) return { ok: false, why: `Не хватает серебра: ${n.cost - P.silver}` };
  return { ok: true };
}
export function research(P, id) { const c = canResearch(P, id); if (!c.ok) return c; P.xp -= NODE[id].cost; P.res.push(id); return { ok: true }; }
export function buy(P, id) { const c = canBuy(P, id); if (!c.ok) return c; P.silver -= NODE[id].cost; P.own.push(id); return { ok: true }; }

// доступность в «Реализме»: подвеска — самолёт и всё её оружие куплены; что не хватает — список узлов
export function loadoutMissing(P, L) {
  const need = [craftId(L), ...L.items.map(([k]) => 'wpn:' + k)];
  return need.filter((id) => NODE[id] && !owned(P, id)).map((id) => NODE[id]);
}
export const craftId = (L) => (L.heli ? 'heli:' : 'air:') + L.plane; // узел машины подвески: самолёт или вертолёт
export const samOk = (P, key) => owned(P, 'pvo:' + key);
export const strikeId = (item) => 'strike:' + (DUAL.has(item) ? item + '_s' : item); // узел удара «Мульти-волны» по ключу оружия
export const strikeOk = (P, item) => owned(P, strikeId(item));
// наибольший открытый ранг ветки (для эпохи комнаты и быстрого поиска)
export const branchRank = (P, branch) => RANKS.filter((r) => rankOpen(P, branch, r)).pop() || 1;

// ── раскладка дерева стороны (как в WTM): колонки — ранги, ряды — линии; первая следующая продолжает ряд, остальные
// (развилка) — новыми рядами ниже. → { cells: [{ n, row, col }], links: [[из, в]], rows } ──
export function treeLayout(branch, side) {
  const ns = TREE.filter((n) => n.branch === branch && n.side === side), kids = (id) => ns.filter((q) => q.parent === id).sort((a, b) => a.rank - b.rank);
  const roots = ns.filter((n) => !n.parent).sort((a, b) => a.rank - b.rank || (b.start - a.start));
  const cells = [], links = []; let row = 0;
  const place = (n, r) => { cells.push({ n, row: r, col: n.rank - 1 }); kids(n.id).forEach((k, i) => { links.push([n.id, k.id]); place(k, i === 0 && k.rank > n.rank ? r : ++row); }); }; // тот же ранг (Су-7Б → Су-17) — строкой ниже
  for (const n of roots) { place(n, row); row++; }
  return { cells, links, rows: row };
}

// ── карточка: главное о единице коротко (в дереве, без перехода в справочник) ──
const kmh = (v) => `${Math.round(v)} км/ч`;
const loadoutsOfPlane = (key) => RANKS.flatMap((e) => (LOADOUTS[e] || []).filter((L) => L.plane === key));
// одной строкой под названием: роль самолёта по его подвескам, у остального — тип наведения / вид оружия
export function unitType(n) {
  if (n.branch === 'heli') return /^h_(uh1|uh60|mi8)$/.test(n.key) ? 'многоцелевой вертолёт' : 'ударный вертолёт';
  if (n.branch === 'air') { const r = new Set(loadoutsOfPlane(n.key).map(loadoutRole)); return r.has('sead') && r.size > 1 ? 'ударный и охотник за ПВО' : r.has('sead') ? 'охотник за ПВО' : 'ударный'; }
  const src = n.branch === 'pvo' ? SAM[n.key] : AG[n.item || n.key]; return (src && (n.branch === 'pvo' ? SAM_TYPE[src.type] : AG_KIND[src.kind])) || '';
}
const km = (m) => { const v = m / 1000; return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toString().replace('.', ',') + ' км'; };
const rng = (a, b) => `${km(a).replace(' км', '')}–${km(b)}`;
// только игровые числа (не справочные): то, с чем единица воюет в игре
export function cardStats(n) {
  if (n.branch === 'air') {
    const s = SPECS[n.key]; if (!s) return [];
    return [['Скорость', kmh(SPEED_K * s.vAlt)], ['У земли', kmh(SPEED_K * s.vSL)], ['Перегрузка', `${s.g} g`], ['Крен', `${s.roll}°/с`],
      ['Форсаж', s.ab ? 'есть' : 'нет'], ['Подвесок', String(loadoutsOfPlane(n.key).length)]];
  }
  if (n.branch === 'heli') {
    const s = HSPECS[n.key]; if (!s) return [];
    return [['Скорость', kmh(SPEED_K * s.vmax)], ['Подъём', `${(SPEED_K * s.vc).toFixed(1).replace('.', ',')} м/с`], ['Потолок', km(s.ceil)], ['Масса', `${(s.m / 1000).toFixed(1).replace('.', ',')} т`],
      ['Винт', s.coax ? 'соосный' : 'с рулевым'], ['Подвесок', String(loadoutsOfPlane(n.key).length)]];
  }
  if (n.branch === 'pvo') {
    const u = SAM[n.key]; if (!u) return []; const o = [];
    if (u.rmax) o.push(['Дальность', rng(u.rmin || 0, u.rmax)]);
    if (u.hmax) o.push(['Высота', rng(u.hmin || 0, u.hmax)]);
    if (u.radar) o.push(['РЛС', km(u.radar.range)]); else if (u.optical) o.push(['Обзор', km(u.optical) + ' (оптика)']);
    if (u.jamR) o.push(['Подавление', km(u.jamR)]);
    if (u.channels > 1) o.push(['Целей сразу', String(u.channels)]);
    if (u.gun) o.push(['Боекомплект', `${u.ammo} снарядов`]); else if (u.ammo) o.push(['Ракет', `${u.ammo}${u.salvo > 1 ? ` · залп ${u.salvo}` : ''}`]);
    if (u.radar && u.radar.acq) o.push(['Захват', `${u.radar.acq} с`]);
    o.push(['Прочность', String(u.hp)]);
    return o;
  }
  const w = AG[n.item || n.key]; if (!w) return []; const o = [];
  if (w.kind === 'tbm') { o.push(['Высота полёта', km(w.H)]); o.push(['Время полёта', `${w.T} с`]); o.push(['Промах', `${w.cep} м`]); }
  else if (w.rmax) o.push(['Дальность', km(w.rmax)]);
  if (w.speed) o.push(['Скорость', kmh(w.speed * 3.6)]);
  if (w.jam) o.push(['Помехи', `${Math.round(w.jam * 100)} %`]);
  if (w.dmg) o.push(['Урон', String(w.dmg)]);
  if (w.blast) o.push(['Радиус', `${w.blast} м`]);
  if (n.branch === 'wpn' && w.mass) o.push(['Масса', `${w.mass} кг`]);
  if (n.branch === 'strike') { if (n.carrier && CARRIERS[n.carrier]) o.push(['Носитель', CARRIERS[n.carrier].name]); if (THREAT[n.item] != null) o.push(['Очки угрозы', String(THREAT[n.item])]); }
  return o;
}

// ── награда за бой ──
// ev: { min — минут в бою, targets: [ценность 0,5…2], sams, samsLong, back, downs, kills (перехваты), waves: [номера],
//   mwObj (очки угрозы разрушенного), mwSam, mwInt (очки угрозы перехваченного), win }
// o: { real, arcade, online, training, firstWin, dayXp — опыт за сегодня (все бои, для дневного предела) }
// Темп (Mark 2026-10-20): линия I→IV вместе с паритетом (≈ 62 500) — около недели. «Реализм» ≈ 4300 опыта в час, «Аркада» — вдвое
// меньше; за день полным темпом — до DAY_FULL, дальше — ×DAY_OVER (неделя — и для того, кто играет весь день)
export const BASE_MIN = 20, BASE_MAX_MIN = 15, REAL_K = 1.5, FIRST_WIN_K = 1.5, ARCADE_K = 0.5;
export const DAY_FULL = 9000, DAY_OVER = 0.3, SOLO_MIN_CAP = 400, SOLO_BATTLE_CAP = 6000;
export const SOLO_DAY = DAY_FULL; // прежнее имя (функции Supabase, клиент)
export function battleReward(ev, o = {}) {
  if (o.training) return { xp: 0, silver: 0, lines: [['Обучение — без наград', 0]] };
  const L = [], add = (t, v) => { v = Math.round(v); if (v > 0) L.push([t, v]); };
  const min = Math.max(0, ev.min || 0);
  add(`Время в бою (${Math.min(BASE_MAX_MIN, Math.round(min))} мин)`, BASE_MIN * Math.min(BASE_MAX_MIN, min));
  add('Цели задания', (ev.targets || []).reduce((s, v) => s + 60 * Math.max(0.5, Math.min(2, v)), 0));
  add('Комплексы ПВО', 80 * (ev.sams || 0) + 120 * (ev.samsLong || 0));
  add('Сбитые самолёты', 25 * (ev.downs || 0)); // оборона давала вдвое больше вылета за то же время — выровнено (было 40 и 60 × волна)
  add('Перехваты', 15 * (ev.kills || 0));
  add('Волны', (ev.waves || []).reduce((s, w) => s + 35 * w, 0));
  add('Удар: разрушено', 10 * (ev.mwObj || 0)); add('Удар: комплексы', 80 * (ev.mwSam || 0)); add('Перехват ударов', 3 * (ev.mwInt || 0));
  if (o.online && ev.win) add('Победа команды', 200);
  let xp = L.reduce((s, [, v]) => s + v, 0);
  if (ev.back) { add('Вернулся живым +20 %', xp * 0.2); xp *= 1.2; }
  const K = []; if (o.real) K.push(['Реализм', REAL_K]); else if (o.arcade) K.push(['Аркада', ARCADE_K]); if (o.firstWin && ev.win) K.push(['Первая победа дня', FIRST_WIN_K]);
  for (const [, k] of K) xp *= k;
  if (!o.online) xp = Math.min(xp, SOLO_BATTLE_CAP, SOLO_MIN_CAP * Math.max(1, min) * (o.real ? REAL_K : 1) * (o.firstWin ? FIRST_WIN_K : 1)); // одиночная: браузеру верим в пределах разумного
  const today = o.dayXp ?? o.soloToday ?? 0, over = Math.max(0, today + xp - DAY_FULL);
  if (over > 0) { const full = xp - Math.min(xp, over); xp = full + Math.min(over, xp) * DAY_OVER; K.push([`После ${DAY_FULL} за день`, DAY_OVER]); }
  xp = Math.round(xp);
  return { xp, silver: xp, lines: L, mult: K };
}
