// Проверка «Заданий» без боевой базы: правила (games/airdef/quests-data.js), сервер (_shared/airdef-progress.ts на поддельной базе), SQL (sql/030 в PGlite).
//   deno run -A tools/airdef-headless/quests-test.js
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
import { DAILY, WEEKLY, ROUTE, ROUTE_MAX, CRATE, CASE, PTS_DAILY, PTS_WEEKLY, pickDaily, pickWeekly, mskDay, dayNo, weekNo, questRoll, questApply, questClaim, questSwap, questView, SWAP, SWAP_PREM, swapLimit, onlineCounters, defenseCounters, weekTotals } from '../../games/airdef/quests-data.js';
import { credit, extraOf, mutate, questsPending, questsRolled, questSwapDo, questTake, toProgress, view } from '../../supabase/functions/_shared/airdef-progress.ts';
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const MON = '2026-11-02', WED = '2026-11-04', THU = '2026-11-05', NEXT = '2026-11-09';

// ── календарь и набор ──
ok(mskDay(Date.parse('2026-11-04T20:59:00Z')) === '2026-11-04' && mskDay(Date.parse('2026-11-04T21:00:00Z')) === '2026-11-05', 'сутки меняются в 00:00 МСК');
ok(weekNo('2026-11-08') === weekNo(MON) && weekNo(NEXT) === weekNo(MON) + 1, 'неделя начинается в понедельник');
let ids = true, gem = true, side = true, known = true;
for (let i = 18000; i < 21000; i++) { const d = pickDaily(i); if (new Set(d).size !== 3) ids = false; if (DAILY[d[0]].g !== 'any' || DAILY[d[1]].g !== 'pvo' || DAILY[d[2]].g !== 'air') side = false; if (!d.every((k) => DAILY[k].c)) known = false;
  const w = pickWeekly(i); if (new Set(w).size !== 5) ids = false; if (w.filter((k) => WEEKLY[k].r.gem).length > 2) gem = false; if (!w.every((k) => WEEKLY[k].c)) known = false; }
ok(ids, 'в наборе нет повторов: 3 в день, 5 в неделю'); ok(side, 'день: любая сторона, ПВО, авиация'); ok(gem, 'с кристаллом не больше двух за неделю'); ok(known, 'у каждого задания есть счётчик');
ok(!Object.values({ ...DAILY, ...WEEKLY }).some((q) => /вертол|аэродром|Победить/i.test(q.t)), 'снятых заданий нет');
ok(DAILY.tbm.of === 1 && WEEKLY.tbm.of === 15 && WEEKLY.tbm.r.gem === 1 && !WEEKLY.tbm.r.xp, 'баллистика: 1 в день; 15 за неделю, 1 кристалл вместо опыта');
ok(ROUTE_MAX === 250 && 21 * PTS_DAILY + 5 * PTS_WEEKLY === 310, 'неделя 310 очков, конец маршрута 250');
const T = weekTotals(); ok(T.gemsMax <= 2 && T.all.silver > 6000 && T.all.silver < 9000, `неделя в среднем: ${Math.round(T.all.silver)} серебра, ${Math.round(T.all.xp)} опыта`);

// ── счётчики подписанного итога ──
const air = onlineCounters({ rt: {}, team: 'air', mode: 'real', k: 2, ev: { min: 8.5, obj: 3, top: 1 } });
ok(onlineCounters({ team: 'air', mode: 'real', k: 2, s: 300, ev: { min: 8.5, obj: 3 } }) === null, 'своя комната (нет rt) не считается');
ok(air.online === 1 && air.play === 1 && air.real === 1 && air.sams === 2 && air.obj === 3 && air.top === 1 && air.downs === 0 && air.kill3 === 0, 'онлайн за авиацию');
const pvo = onlineCounters({ rt: {}, team: 'pvo', mode: 'arcade', k: 3, s: 150, ev: { min: 8 } });
ok(pvo.downs === 3 && pvo.kill3 === 1 && pvo.real === 0 && pvo.sams === 0 && pvo.obj === 0, 'онлайн за ПВО: 3 самолёта за бой');
ok(onlineCounters({ rt: {}, team: 'pvo', k: 2, s: 100, ev: {} }).kill3 === 0, 'два самолёта - не три');
const mm = onlineCounters({ rt: {}, mm: 1, team: 'air', k: 20, ev: { min: 12, icp: 15, icpC: 4, icpD: 3, icpT: 2, samk: 5, bld: 7 } });
ok(mm.downs === 15 && mm.intc === 12 && mm.cm === 7 && mm.tbm === 2 && mm.bld === 7 && mm.mwsam === 5 && mm.sams === 0 && mm.kill3 === 0, '«Мульти-волна»: перехваты по видам, постройки, комплексы');
ok(onlineCounters({ rt: {}, team: 'air', k: 0, s: 0, ev: { min: 8 } }) === null, 'бой без очков и сбитых не считается');
ok(onlineCounters({ rt: {}, team: 'pvo', k: 0, s: 40, ev: { min: 8 } }).play === 1, 'бой с очками считается');
const old = onlineCounters({ rt: {}, team: 'air', k: 1, ev: { min: 8, sams: 1 } }); ok(old.obj === 0 && old.top === 0 && old.sams === 1, 'итог старого игрового сервера не ломает счёт');

// ── «Оборона»: итог присылает браузер ──
{ const W = 6, fast = defenseCounters({ waves: [1, 2, 3, 4, 5, 6], win: true }, 5, 1000, W), slow = defenseCounters({ waves: [1, 2, 3, 4, 5, 6], win: true }, 600, 1000, W), lost = defenseCounters({ waves: [1, 2], win: false }, 600, 1000, W), over = defenseCounters({ waves: Array(12).fill(1), win: true }, 3000, 4000, W);
  ok(fast.waves === 0 && fast.full === 0, 'мгновенный итог с победой не засчитан'); ok(slow.waves === 6 && slow.full === 1, 'бой по времени засчитан'); ok(lost.waves === 2 && lost.full === 0, 'поражение: только отбитые волны'); ok(over.waves === 6, 'волн не больше, чем в бою');
  const base = questRoll({}, WED).q; base.d[1] = { id: 'waves', n: 0, st: '' };
  const a1 = questApply(base, WED, { waves: 1, soloStart: 100, soloEnd: 400 }).q, a2 = questApply(a1, WED, { waves: 1, soloStart: 200, soloEnd: 500 }).q, a3 = questApply(a1, WED, { waves: 1, soloStart: 400, soloEnd: 700 }).q;
  ok(a1.d[1].n === 1 && a2.d[1].n === 1 && a3.d[1].n === 2, 'параллельные бои не считаются, следующий за первым - считается'); }

// ── день: счёт, «Забрать», ящик ──
const done = (L) => L.filter((t) => t.st === 'done').length;
const all = (Q, n = 9999) => { const c = { online: 1 }; for (const P of [DAILY, WEEKLY]) for (const q of Object.values(P)) c[q.c] = n; return c; };
let { q, pay } = questRoll({}, WED); ok(q.day === WED && q.d.length === 3 && q.w.length === 5 && q.pts === 0 && !Object.keys(pay).length, 'новичок: 3 и 5 заданий, ничего не начислено');
const v0 = questView({}, WED); ok(v0.d.length === 3 && v0.pts === 0, 'вид гостя');
const orig = structuredClone(q); questApply(q, WED, { online: 1, play: 1 }); ok(JSON.stringify(q) === JSON.stringify(orig), 'правила не меняют исходное состояние');
let a = questApply(q, WED, { waves: 5, full: 1 });
const soloIds = a.q.d.filter((t) => DAILY[t.id].solo).map((t) => t.id); ok(a.q.d.every((t) => DAILY[t.id].solo ? t.n > 0 : t.n === 0), `«Оборона» засчитывается только в свои задания${soloIds.length ? ': ' + soloIds.join(', ') : ''}`);
a = questApply(q, WED, all()); q = a.q; ok(done(q.d) === 3, 'бой идёт во все подходящие задания');
ok(q.w.filter((t) => t.id === 'days').every((t) => t.n === 1) && q.lastPlay === WED, 'играл сегодня: день засчитан');
{ const again = questApply(q, WED, { online: 1, play: 1 }).q; ok(again.w.filter((t) => t.id === 'days').every((t) => t.n === 1), 'второй бой за день - тот же день'); }
ok(!questClaim(q, WED, 'crate').ok, 'ящик только после всех трёх');
let silver = 0, gems = 0, xp = 0; const P = (p) => { silver += p.silver || 0; xp += p.xp || 0; gems += p.gem || 0; };
for (const t of [...q.d]) { const r = questClaim(q, WED, 'd:' + t.id); ok(r.ok, 'забрать ' + t.id); P(r.pay); q = r.q; const again = questClaim(q, WED, 'd:' + t.id); ok(!again.ok && /уже/.test(again.why), 'второй раз - нельзя'); }
ok(q.pts === 30, 'три ежедневных - 30 очков');
{ const r = questClaim(q, WED, 'crate'); ok(r.ok && r.pay.silver === CRATE.silver, 'ящик за все три'); q = r.q; ok(!questClaim(q, WED, 'crate').ok, 'ящик один раз'); }
ok(!questClaim(q, WED, 'd:нет').ok && !questClaim(q, WED, 'w:нет').ok && !questClaim(q, WED, 'мусор').ok, 'чужой ключ не проходит');

// ── маршрут ──
{ let z = { ...structuredClone(q), pts: 45, paid: 0 }; z.d[0].st = 'done'; const r = questClaim(z, WED, 'd:' + z.d[0].id); ok(r.ok && r.q.pts === 55 && r.q.paid === 1 && r.pay.silver === DAILY[z.d[0].id].r.silver + ROUTE[1].r.silver, 'долетел до точки 50 - её награда пришла сама'); const r2 = questClaim({ ...r.q, d: r.q.d.map((t) => ({ ...t, st: 'done' })) }, WED, 'd:' + r.q.d[1].id); ok(r2.q.paid === 1, 'точка оплачивается один раз'); }
{ let z = { ...structuredClone(q), pts: 245, paid: 4 }; z.w[0].n = WEEKLY[z.w[0].id].of; z.w[0].st = 'done'; const r = questClaim(z, WED, 'w:' + z.w[0].id); ok(r.q.pts === 265 && r.q.paid === 5 && (r.pay.gem || 0) >= ROUTE[5].r.gem, 'конец маршрута на 250'); const r3 = questApply(r.q, WED, { online: 1 }); ok(r3.q.paid === 5 && !Object.keys(r3.pay).length, 'дальше 250 ничего не добавляется'); }

// ── задание снято из пула ──
{ const z = questRoll({}, WED).q; z.d = [{ id: 'снято', n: 0, st: '' }, ...z.d.slice(0, 2).map((t) => ({ ...t, st: 'taken' }))]; ok(questClaim(z, WED, 'crate').ok, 'снятое задание не мешает ящику'); ok(questView(z, WED).d.length === 2, 'и не показывается'); }

// ── новый день и неделя ──
{ const a0 = questApply(questRoll({}, WED).q, WED, all()).q, roll = questRoll(a0, THU); const sum = a0.d.reduce((s, t) => s + (DAILY[t.id].r.silver || 0), 0);
  ok(roll.q.day === THU && roll.pay.silver === sum + CRATE.silver && roll.q.pts === 30 && roll.q.d.every((t) => !t.st), 'новый день: не забранное начислено само, с ящиком и очками');
  const un = questRoll(questRoll({}, WED).q, THU); ok(!Object.keys(un.pay).length && un.q.pts === 0, 'новый день: невыполненное сгорает без начислений');
  const wk = questRoll(a0, NEXT); ok(wk.q.pts === 0 && wk.q.paid === 0 && wk.q.chest === 0 && wk.pay.silver > 0 && wk.q.w.every((t) => !t.st), 'новая неделя: начислено, очки и маршрут с нуля');
  const st = questRoll(questRoll({}, WED).q, WED); ok(!Object.keys(st.pay).length && st.q.day === WED, 'тот же день - ничего не меняется'); }

// ── замена задания (Mark 2026-11-18: 1 ежедневное в день и 1 еженедельное в неделю, с премиумом по 2) ──
{ const gem = (L) => L.filter((t) => WEEKLY[t.id] && WEEKLY[t.id].r.gem).length;
  ok(swapLimit('d', false) === 1 && swapLimit('w', false) === 1 && swapLimit('d', true) === 2 && swapLimit('w', true) === 2 && SWAP.d === 1 && SWAP_PREM.w === 1, 'лимиты замен: 1 и 1, с премиумом 2 и 2');
  const q0 = questRoll({}, WED).q, id0 = q0.d[0].id, snap = JSON.stringify(q0);
  const r = questSwap(q0, WED, 'd:' + id0, false, 0.3);
  ok(r.ok && r.from === id0 && r.to !== id0 && DAILY[r.to].g === DAILY[id0].g && r.q.d[0].id === r.to && r.q.d[0].n === 0 && r.q.d[0].st === '' && new Set(r.q.d.map((t) => t.id)).size === 3, 'замена ежедневного: тот же g, на месте, без прогресса, без повторов');
  ok(JSON.stringify(q0) === snap, 'замена не меняет исходное состояние');
  ok(r.q.sd === 1 && r.q.dx.includes(id0) && !r.q.sw, 'счётчик и список «уже заменено»');
  const r2 = questSwap(r.q, WED, 'd:' + r.q.d[1].id, false, 0.3); ok(!r2.ok && /сегодня закончились/.test(r2.why), 'вторая замена в тот же день - отказ');
  const r3 = questSwap(r.q, THU, 'd:' + questRoll(r.q, THU).q.d[0].id, false, 0.3); ok(r3.ok && r3.q.sd === 1 && r3.q.dx.length === 1, 'на следующий день снова можно, список «заменено» начат заново');
  ok(!questSwap(q0, WED, 'd:нет', false, 0.3).ok && !questSwap(q0, WED, 'x:' + id0, false, 0.3).ok && !questSwap(q0, WED, 'мусор', false, 0.3).ok && !questSwap(q0, WED, 'w:нет', false, 0.3).ok && !questSwap(q0, WED, 'crate', false, 0.3).ok, 'чужой ключ не проходит');
  for (const st of ['done', 'taken']) { const z = structuredClone(q0); z.d[0].st = st; const rz = questSwap(z, WED, 'd:' + id0, true, 0.3); ok(!rz.ok && /Выполненное/.test(rz.why) && rz.why !== undefined, `задание «${st}» заменить нельзя`); }
  // с премиумом - две; третья отказ; заменённое не возвращается
  let back = 0, same = 0, bad2 = 0, tot = 0;
  for (let day = 20000; day < 20400; day++) for (const [a, b] of [[0, 0.99], [0.5, 0.2], [0.99, 0]]) {
    const dd = new Date(day * 864e5).toISOString().slice(0, 10), z = questRoll({}, dd).q, A = z.d[0].id, one = questSwap(z, dd, 'd:' + A, true, a); tot++;
    if (!one.ok) { bad2++; continue; } const B = one.to, two = questSwap(one.q, dd, 'd:' + B, true, b);
    if (!two.ok) { bad2++; continue; } if (two.to === A || two.to === B) back++; if (DAILY[two.to].g !== DAILY[A].g || new Set(two.q.d.map((t) => t.id)).size !== 3) same++;
    if (questSwap(two.q, dd, 'd:' + two.q.d[1].id, true, 0.1).ok) bad2++; }
  ok(bad2 === 0 && tot === 1200, `премиум: две замены в день, третья - отказ (${tot} проверок)`); ok(back === 0, 'заменённое задание не возвращается в тот же день'); ok(same === 0, 'замена остаётся в своей группе, повторов в списке нет');
  { const z = structuredClone(q0); z.dx = DAILY[id0].g === 'any' ? Object.keys(DAILY).filter((k) => DAILY[k].g === 'any' && k !== id0) : Object.keys(DAILY).filter((k) => DAILY[k].g === DAILY[id0].g && k !== id0);
    const rf = questSwap(z, WED, 'd:' + id0, false, 0.5); ok(rf.ok && DAILY[rf.to].g !== DAILY[id0].g && !z.dx.includes(rf.to) && !z.d.some((t) => t.id === rf.to), 'в группе пусто - берётся любая другая, без заменённых и без стоящих в списке');
    z.dx = Object.keys(DAILY).filter((k) => k !== id0); const rn = questSwap(z, WED, 'd:' + id0, false, 0.5); ok(!rn.ok && /не на что/.test(rn.why), 'совсем нечем заменить - «Заменить не на что»'); }
  // еженедельные: не больше двух с кристаллом, любая замена остаётся в рамках
  let gemOk = 0, gemN = 0, wkBad = 0;
  for (let w = 2800; w < 3000; w++) { const day = new Date((w * 7 - 3) * 864e5 + 864e5).toISOString().slice(0, 10), z = questRoll({}, day).q;
    for (let i = 0; i < 5; i++) for (const rr of [0, 0.4, 0.99]) { const rs = questSwap(z, day, 'w:' + z.w[i].id, false, rr); if (!rs.ok) { wkBad++; continue; } gemN++; if (gem(rs.q.w) <= 2 && new Set(rs.q.w.map((t) => t.id)).size === 5 && rs.q.sw === 1) gemOk++; } }
  ok(wkBad === 0 && gemN === 3000 && gemOk === gemN, `еженедельные: после замены не больше двух с кристаллом, без повторов (${gemN} проверок)`);
  { const z = questRoll({}, WED).q, rw = questSwap(z, WED, 'w:' + z.w[0].id, false, 0.2); ok(rw.ok && rw.q.sw === 1 && !rw.q.sd, 'еженедельная замена не трогает дневной счётчик');
    ok(!questSwap(rw.q, WED, 'w:' + rw.q.w[1].id, false, 0.2).ok && /на этой неделе закончились/.test(questSwap(rw.q, WED, 'w:' + rw.q.w[1].id, false, 0.2).why), 'вторая еженедельная - отказ');
    ok(!questSwap(rw.q, THU, 'w:' + questRoll(rw.q, THU).q.w[1].id, false, 0.2).ok, 'на следующий день недели счётчик не сбрасывается');
    const nx = questRoll(rw.q, NEXT).q; ok(nx.sw === 0 && nx.wx.length === 0 && questSwap(nx, NEXT, 'w:' + nx.w[1].id, false, 0.2).ok, 'новая неделя: счётчик и список заменённого с нуля');
    ok(questSwap(rw.q, WED, 'w:' + rw.q.w[1].id, true, 0.2).ok, 'премиум: вторая еженедельная проходит'); }
  // старое состояние (до замен) без sd / sw / dx / wx
  { const o = structuredClone(q0); delete o.sd; delete o.sw; delete o.dx; delete o.wx; const vo = questView(o, WED), ro = questSwap(o, WED, 'd:' + id0, false, 0.7);
    ok(vo.swap.d === 1 && vo.swap.w === 1 && ro.ok && ro.q.sd === 1, 'старое состояние без sd / sw / dx / wx работает');
    ok(questView(r.q, WED).swap.d === 0 && questView(r.q, WED).swap.w === 1 && questView(r.q, WED, true).swap.d === 1, 'вид: сколько замен осталось (с премиумом - на 1 больше)');
    ok(questView({}, WED).swap.d === 1 && questApply(r.q, WED, { online: 1, play: 1 }).q.sd === 1, 'новичок: замены есть; счёт боя счётчик не трогает'); }
  // сервер: сохранение через questSwapDo; начисление за прошедший день не теряется
  { const Pr = toProgress({ xp: 10, silver: 20 }), x = { ...extraOf(null), quests: structuredClone(q0) }, sw = questSwapDo(Pr, x, 'd:' + id0, WED, 0.3);
    ok(sw.ok && sw.to !== id0 && sw.extra.quests.d[0].id === sw.to && sw.extra.crystals === 0 && Pr.xp === 10 && Pr.silver === 20, 'сервер: замена сохраняется, опыт и серебро не двигаются');
    ok(!questSwapDo(Pr, x, 12, WED, 0.3).ok && !questSwapDo(Pr, x, 'x'.repeat(40), WED, 0.3).ok && !questSwapDo(Pr, sw.extra, 'd:' + sw.extra.quests.d[1].id, WED, 0.3).ok, 'сервер: мусор вместо ключа и вторая замена - отказ');
    ok(view(Pr, sw.extra, WED).quests.swap.d === 0 && view(Pr, sw.extra, WED, true).quests.swap.d === 1, 'сервер: в состоянии для клиента - сколько замен осталось');
    const yd = structuredClone(q0); yd.d = yd.d.map((t) => ({ ...t, st: 'done', n: DAILY[t.id].of })); const P5 = toProgress({ xp: 0, silver: 0 }), s5 = questSwapDo(P5, { ...extraOf(null), quests: yd }, 'w:' + yd.w[0].id, THU, 0.3);
    ok(s5.ok && P5.silver > 0 && s5.extra.quests.day === THU, 'сервер: замена в первое обращение за сутки начисляет вчерашнее, а не теряет'); }
}

// ── сервер на поддельном прогрессе ──
{ const Pr = toProgress(null), x = extraOf(null), ev = { min: 10, targets: [1], sams: 1, win: true }; const c = onlineCounters({ rt: {}, team: 'air', mode: 'arcade', k: 1, ev: { min: 10, obj: 1 } });
  const r = credit(Pr, x, ev, { real: false, online: true, today: WED, quest: c }); const q1 = r.extra.quests;
  ok(q1.day === WED && r.extra.solo_day === WED && r.extra.solo_xp === 0 && r.reward.xp > 0, 'онлайн-бой сохраняет задания, но не тратит дневной предел (онлайн без предела, Mark 2026-11-19)');
  const rs = credit(toProgress(null), extraOf(null), ev, { real: false, online: false, today: WED }); ok(rs.extra.solo_xp === rs.reward.xp, 'одиночный бой тратит дневной предел');
  const big = credit(toProgress(null), { ...extraOf(null), solo_day: WED, solo_xp: 50000 }, ev, { real: false, online: true, today: WED }); ok(!big.reward.mult.some(([t]) => /за день/.test(t)), 'онлайн после 50 000 опыта за день - без понижения');
  const xpT = q1.d.find((t) => t.id === 'xp') || q1.w.find((t) => t.id === 'xp'); ok(!xpT || xpT.n === Math.min(r.reward.xp, xpT.n), 'опыт боя идёт в задание на опыт');
  const r2 = credit(toProgress(null), extraOf(null), ev, { real: false, online: false, today: WED, used: [] }); ok(!r2.extra.quests.day, 'одиночный бой без счётчиков заданий не трогает');
  const vw = view(Pr, r.extra, WED); ok(vw.quests.d.length === 3 && vw.quests.w.length === 5, 'состояние для клиента');
  const x2 = { ...extraOf(null), quests: { ...q1, d: q1.d.map((t) => ({ ...t, st: 'done', n: DAILY[t.id].of })) } }; const P2 = toProgress({ xp: 10, silver: 20 }), t0 = questTake(P2, x2, 'd:' + q1.d[0].id, WED), def = DAILY[q1.d[0].id];
  ok(t0.ok && P2.silver === 20 + (def.r.silver || 0) && P2.xp === 10 + (def.r.xp || 0), '«Забрать» начисляет опыт и серебро');
  ok(!questTake(P2, x2, 12, WED).ok && !questTake(P2, x2, 'x'.repeat(40), WED).ok, 'мусор вместо ключа - отказ');
  ok(questsPending(x2, THU) && !questsPending(extraOf(null), WED), 'есть что начислить за прошлый день - только если выполнено');
  const P3 = toProgress({ xp: 0, silver: 0 }), ro = questsRolled(P3, x2, THU); ok(ro.ok && P3.silver > 0 && ro.extra.quests.day === THU && ro.extra.crystals === 0, 'первое обращение за день начисляет незабранное');
  const xg = { ...extraOf(null), quests: { ...q1, w: [{ id: 'tbm', n: 15, st: 'done' }] } }, P4 = toProgress({ xp: 0, silver: 0 }), t4 = questTake(P4, xg, 'w:tbm', WED); ok(t4.ok && t4.extra.crystals === 1 && P4.silver === 400 && P4.xp === 0, 'кристалл уходит в сохранение'); }

// ── SQL ──
const SQL = new URL('../../sql/', import.meta.url).pathname, db = new PGlite();
await db.exec(`create role service_role; create role anon; create role authenticated;
  create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null, full_name text, created_at timestamptz not null default now(), last_seen timestamptz not null default now());`);
for (const f of ['020_airdef_online.sql', '021_airdef_progress.sql', '022_airdef_accounts_rating.sql', '024_airdef_season_rewards.sql', '028_airdef_shop.sql', '030_airdef_quests.sql', '030_airdef_quests.sql']) await db.exec(Deno.readTextFileSync(SQL + f));
ok(true, 'миграции применились, 030 - и повторно');
const pl = (await db.query(`insert into players (login, password_hash, kind) values ('q', 'x', 'airdef') returning id`)).rows[0].id;
const save = async (ver, cr, qq = { day: WED }) => (await db.query('select airdef_progress_save_q($1, $2, 10, 20, $3, $4, $5, null, null, 0, $6, $7) v', [pl, ver, [], [], '{}', JSON.stringify(qq), cr])).rows[0].v;
const wallet = async () => (await db.query('select airdef_wallet_view($1) w', [pl])).rows[0].w.crystals;
ok(await save(0, 2) === 1 && await wallet() === 2, 'первая запись: строка и кристаллы');
ok(await save(0, 2) === -1 && await wallet() === 2, 'гонка при создании: второй раз не начисляет');
ok(await save(1, 3) === 2 && await wallet() === 5, 'новая версия начисляет');
ok(await save(1, 3) === -1 && await wallet() === 5, 'устаревшая версия ничего не пишет и не начисляет');
ok((await db.query('select quests from airdef_progress where player_id = $1', [pl])).rows[0].quests.day === WED, 'состояние заданий записано');
{ const site = (await db.query(`insert into players (login, password_hash, kind) values ('s', 'x', 'site') returning id`)).rows[0].id, game = (await db.query(`insert into players (login, password_hash, kind) values ('ad:g', 'x', 'airdef') returning id`)).rows[0].id;
  await db.query(`insert into airdef_accounts (player_id, nick) values ($1, 'g')`, [game]);
  await db.query('select airdef_progress_save_q($1, 0, 5, 6, $2, $3, $4, null, null, 0, $5, 7)', [site, [], [], '{}', JSON.stringify({ day: WED })]);
  await db.query(`insert into airdef_wallet (player_id, crystals, camos, picks) values ($1, 1, '{x:y}', 1)`, [game]);
  await db.query('select airdef_transfer($1, $2)', [site, game]);
  const w = (await db.query('select airdef_wallet_view($1) w', [game])).rows[0].w, g = (await db.query('select quests from airdef_progress where player_id = $1', [game])).rows[0], left = (await db.query('select count(*)::int c from airdef_wallet where player_id = $1', [site])).rows[0].c;
  ok(w.crystals === 8 && w.picks === 1 && w.camos.includes('x:y') && left === 0, 'перенос аккаунта: кристаллы сложены, кошелёк сайта пуст'); ok(g && g.quests.day === WED, 'перенос аккаунта: задания переехали'); }
let threw = false; try { await save(2, -1); } catch (_) { threw = true; } ok(threw && await wallet() === 5, 'отрицательные кристаллы - отказ');
await db.close();
console.log(bad ? `\nошибок: ${bad}` : '\nошибок нет'); Deno.exit(bad ? 1 : 0);
