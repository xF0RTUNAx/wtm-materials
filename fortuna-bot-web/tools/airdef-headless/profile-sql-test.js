// Проверка sql/029_airdef_profile.sql (профиль игрока, Mark 2026-10-28) без боевой базы: Postgres в WebAssembly (PGlite), поверх — players
// (как 001) и миграции игры 020–027. Поиск по нику (регистр, пробелы по краям; аккаунт сайта и неизвестный ник — null), статистика по
// режимам за сезон (по времени боя, с боями своих комнат) и за всё время, любимые самолёт и ЗРК из result.u (чужие ключи и числа — мимо),
// лучшие бои сезона (как засчитано в 025, без разбора), места за сезоны, место и очки как в таблице, ни id игрока, ни номеров боёв в ответе,
// права (только service_role).
//   deno run -A tools/airdef-headless/profile-sql-test.js
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
const SQL = new URL('../../sql/', import.meta.url).pathname;
const db = new PGlite();
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const one = async (q, p = []) => (await db.query(q, p)).rows[0];
const eq = (a, b) => JSON.stringify(a, Object.keys(a || {}).sort()) === JSON.stringify(b, Object.keys(b || {}).sort()); // jsonb сортирует ключи по-своему

await db.exec(`create role service_role; create role anon; create role authenticated;
  create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null, full_name text,
    created_at timestamptz not null default now(), last_seen timestamptz not null default now());`);
for (const f of ['020_airdef_online.sql', '021_airdef_progress.sql', '022_airdef_accounts_rating.sql', '024_airdef_season_rewards.sql', '025_airdef_rating_slots.sql',
  '026_airdef_season1_longer.sql', '027_airdef_offseason.sql', '029_airdef_profile.sql']) await db.exec(Deno.readTextFileSync(SQL + f));
await db.exec(Deno.readTextFileSync(SQL + '029_airdef_profile.sql')); // повторно — без ошибок
ok(true, 'миграции 020–027 и 029 (и 029 повторно) применились');

const mk = async (login, kind, nick) => { const p = await one(`insert into players (login, password_hash, kind) values ($1, 'x', $2) returning id`, [login, kind]); if (nick) await db.query(`insert into airdef_accounts (player_id, nick, created_at) values ($1, $2, '2026-10-25 12:00:00+03')`, [p.id, nick]); return p.id; };
const A = await mk('ad:grom', 'airdef', 'Гром_52'), B = await mk('ad:sky', 'airdef', 'SkyKeeper'), C = await mk('ad:new', 'airdef', 'Новичок'), W = await mk('webuser', 'site', 'Сайт');
// бой: kind — air / pvo / multi; at — время; rating — очки рейтинга (null — своя комната); u — что летал и ставил; rp — разбор
let m = 0; const MID = [];
const fight = async (pid, { kind = 'air', at = '2026-10-26 20:00:00+03', win = true, kills = 1, rating = null, u = null, rp = {}, mode = 'real' } = {}) => {
  const id = 'R' + (++m) + '-' + Date.now(); MID.push(id);
  const result = { g: 'airdef', ...(kind === 'multi' ? { mm: 1 } : {}), ...(u !== null ? { u } : {}) };
  await db.query(`insert into airdef_mp_results (match_id, player_id, mode, team, win, kills, score, rating, season, rp, result, claimed_at) values ($1, $2, $3, $4, $5, $6, 100, $7, $8, $9, $10, $11)`,
    [id, pid, mode, kind === 'pvo' ? 'pvo' : 'air', win, kills, rating, rating === null ? null : 1, JSON.stringify(rp), JSON.stringify(result), at]);
};
// Гром_52: сезон 1 (с 25.10) — 3 вылета (2 победы), 2 обороны, 1 «Мульти-волна»; ещё бой своей комнаты (без очков); до сезона — 2 вылета
await fight(A, { kind: 'air', rating: 900, kills: 3, u: { fl: { su30: 3 } }, rp: { r: 400, k: 1.08 } });
await fight(A, { kind: 'air', rating: 700, kills: 2, win: false, u: { fl: { su30: 1, f16: 2 } }, rp: { r: 0, k: 1.05 }, at: '2026-10-27 21:00:00+03' });
await fight(A, { kind: 'air', rating: null, kills: 4, u: { fl: { f16: 1 } }, at: '2026-10-27 22:00:00+03' }); // своя комната
await fight(A, { kind: 'pvo', rating: 850, kills: 6, u: { sm: ['s300', 'tor'] }, rp: { r: 400, k: 1.02 }, at: '2026-10-28 19:00:00+03' });
await fight(A, { kind: 'pvo', rating: 500, kills: 2, win: false, u: { sm: ['s300'] }, rp: { r: 0, k: 1 }, at: '2026-10-28 20:00:00+03' });
await fight(A, { kind: 'multi', rating: 660, kills: 9, win: false, u: { sm: ['tor', 'tor', 'pantsir'] }, rp: { r: 200, k: 1 }, at: '2026-10-28 21:00:00+03' }); // ничья
await fight(A, { kind: 'air', rating: null, kills: 1, at: '2026-10-20 20:00:00+03', u: { fl: { mig29: 9 } } }); // до сезона (онлайн без рейтинга)
await fight(A, { kind: 'pvo', rating: null, kills: 0, win: false, at: '2026-10-21 20:00:00+03', u: { sm: ['buk'], fl: 'мусор' } });
// испорченное u: чужие ключи, строки вместо чисел, не тот тип — не считаются
await fight(A, { kind: 'air', rating: 100, kills: 0, win: false, at: '2026-10-26 10:00:00+03', u: { fl: { 'Su30; drop table': 50, su27: 'x', e_su27: -3 }, sm: 'tor' } });
// SkyKeeper: больше очков в сезоне — первое место (Гром_52 — второе)
await fight(B, { kind: 'air', rating: 990 }); await fight(B, { kind: 'pvo', rating: 980 }); await fight(B, { kind: 'multi', rating: 970 }); await fight(B, { kind: 'air', rating: 960 });
// награды прошлых сезонов (как будто рассчитаны sql/024)
await db.query(`insert into airdef_season_paid (season, player_id, place, points, n) values (1, $1, 3, 4000, 7), (2, $1, 1, 5000, 7)`, [A]);

const P = async (nick, season = 1) => (await one('select airdef_profile($1, $2) p', [nick, season])).p;
const p = await P('Гром_52');
ok(!!p && p.nick === 'Гром_52', 'профиль по нику');
ok(JSON.stringify(await P('  гром_52 ')) === JSON.stringify(p), 'ник — без учёта регистра и пробелов по краям');
ok(await P('Нет такого') === null && await P('') === null && await P('x'.repeat(40)) === null, 'неизвестный, пустой и слишком длинный ник — null');
ok(await P('Сайт') === null, 'аккаунт сайта (даже со строкой в airdef_accounts) — не профиль');
ok(+new Date(p.since) === +new Date('2026-10-25T12:00:00+03:00') && p.games === 9, `в игре с 25.10, онлайн-боёв за всё время 9 (${p.games})`);

// место и очки — как в таблице сезона (025: по 2 лучших в обороне, вылете, «Мульти-волне» + 1 любой)
const board = (await db.query('select player_id, place, points, n from airdef_rating_board(1)')).rows.find((r) => r.player_id === A);
ok(p.place === Number(board.place) && p.points === Number(board.points) && p.n === board.n && p.place === 2, `место ${p.place}, очки ${p.points}, засчитано ${p.n} — как в таблице`);
ok(p.points === 900 + 700 + 850 + 500 + 660 + 100, 'очки: все 6 боёв сезона с рейтингом засчитаны (2 + 2 + 1 + 1 любой)');

// по режимам: сезон — по времени боя (своя комната — тоже), всё время — все бои
const S = p.modes.season, L = p.modes.all;
ok(S.air.n === 4 && S.air.w === 2 && S.air.k === 9 && S.air.best === 900, `сезон, вылет: 4 боя, 2 победы, поражено 9, лучший 900 (${JSON.stringify(S.air)})`);
ok(S.pvo.n === 2 && S.pvo.w === 1 && S.pvo.k === 8 && S.pvo.best === 850, `сезон, оборона (${JSON.stringify(S.pvo)})`);
ok(S.multi.n === 1 && S.multi.w === 0 && S.multi.k === 9 && S.multi.best === 660, `сезон, «Мульти-волна» (${JSON.stringify(S.multi)})`);
ok(L.air.n === 5 && L.air.k === 10 && L.pvo.n === 3 && L.pvo.w === 1 && L.multi.n === 1, `всё время: + бои до сезона (${JSON.stringify(L)})`);

// любимое: самолёт — больше всего вылетов, ЗРК — в большем числе боёв (повтор в одном бою — один раз)
const F = p.fav;
ok(eq(F.season.plane, { key: 'su30', n: 4, of: 7 }), `сезон: самолёт Су-30, 4 вылета из 7 (${JSON.stringify(F.season.plane)})`);
ok(eq(F.season.sam, { key: 's300', n: 2, of: 3 }), `сезон: ЗРК С-300 в 2 боях из 3; «Тор» — тоже в 2, при равенстве — по ключу (${JSON.stringify(F.season.sam)})`);
ok(eq(F.all.plane, { key: 'mig29', n: 9, of: 16 }), `всё время: МиГ-29, 9 вылетов из 16 (${JSON.stringify(F.all.plane)})`);
ok(F.all.sam && F.all.sam.of === 4, `всё время: боёв с ЗРК — 4 (${JSON.stringify(F.all.sam)})`);
ok(!JSON.stringify(F).includes('drop') && !JSON.stringify(F).includes('su27'), 'испорченные ключи и числа в u не считаются');

// лучшие бои сезона: засчитанные, по убыванию очков, без номеров боёв и разбора
const best = p.best;
ok(best.length === p.n && best.map((b) => b.rating).join(',') === '900,850,700,660,500,100', `лучшие бои — засчитанные, по убыванию (${best.map((b) => b.rating)})`);
ok(best.every((b) => Object.keys(b).sort().join(',') === 'at,draw,k,kind,mode,rating,win'), 'в бою только дата, вид, режим, итог, ранг и очки (без разбора и номера боя)');
ok(best.find((b) => b.rating === 660).draw === true && best.find((b) => b.rating === 660).kind === 'multi' && best.find((b) => b.rating === 900).k === 1.08, 'ничья «Мульти-волны» и ранг боя');

// награды: места за сезоны, новые сверху
ok(p.awards.length === 2 && eq(p.awards[0], { season: 2, place: 1 }) && eq(p.awards[1], { season: 1, place: 3 }), `награды — только места (${JSON.stringify(p.awards)})`);

// ни id игрока, ни номеров боёв
const txt = JSON.stringify(p);
ok(![A, B].some((id) => txt.includes(id)) && !MID.some((id) => txt.includes(id)), 'в ответе нет id игроков и номеров боёв');

// новичок без боёв
const n = await P('Новичок');
ok(n && n.place === null && n.points === 0 && n.n === 0 && n.games === 0 && JSON.stringify(n.modes) === '{"all":{},"season":{}}' && n.fav.season.plane === null && n.fav.all.sam === null && n.best.length === 0 && n.awards.length === 0,
  `новичок без боёв: пусто, без ошибок (${JSON.stringify(n)})`);
// другой сезон: бои сезона 1 в «сезон» не попадают, всё время — на месте
const p2 = await P('Гром_52', 2);
ok(JSON.stringify(p2.modes.season) === '{}' && p2.modes.all.air.n === 5 && p2.place === null && p2.best.length === 0 && p2.fav.season.plane === null, 'сезон 2: в сезоне пусто, всё время — на месте');

// права: только service_role
const g = await one(`select has_function_privilege('anon', 'airdef_profile(text, int)', 'execute') a, has_function_privilege('authenticated', 'airdef_profile(text, int)', 'execute') u, has_function_privilege('service_role', 'airdef_profile(text, int)', 'execute') s`);
ok(g.a === false && g.u === false && g.s === true, 'airdef_profile: anon / authenticated — нет, service_role — да');

console.log(bad ? `ИТОГ: ошибок ${bad}` : 'ИТОГ: всё прошло');
Deno.exit(bad ? 1 : 0);
