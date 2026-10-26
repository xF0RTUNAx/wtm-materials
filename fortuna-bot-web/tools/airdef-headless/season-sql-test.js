// Проверка sql/024_airdef_season_rewards.sql без боевой базы (PGlite, как rating-sql-test.js): награды за сезон рейтинга — кристаллы за
// очки, место 1 — камуфляж на выбор, 2 — случайный из тех, которых нет, 3–5 — 75 / 50 / 25 % цены; меньше 3 засчитанных боёв — ничего и
// места не сдвигаются; камуфляжей не осталось (или все оставшиеся ждут невыбранных выборов) — цена кристаллами; нулевые очки — без
// награды за место; до конца сезона — ничего, повторный расчёт ничего не начисляет; права. Бои засчитываются по sql/025 (2 + 2 + 2 + 1).
//   deno run -A tools/airdef-headless/season-sql-test.js
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
import { SEASON } from '../../games/airdef/rating.js';
import { CAMOS, CAMO_PRICE, camosOut } from '../../games/airdef/arsenal.js';
const KEYS = CAMOS.map((c) => c.key).slice(0, 5); // каталог из пяти окрасок — проверяется логика выплат; какие вышли к сезону — camosOut (ниже)
const SQL = new URL('../../sql/', import.meta.url).pathname;
const db = new PGlite();
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const one = async (q, p = []) => (await db.query(q, p)).rows[0];
const all = async (q, p = []) => (await db.query(q, p)).rows;

await db.exec(`create role service_role; create role anon; create role authenticated;
  create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null, full_name text,
    created_at timestamptz not null default now(), last_seen timestamptz not null default now());`);
for (const f of ['020_airdef_online.sql', '021_airdef_progress.sql', '022_airdef_accounts_rating.sql', '024_airdef_season_rewards.sql', '025_airdef_rating_slots.sql', '027_airdef_offseason.sql']) await db.exec(Deno.readTextFileSync(SQL + f));
await db.exec(Deno.readTextFileSync(SQL + '024_airdef_season_rewards.sql')); // повторно — без ошибок
ok(true, 'миграции 020, 021, 022, 024, 025, 027 (и 024 повторно) применились');

// правила — как передаёт airdef-progress (_shared/airdef-season.ts)
const RULES = { per: SEASON.PER, min: SEASON.MIN, top: SEASON.TOP, price: CAMO_PRICE, camos: KEYS };
ok(CAMO_PRICE === 150 && SEASON.PER === 100 && SEASON.MIN === 3 && JSON.stringify(SEASON.TOP) === '["pick","random",0.75,0.5,0.25]' && CAMOS.length === 7 && JSON.stringify(camosOut(1)) === '["e_f15e:inferno","e_mig31:dragon"]' && camosOut(0).length === 0, 'правила Mark: 150 💎 за камуфляж, 1 💎 за 100 очков, места: выбор / случайный / 75 / 50 / 25 %; в сезоне 1 — «Инферно» и «Нефритовый дракон»');
const settle = async (r = RULES) => (await one('select airdef_season_settle($1::jsonb) s', [JSON.stringify(r)])).s;
const wal = async (id) => (await one('select crystals, camos, picks from airdef_wallet where player_id = $1', [id])) || null;
const paid = async (s, id) => (await one('select place, points, n, crystals, camo, pick from airdef_season_paid where season = $1 and player_id = $2', [s, id])) || null;

// ── права и защита таблиц ──
{
  const g = await one(`select has_function_privilege('anon', 'airdef_season_settle(jsonb)', 'execute') a, has_function_privilege('authenticated', 'airdef_season_settle(jsonb)', 'execute') u, has_function_privilege('service_role', 'airdef_season_settle(jsonb)', 'execute') s`);
  ok(g.a === false && g.u === false && g.s === true, 'airdef_season_settle: anon / authenticated — нет, service_role — да');
  for (const t of ['airdef_wallet', 'airdef_season_paid', 'airdef_season_done']) {
    ok(!!(await one(`select 1 from pg_class where relname = $1 and relrowsecurity`, [t])) && (await all(`select 1 from pg_policies where tablename = $1`, [t])).length === 0, `${t}: RLS включён, политик нет`);
  }
  const src = (await one(`select pg_get_functiondef('airdef_season_settle(jsonb)'::regprocedure) d`)).d;
  const lock = src.indexOf('pg_advisory_xact_lock'), recheck = src.indexOf('airdef_season_done d where d.season = s', lock);
  ok(lock > 0 && recheck > lock, 'замок на сезон, после него — повторная проверка «уже рассчитан» (два вызова сразу не начислят дважды)');
}

// ── игроки: аккаунты игры A–I, сайта W ──
const mk = async (login, kind, nick) => { const p = await one(`insert into players (login, password_hash, kind) values ($1, 'x', $2) returning id`, [login, kind]); if (nick) await db.query('insert into airdef_accounts (player_id, nick) values ($1, $2)', [p.id, nick]); return p.id; };
const P = {}; for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) P[n] = await mk('ad:' + n.toLowerCase(), 'airdef', 'Пилот' + n);
const W = await mk('webuser', 'site');
// бои по кругу: лётчик, ПВО, «Мульти-волна» — до 7 боёв засчитываются все (2 + 2 + 2 + 1, sql/025)
let m = 0; const fights = async (pid, season, n, rating) => { for (let i = 0; i < n; i++) await db.query(`insert into airdef_mp_results (match_id, player_id, mode, team, win, kills, score, rating, season, rp, result) values ($1, $2, 'real', $5, true, 1, 100, $3, $4, '{}', $6)`, ['m' + (++m), pid, rating, season, i % 3 === 1 ? 'pvo' : 'air', i % 3 === 2 ? '{"mm":1}' : null]); };

// сезон 1: A 6300, B 5600, C 4900, D 3600, E 3000, F 2850 (по 3+ боя), G — 2 боя (2000), сайт — не в таблице
await fights(P.A, 1, 7, 900); await fights(P.B, 1, 7, 800); await fights(P.C, 1, 7, 700); await fights(P.D, 1, 4, 900);
await fights(P.E, 1, 3, 1000); await fights(P.F, 1, 3, 950); await fights(P.G, 1, 2, 1000); await fights(W, 1, 3, 990);

// ── до конца сезона — ничего ──
await db.query(`update airdef_seasons set starts_at = now() - interval '10 days', ends_at = now() + interval '10 days' where id = 1`);
ok((await settle()).length === 0 && !(await one('select count(*)::int c from airdef_wallet')).c, 'сезон идёт — ничего не начислено');
let badRules = false; try { await settle({ ...RULES, per: 0 }); } catch (e) { badRules = /bad_rules/.test(String(e.message)); }
ok(badRules, 'кривые правила (per = 0) — ошибка bad_rules');

// ── сезон 1 закончился ──
await db.query(`update airdef_seasons set starts_at = now() - interval '40 days', ends_at = now() - interval '1 hour' where id = 1`);
const s1 = await settle();
ok(JSON.stringify(s1) === '[1]', `рассчитан сезон 1 (${JSON.stringify(s1)})`);
ok((await one('select airdef_season_live(now()) l, airdef_season_at(now()) a')).l === 0, 'сезон 1 закончился час назад — межсезонье (027), награды уже начислены');
const a1 = await wal(P.A), b1 = await wal(P.B);
ok(a1.crystals === 63 && a1.picks === 1 && a1.camos.length === 0, `1-е место: 63 💎 за 6300 очков + камуфляж на выбор (${JSON.stringify(a1)})`);
ok(b1.crystals === 56 && b1.camos.length === 1 && KEYS.includes(b1.camos[0]) && b1.picks === 0, `2-е место: 56 💎 + случайный камуфляж ${b1.camos[0]}`);
ok((await wal(P.C)).crystals === 49 + 113, '3-е место: 49 + 113 (75 % от 150, вверх) = 162 💎');
ok((await wal(P.D)).crystals === 36 + 75, '4-е место: 36 + 75 (50 %) = 111 💎');
ok((await wal(P.E)).crystals === 30 + 38, '5-е место: 30 + 38 (25 %, вверх) = 68 💎');
ok((await wal(P.F)).crystals === 28 && (await paid(1, P.F)).place === 6, '6-е место: только за очки — 28 💎');
ok(!(await wal(P.G)) && !(await paid(1, P.G)), '2 засчитанных боя — ничего');
ok(!(await wal(W)), 'аккаунт сайта — не в таблице, ничего');
const d1 = await one('select players, crystals from airdef_season_done where season = 1');
ok(d1.players === 6 && d1.crystals === 63 + 56 + 162 + 111 + 68 + 28, `отметка сезона: 6 игроков, ${d1.crystals} 💎`);
const pa = await paid(1, P.A);
ok(pa.place === 1 && pa.points === 6300 && pa.n === 7 && pa.crystals === 63 && pa.pick === 1, 'выплата записана: место, очки, бои, что дали');
ok((await settle()).length === 0 && (await wal(P.A)).crystals === 63 && (await wal(P.B)).camos.length === 1, 'повторный расчёт ничего не начисляет');

// ── сезоны 2, 3, 4 (все закончились — рассчитываются одним вызовом; между ними — межсезонье, sql/027) ──
// сезон 2: E 6000 (1-е; 4 камуфляжа свои + 1 «на выбор» ждёт — выбирать нечего → цена), B 4500 (2-е; все 5 свои → цена),
// C 4000 (3-е, но 2 боя — ничего, места не сдвигаются), D 3000 (4-е → 50 %)
await db.query(`update airdef_wallet set camos = $2, picks = 1 where player_id = $1`, [P.E, KEYS.slice(0, 4)]);
await db.query(`update airdef_wallet set camos = $2 where player_id = $1`, [P.B, KEYS]);
await fights(P.E, 2, 3, 2000); await fights(P.B, 2, 3, 1500); await fights(P.C, 2, 2, 2000); await fights(P.D, 2, 3, 1000);
// сезон 3: F 6000 (1-е → на выбор), C 3000 (2-е; свои все, кроме последнего, выборов нет → достаётся именно он)
await db.query(`update airdef_wallet set camos = $2 where player_id = $1`, [P.C, KEYS.slice(0, 4)]);
await fights(P.F, 3, 3, 2000); await fights(P.C, 3, 3, 1000);
// сезон 4: D 6000 (1-е → на выбор), A 3000 (2-е; свой не хватает одного, но его ждёт невыбранный выбор с сезона 1 → цена),
// H и I — по 3 боя без действий (0 очков, делят 3-е место) → ничего
await db.query(`update airdef_wallet set camos = $2 where player_id = $1`, [P.A, KEYS.slice(0, 4)]);
await fights(P.D, 4, 3, 2000); await fights(P.A, 4, 3, 1000); await fights(P.H, 4, 3, 0); await fights(P.I, 4, 3, 0);
await db.query(`update airdef_seasons set starts_at = now() - interval '160 days', ends_at = now() - interval '120 days' where id = 1`); // 027: сезоны 2–4 — по 30 дней через неделю межсезонья, все закончились
const s23 = await settle();
ok(JSON.stringify(s23) === '[2,3,4]', `рассчитаны сезоны 2, 3, 4 (${JSON.stringify(s23)})`);
const e2 = await wal(P.E);
ok(e2.crystals === 68 + 60 + 150 && e2.picks === 1, `1-е место, а выбирать нечего — цена 150 💎 вместо выбора (${e2.crystals}, ждёт выбора ${e2.picks})`);
const b2 = await wal(P.B);
ok(b2.crystals === 56 + 45 + 150 && b2.camos.length === 5, `2-е место, все камуфляжи свои — 150 💎 вместо случайного (${b2.crystals})`);
ok(!(await paid(2, P.C)), '3-е место с 2 боями — ничего');
const d2 = await paid(2, P.D);
ok(d2.place === 4 && d2.crystals === 30 + 75, '4-е место за ним — 50 %, места не сдвинулись');
const f3 = await wal(P.F), c3 = await wal(P.C);
ok(f3.picks === 1 && f3.crystals === 28 + 60, 'сезон 3: 1-е место — на выбор');
ok(c3.camos.length === 5 && c3.camos.includes(KEYS[4]) && (await paid(3, P.C)).camo === KEYS[4] && c3.crystals === 162 + 30, `сезон 3: 2-е место — единственный недостающий камуфляж (${KEYS[4]})`);
const d4 = await wal(P.D), a4 = await wal(P.A);
ok(d4.picks === 1 && d4.crystals === 216 + 60, 'сезон 4: 1-е место — на выбор');
ok(a4.camos.length === 4 && a4.picks === 1 && !(await paid(4, P.A)).camo && a4.crystals === 63 + 30 + 150, `сезон 4: 2-е место, последний свободный камуфляж обещан выбору — 150 💎 (${a4.crystals})`);
const h4 = await paid(4, P.H), i4 = await paid(4, P.I);
ok(h4.place === 3 && i4.place === 3 && h4.crystals === 0 && i4.crystals === 0 && (await wal(P.H)).crystals === 0, 'сезон 4: 0 очков, делят 3-е место — награды за место нет');

console.log(bad ? `\nИТОГ: ошибок ${bad}` : '\nИТОГ: всё прошло');
if (bad) Deno.exit(1);
