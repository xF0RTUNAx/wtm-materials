// Проверка «Заданий» без боевой базы: правила (games/airdef/quests-data.js), сервер (_shared/airdef-progress.ts на поддельной базе), SQL (sql/030 в PGlite).
//   deno run -A tools/airdef-headless/quests-test.js
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
import { DAILY, WEEKLY, ROUTE, ROUTE_MAX, CRATE, CASE, PTS_DAILY, PTS_WEEKLY, pickDaily, pickWeekly, mskDay, dayNo, weekNo, questRoll, questApply, questClaim, questView, onlineCounters, defenseCounters, weekTotals } from '../../games/airdef/quests-data.js';
import { credit, extraOf, mutate, questsPending, questsRolled, questTake, toProgress, view } from '../../supabase/functions/_shared/airdef-progress.ts';
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
ok(onlineCounters({ rt: {}, team: 'pvo', k: 2, s: 100, ev: {} }).kill3 === 0, 'два самолёта — не три');
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
  ok(a1.d[1].n === 1 && a2.d[1].n === 1 && a3.d[1].n === 2, 'параллельные бои не считаются, следующий за первым — считается'); }

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
{ const again = questApply(q, WED, { online: 1, play: 1 }).q; ok(again.w.filter((t) => t.id === 'days').every((t) => t.n === 1), 'второй бой за день — тот же день'); }
ok(!questClaim(q, WED, 'crate').ok, 'ящик только после всех трёх');
let silver = 0, gems = 0, xp = 0; const P = (p) => { silver += p.silver || 0; xp += p.xp || 0; gems += p.gem || 0; };
for (const t of [...q.d]) { const r = questClaim(q, WED, 'd:' + t.id); ok(r.ok, 'забрать ' + t.id); P(r.pay); q = r.q; const again = questClaim(q, WED, 'd:' + t.id); ok(!again.ok && /уже/.test(again.why), 'второй раз — нельзя'); }
ok(q.pts === 30, 'три ежедневных — 30 очков');
{ const r = questClaim(q, WED, 'crate'); ok(r.ok && r.pay.silver === CRATE.silver, 'ящик за все три'); q = r.q; ok(!questClaim(q, WED, 'crate').ok, 'ящик один раз'); }
ok(!questClaim(q, WED, 'd:нет').ok && !questClaim(q, WED, 'w:нет').ok && !questClaim(q, WED, 'мусор').ok, 'чужой ключ не проходит');

// ── маршрут ──
{ let z = { ...structuredClone(q), pts: 45, paid: 0 }; z.d[0].st = 'done'; const r = questClaim(z, WED, 'd:' + z.d[0].id); ok(r.ok && r.q.pts === 55 && r.q.paid === 1 && r.pay.silver === DAILY[z.d[0].id].r.silver + ROUTE[1].r.silver, 'долетел до точки 50 — её награда пришла сама'); const r2 = questClaim({ ...r.q, d: r.q.d.map((t) => ({ ...t, st: 'done' })) }, WED, 'd:' + r.q.d[1].id); ok(r2.q.paid === 1, 'точка оплачивается один раз'); }
{ let z = { ...structuredClone(q), pts: 245, paid: 4 }; z.w[0].n = WEEKLY[z.w[0].id].of; z.w[0].st = 'done'; const r = questClaim(z, WED, 'w:' + z.w[0].id); ok(r.q.pts === 265 && r.q.paid === 5 && (r.pay.gem || 0) >= ROUTE[5].r.gem, 'конец маршрута на 250'); const r3 = questApply(r.q, WED, { online: 1 }); ok(r3.q.paid === 5 && !Object.keys(r3.pay).length, 'дальше 250 ничего не добавляется'); }

// ── задание снято из пула ──
{ const z = questRoll({}, WED).q; z.d = [{ id: 'снято', n: 0, st: '' }, ...z.d.slice(0, 2).map((t) => ({ ...t, st: 'taken' }))]; ok(questClaim(z, WED, 'crate').ok, 'снятое задание не мешает ящику'); ok(questView(z, WED).d.length === 2, 'и не показывается'); }

// ── новый день и неделя ──
{ const a0 = questApply(questRoll({}, WED).q, WED, all()).q, roll = questRoll(a0, THU); const sum = a0.d.reduce((s, t) => s + (DAILY[t.id].r.silver || 0), 0);
  ok(roll.q.day === THU && roll.pay.silver === sum + CRATE.silver && roll.q.pts === 30 && roll.q.d.every((t) => !t.st), 'новый день: не забранное начислено само, с ящиком и очками');
  const un = questRoll(questRoll({}, WED).q, THU); ok(!Object.keys(un.pay).length && un.q.pts === 0, 'новый день: невыполненное сгорает без начислений');
  const wk = questRoll(a0, NEXT); ok(wk.q.pts === 0 && wk.q.paid === 0 && wk.q.chest === 0 && wk.pay.silver > 0 && wk.q.w.every((t) => !t.st), 'новая неделя: начислено, очки и маршрут с нуля');
  const st = questRoll(questRoll({}, WED).q, WED); ok(!Object.keys(st.pay).length && st.q.day === WED, 'тот же день — ничего не меняется'); }

// ── сервер на поддельном прогрессе ──
{ const Pr = toProgress(null), x = extraOf(null), ev = { min: 10, targets: [1], sams: 1, win: true }; const c = onlineCounters({ rt: {}, team: 'air', mode: 'arcade', k: 1, ev: { min: 10, obj: 1 } });
  const r = credit(Pr, x, ev, { real: false, online: true, today: WED, quest: c }); const q1 = r.extra.quests;
  ok(q1.day === WED && r.extra.solo_day === WED && r.extra.solo_xp === r.reward.xp, 'бой сохраняет и дневной опыт, и задания');
  const xpT = q1.d.find((t) => t.id === 'xp') || q1.w.find((t) => t.id === 'xp'); ok(!xpT || xpT.n === Math.min(r.reward.xp, xpT.n), 'опыт боя идёт в задание на опыт');
  const r2 = credit(toProgress(null), extraOf(null), ev, { real: false, online: false, today: WED, used: [] }); ok(!r2.extra.quests.day, 'одиночный бой без счётчиков заданий не трогает');
  const vw = view(Pr, r.extra, WED); ok(vw.quests.d.length === 3 && vw.quests.w.length === 5, 'состояние для клиента');
  const x2 = { ...extraOf(null), quests: { ...q1, d: q1.d.map((t) => ({ ...t, st: 'done', n: DAILY[t.id].of })) } }; const P2 = toProgress({ xp: 10, silver: 20 }), t0 = questTake(P2, x2, 'd:' + q1.d[0].id, WED), def = DAILY[q1.d[0].id];
  ok(t0.ok && P2.silver === 20 + (def.r.silver || 0) && P2.xp === 10 + (def.r.xp || 0), '«Забрать» начисляет опыт и серебро');
  ok(!questTake(P2, x2, 12, WED).ok && !questTake(P2, x2, 'x'.repeat(40), WED).ok, 'мусор вместо ключа — отказ');
  ok(questsPending(x2, THU) && !questsPending(extraOf(null), WED), 'есть что начислить за прошлый день — только если выполнено');
  const P3 = toProgress({ xp: 0, silver: 0 }), ro = questsRolled(P3, x2, THU); ok(ro.ok && P3.silver > 0 && ro.extra.quests.day === THU && ro.extra.crystals === 0, 'первое обращение за день начисляет незабранное');
  const xg = { ...extraOf(null), quests: { ...q1, w: [{ id: 'tbm', n: 15, st: 'done' }] } }, P4 = toProgress({ xp: 0, silver: 0 }), t4 = questTake(P4, xg, 'w:tbm', WED); ok(t4.ok && t4.extra.crystals === 1 && P4.silver === 400 && P4.xp === 0, 'кристалл уходит в сохранение'); }

// ── SQL ──
const SQL = new URL('../../sql/', import.meta.url).pathname, db = new PGlite();
await db.exec(`create role service_role; create role anon; create role authenticated;
  create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null, full_name text, created_at timestamptz not null default now(), last_seen timestamptz not null default now());`);
for (const f of ['020_airdef_online.sql', '021_airdef_progress.sql', '022_airdef_accounts_rating.sql', '024_airdef_season_rewards.sql', '028_airdef_shop.sql', '030_airdef_quests.sql', '030_airdef_quests.sql']) await db.exec(Deno.readTextFileSync(SQL + f));
ok(true, 'миграции применились, 030 — и повторно');
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
let threw = false; try { await save(2, -1); } catch (_) { threw = true; } ok(threw && await wallet() === 5, 'отрицательные кристаллы — отказ');
await db.close();
console.log(bad ? `\nошибок: ${bad}` : '\nошибок нет'); Deno.exit(bad ? 1 : 0);
