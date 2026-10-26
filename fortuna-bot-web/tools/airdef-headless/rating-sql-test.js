// Проверка sql/022_airdef_accounts_rating.sql и 025 без боевой базы: Postgres в WebAssembly (PGlite), поверх — таблица players (как 001) и
// миграции игры 020, 021. Сезоны (первый 25.10–01.12.2026 МСК, дальше по 30 дней), таблица сезона (025: по 2 лучших в обороне, вылете и
// «Мульти-волне» + 1 лучший из остальных; только аккаунты игры),
// перенос прогресса (в пустой и в непустой аккаунт игры, повторно — нельзя, не тот вид аккаунта — нельзя), права на функции (только
// service_role), замки в переносе, защита от перебора паролей (airdef_auth_fail), ник новичка (nick_season = 0).
//   deno run -A tools/airdef-headless/rating-sql-test.js
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
const SQL = new URL('../../sql/', import.meta.url).pathname;
const db = new PGlite();
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const one = async (q, p = []) => (await db.query(q, p)).rows[0];
const all = async (q, p = []) => (await db.query(q, p)).rows;

await db.exec(`create role service_role; create role anon; create role authenticated;
  create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null, full_name text,
    created_at timestamptz not null default now(), last_seen timestamptz not null default now());`);
for (const f of ['020_airdef_online.sql', '021_airdef_progress.sql', '022_airdef_accounts_rating.sql', '025_airdef_rating_slots.sql']) await db.exec(Deno.readTextFileSync(SQL + f));
await db.exec(Deno.readTextFileSync(SQL + '022_airdef_accounts_rating.sql')); // повторно — без ошибок (if not exists, on conflict)
await db.exec(Deno.readTextFileSync(SQL + '025_airdef_rating_slots.sql')); // 025 — снова поверх (на боевой 022 уже стоит)
ok(true, 'миграции 020, 021, 022, 025 (и 022, 025 повторно) применились');

// ── сезоны ──
const S = async (ts) => (await one('select airdef_season_at($1::timestamptz) s', [ts])).s;
ok(await S('2026-10-24 23:59:00+03') === 0, 'до 25.10 — сезон 0');
ok(await S('2026-10-25 00:00:00+03') === 1 && await S('2026-11-30 23:59:00+03') === 1, '25.10–30.11 — сезон 1');
ok(await S('2026-12-01 00:00:00+03') === 2 && await S('2026-12-30 23:59:00+03') === 2, '01.12–30.12 — сезон 2 (30 дней)');
ok(await S('2026-12-31 00:00:00+03') === 3, '31.12 — сезон 3');
const b2 = await one('select starts_at, ends_at from airdef_season_bounds(2)');
ok(+new Date(b2.starts_at) === +new Date('2026-12-01T00:00:00+03:00') && +new Date(b2.ends_at) === +new Date('2026-12-31T00:00:00+03:00'), 'границы сезона 2: 01.12–31.12');

// ── игроки: два аккаунта игры, один сайта ──
const mk = async (login, kind, nick) => { const p = await one(`insert into players (login, password_hash, kind) values ($1, 'x', $2) returning id`, [login, kind]); if (nick) await db.query('insert into airdef_accounts (player_id, nick) values ($1, $2)', [p.id, nick]); return p.id; };
const A = await mk('ad:alpha', 'airdef', 'Альфа'), B = await mk('ad:bravo', 'airdef', 'Браво'), W = await mk('webuser', 'site');
let dup = false; try { await mk('ad:alpha2', 'airdef', 'альфа'); } catch (_) { dup = true; }
ok(dup, 'ник уникален без учёта регистра');
let kindBad = false; try { await db.query(`insert into players (login, password_hash, kind) values ('zz', 'x', 'bot')`); } catch (_) { kindBad = true; }
ok(kindBad, 'вид аккаунта — только site / airdef');

// ── права: ни одна функция из 022 не доступна anon / authenticated, service_role — может ──
const FN = ['airdef_season_at(timestamptz)', 'airdef_season_bounds(int)', 'airdef_rating_points(uuid, int)', 'airdef_rating_board(int)', 'airdef_rating_counted(int, uuid)', 'airdef_transfer(uuid, uuid)', 'airdef_auth_fail_hit(text)'];
for (const f of FN) {
  const g = await one(`select has_function_privilege('anon', '${f}', 'execute') a, has_function_privilege('authenticated', '${f}', 'execute') u, has_function_privilege('service_role', '${f}', 'execute') s`);
  ok(g.a === false && g.u === false && g.s === true, `${f.split('(')[0]}: anon / authenticated — нет, service_role — да`);
}

// ── ник новичка и защита от перебора ──
ok((await one('select nick_season from airdef_accounts where player_id = $1', [A])).nick_season === 0, 'nick_season по умолчанию 0 (новичок один раз правит ник в сезоне)');
ok(!!(await one(`select 1 from pg_class where relname = 'airdef_auth_fail' and relrowsecurity`)) && (await all(`select 1 from pg_policies where tablename = 'airdef_auth_fail'`)).length === 0, 'airdef_auth_fail: RLS включён, политик нет');
{
  let lockedAt = 0;
  for (let i = 1; i <= 12; i++) { const r = await one(`select airdef_auth_fail_hit('login:alpha') u`); if (r.u && !lockedAt) lockedAt = i; }
  const row = await one(`select n, until from airdef_auth_fail where key = 'login:alpha'`);
  ok(lockedAt === 10, `10-я неудача подряд запирает ключ (запер на ${lockedAt}-й)`);
  const mins = (new Date(row.until) - Date.now()) / 60000;
  ok(mins > 14 && mins <= 15 && row.n === 12, `запрет на 15 минут (осталось ${mins.toFixed(1)}), счёт продолжается`);
  ok((await one(`select airdef_auth_fail_hit('login:bravo') u`)).u === null, 'другой ключ не заперт');
  await db.query(`update airdef_auth_fail set until = now() - interval '1 minute' where key = 'login:alpha'`);
  const again = await one(`select airdef_auth_fail_hit('login:alpha') u`), row2 = await one(`select n, until from airdef_auth_fail where key = 'login:alpha'`);
  ok(again.u === null && row2.n === 1 && row2.until === null, 'после срока запрета отсчёт идёт заново (n = 1)');
  await db.query(`update airdef_auth_fail set at = now() - interval '2 hours' where key = 'login:alpha'`); for (let i = 0; i < 8; i++) await db.query(`select airdef_auth_fail_hit('login:alpha')`);
  ok((await one(`select n from airdef_auth_fail where key = 'login:alpha'`)).n === 8, 'неудачи старше часа не копятся (первая после перерыва = 1, всего 8 из 8)');
  await db.query(`delete from airdef_auth_fail where key like 'login:%'`);
}
// замки в переносе: airdef_transfer сначала блокирует строки, и только потом проверяет already_used / already_done (гонку двух переносов в PGlite не воспроизвести — смотрим порядок в теле)
{
  const src = (await one(`select pg_get_functiondef('airdef_transfer(uuid, uuid)'::regprocedure) d`)).d;
  const lock1 = src.indexOf('from airdef_accounts where player_id = p_to for update'), lock2 = src.indexOf('from players where id = p_from for update');
  const chk1 = src.indexOf("raise exception 'already_used'"), chk2 = src.indexOf("raise exception 'already_done'");
  ok(lock1 > 0 && lock2 > 0 && lock1 < chk1 && lock2 < chk1 && lock1 < chk2, 'airdef_transfer: замки на обе строки взяты до проверок already_used / already_done');
}

// ── бои сезона 1: у Альфы 9 боёв за лётчика (в таблицу — 2 лучших + 1 лучший из остальных), у Браво 2, у сайта 3 (в таблице его нет, пока не перенесёт) ──
let m = 0; const fight = async (pid, rating, season = 1, team = 'air', mm = 0) => db.query(`insert into airdef_mp_results (match_id, player_id, mode, team, win, kills, score, rating, season, rp, result) values ($1, $2, 'real', $5, true, 1, 100, $3, $4, '{}', $6)`, ['m' + (++m), pid, rating, season, team, mm ? '{"mm":1}' : null]);
for (const r of [900, 100, 800, 700, 600, 500, 400, 300, 200]) await fight(A, r);
for (const r of [950, 50]) await fight(B, r);
for (const r of [990, 980, 970]) await fight(W, r);
await fight(A, 1000, 2); // другой сезон — не в счёт сезона 1
const board = await all('select nick, points::int p, n, place::int pl from airdef_rating_board(1)');
ok(board.length === 2 && board[0].nick === 'Альфа' && board[0].p === 900 + 800 + 700 && board[0].n === 3, `Альфа: 9 боёв за лётчика — засчитано 3 (2 лучших + 1 из остальных) = 2400 (${board[0].p}, ${board[0].n})`);
ok(board[1].nick === 'Браво' && board[1].p === 1000 && board[1].pl === 2, 'Браво: 2 боя, 1000 очков, 2-е место');
ok((await one('select airdef_rating_points($1, 1) p', [A])).p === 2400, 'airdef_rating_points = сумма засчитанных');
// Чарли: ПВО 500/400/300, лётчик 600/100, «Мульти-волна» 700/650/640 → 2 + 2 + 2 и лучший из остальных — 640 (волна), не 300
const Ch = await mk('ad:charlie', 'airdef', 'Чарли');
for (const r of [500, 400, 300]) await fight(Ch, r, 1, 'pvo');
for (const r of [600, 100]) await fight(Ch, r, 1, 'air');
for (const r of [700, 650, 640]) await fight(Ch, r, 1, 'pvo', 1);
{
  const c = await all('select kind, rating from airdef_rating_counted(1, $1) order by kind, rating desc', [Ch]);
  const by = (k) => c.filter((x) => x.kind === k).map((x) => x.rating).join(',');
  ok(c.length === 7 && by('pvo') === '500,400' && by('air') === '600,100' && by('multi') === '700,650,640', `Чарли: оборона 500+400, вылет 600+100, волна 700+650 и 640 из остальных (${JSON.stringify(c)})`);
  const row = (await all('select nick, points::int p, n, place::int pl from airdef_rating_board(1)')).find((q) => q.nick === 'Чарли');
  ok(row.p === 3590 && row.n === 7 && row.pl === 1, `Чарли в таблице: 3590, 7 боёв, 1-е место (${JSON.stringify(row)})`);
  ok((await all('select 1 from airdef_rating_counted(1)')).length === 3 + 2 + 3 + 7, 'без игрока — засчитанные бои всех, и аккаунта сайта тоже (3 + 2 + 3 + 7; в таблицу сезона он не попадает)');
}

// ── перенос: сайт → Браво (у Браво уже есть прогресс — складывается) ──
await db.query(`insert into airdef_progress (player_id, xp, silver, res, own, goal) values ($1, 500, 300, '{pvo:s125,air:e_su25}', '{pvo:s125}', '{"pvo":"pvo:kub"}')`, [W]);
await db.query(`insert into airdef_progress (player_id, xp, silver, res, own, goal) values ($1, 50, 20, '{air:e_su25,wpn:kh58}', '{}', '{}')`, [B]);
await db.query(`insert into airdef_runs (player_id, game, mode) values ($1, 'air', 'real'), ($1, 'defense', 'arcade')`, [W]);
await db.query(`select airdef_mp_record($1, 'air', true, 3, 120)`, [W]); await db.query(`select airdef_mp_record($1, 'pvo', false, 1, 40)`, [B]);
const t = await one('select airdef_transfer($1, $2) r', [W, B]);
ok(t.r.progress === true && t.r.runs === 2 && t.r.online === 3, `перенос: прогресс, 2 одиночных боя, 3 онлайн-боя (${JSON.stringify(t.r)})`);
const pB = await one('select xp, silver, res, own, goal from airdef_progress where player_id = $1', [B]);
ok(pB.xp === 550 && pB.silver === 320, 'опыт и серебро сложились (550 / 320)');
ok(new Set(pB.res).size === 3 && pB.res.includes('pvo:s125') && pB.res.includes('wpn:kh58'), 'исследования объединились без повторов');
ok(pB.own.includes('pvo:s125'), 'покупки перенеслись');
ok(!(await one('select count(*)::int c from airdef_progress where player_id = $1', [W])).c, 'у аккаунта сайта прогресса игры нет');
const st = await one('select games, wins, kills, score from airdef_mp_stats where player_id = $1', [B]);
ok(st.games === 2 && st.wins === 1 && st.kills === 4 && Number(st.score) === 160, 'онлайн-сводка сложилась');
ok(!(await one('select count(*)::int c from airdef_mp_stats where player_id = $1', [W])).c, 'онлайн-сводки сайта нет');
const board2 = await all('select nick, points::int p, n from airdef_rating_board(1)');
const br = board2.find((q) => q.nick === 'Браво');
ok(br && br.p === 990 + 980 + 970 && br.n === 3, `после переноса бои сезона с сайта — в счёт Браво (5 боёв за лётчика → засчитано 3, 2940: ${br && br.p})`);

// ── повторный перенос и не тот вид аккаунта ──
const fail = async (q, p) => { try { await db.query(q, p); return null; } catch (e) { return String(e.message); } };
ok(/already/.test(await fail('select airdef_transfer($1, $2)', [W, A]) || ''), 'тот же аккаунт сайта второй раз — нельзя');
const W2 = await mk('webuser2', 'site');
ok(/already_done/.test(await fail('select airdef_transfer($1, $2)', [W2, B]) || ''), 'в аккаунт игры, куда уже переносили, — нельзя');
ok(/not_site/.test(await fail('select airdef_transfer($1, $2)', [A, B]) || ''), 'перенос из аккаунта игры — нельзя');
ok(/not_airdef/.test(await fail('select airdef_transfer($1, $2)', [W2, W]) || ''), 'перенос в аккаунт сайта — нельзя');
const empty = await one('select airdef_transfer($1, $2) r', [W2, A]);
ok(empty.r.progress === false && empty.r.runs === 0, 'перенос пустого аккаунта сайта — без ошибок, ничего не переносит');

// ── формула очков боя (games/airdef/rating.js) — примеры из макета «Мои бои» ──
const { battleParts, battlePoints, oppStrength } = await import('../../games/airdef/rating.js');
const p1 = battleParts({ win: 1, score: 380, kills: 2, teamScores: [380, 250, 370], oppHumans: 3, oppTotal: 3, mode: 'real', era: 3 });
ok(p1.r === 400 && p1.c === 285 && p1.b === 1 && p1.m === 1 && p1.k === 1.05, `победа, реализм, ранг III, все люди: части ${JSON.stringify(p1)}`);
ok(battlePoints({ r: 400, c: 380, b: 1, m: 1, k: 1.05 }, 60) === 882, '(400 + 380 + 60) × 1,05 = 882');
ok(battlePoints({ r: 400, c: 440, b: 0.9, m: 0.6, k: 1.02 }, 50) === 490, 'аркада, ранг II, люди 4/6 ×0,9: 490');
ok(battlePoints({ r: 0, c: 310, b: 0.5, m: 1, k: 1 }, 20) === 165, 'поражение против одних ботов: 165');
const idle = battleParts({ win: 1, score: 0, kills: 0, teamScores: [0, 500], oppHumans: 2, oppTotal: 2, mode: 'real', era: 4 });
ok(idle.idle === 1 && battlePoints(idle, 100) === 0, 'бездействие — ноль, даже при победе');
const mw = battleParts({ win: 0.5, score: 100, kills: 1, teamScores: [100, 100], oppHumans: 1, oppTotal: 2, mode: 'real', era: 4, multi: true });
ok(mw.r === 200 && mw.k === 1 && mw.b === 0.75 && mw.c === 250, 'Мульти-волна: ничья 200, без надбавки за ранг, боты 1 из 2 → ×0,75');
ok(battleParts({ win: 1, score: 900, kills: 5, teamScores: [900, 10, 10], oppHumans: 1, oppTotal: 1, mode: 'real', era: 1 }).c === 500, 'вклад — не больше 500 (250 × 3 × 900 / 920 = 734 → 500)');
ok(oppStrength(0, []) === 50 && oppStrength(1000, [1000, 1000]) === 50 && oppStrength(1000, [3000]) === 75 && oppStrength(1000, []) === 0, 'сила соперников: равные 50, сильнее 75, нет людей 0');

// ── 026: сезон 1 на месяц длиннее (до 01.01.2027 МСК), дальше по 30 дней ──
await db.exec(Deno.readTextFileSync(SQL + '026_airdef_season1_longer.sql'));
ok(await S('2026-12-15 12:00:00+03') === 1 && await S('2026-12-31 23:59:00+03') === 1 && await S('2027-01-01 00:00:00+03') === 2 && await S('2027-01-31 00:00:00+03') === 3,
  '026: сезон 1 — до 01.01.2027, сезон 2 — 01.01–31.01 (30 дней), потом 3');
await db.exec(Deno.readTextFileSync(SQL + '026_airdef_season1_longer.sql'));
ok(+new Date((await one('select ends_at from airdef_seasons where id = 1')).ends_at) === +new Date('2027-01-01T00:00:00+03:00'), '026 повторно — конец сезона 1 тот же');

// ── 027: неделя межсезонья между сезонами; сезоны после записанного — по 30 дней ──
await db.exec(Deno.readTextFileSync(SQL + '027_airdef_offseason.sql'));
const LV = async (ts) => (await one('select airdef_season_live($1::timestamptz) s', [ts])).s;
const BD = async (n) => { const b = await one('select starts_at, ends_at from airdef_season_bounds($1)', [n]); return [new Date(b.starts_at).toISOString(), new Date(b.ends_at).toISOString()]; };
ok(await S('2026-12-31 23:59:00+03') === 1 && await LV('2026-12-31 23:59:00+03') === 1, '027: 31.12 — идёт сезон 1');
ok(await S('2027-01-01 00:00:00+03') === 2 && await LV('2027-01-01 00:00:00+03') === 0 && await LV('2027-01-07 23:59:00+03') === 0, '027: 01.01–07.01 — межсезонье (следующий — 2, идущего нет)');
ok(JSON.stringify(await BD(2)) === JSON.stringify(['2027-01-07T21:00:00.000Z', '2027-02-06T21:00:00.000Z']), `027: сезон 2 — 08.01–07.02.2027 МСК (${await BD(2)})`);
ok(await LV('2027-01-08 00:00:00+03') === 2 && await LV('2027-02-06 23:59:00+03') === 2 && await S('2027-02-07 00:00:00+03') === 3 && await LV('2027-02-10 00:00:00+03') === 0, '027: сезон 2 идёт до 07.02, затем межсезонье перед сезоном 3');
ok(JSON.stringify(await BD(3)) === JSON.stringify(['2027-02-13T21:00:00.000Z', '2027-03-15T21:00:00.000Z']), `027: сезон 3 — 14.02–16.03.2027 МСК (${await BD(3)})`);
ok(await S('2026-10-24 23:59:00+03') === 0 && await LV('2026-10-24 23:59:00+03') === 0, '027: до первого сезона — 0');
{
  const g = await one(`select has_function_privilege('anon', 'airdef_season_live(timestamptz)', 'execute') a, has_function_privilege('service_role', 'airdef_season_live(timestamptz)', 'execute') s`);
  ok(g.a === false && g.s === true, 'airdef_season_live: anon — нет, service_role — да');
}

console.log(bad ? `\nИТОГ: ошибок ${bad}` : '\nИТОГ: всё прошло');
if (bad) Deno.exit(1);
