// Проверка sql/023_airdef_multi_starters.sql без боевой базы (PGlite, как rating-sql-test.js): возврат за узлы «Ударов», ставшие стартовыми
// (после 2026-10-25: «в волне нет рангов»). Цена возврата — старая (II — 5 500, III — 13 800) и сверена с самой игрой: стенд ниже берёт цены
// узлов из прежнего дерева, поэтому число в SQL должно совпасть с формулой COST.small[ранг−1] × BRANCH_K.strike.
//   deno run -A tools/airdef-headless/refund-sql-test.js
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
import { NODE, COST, BRANCH_K, START } from '../../games/airdef/progress.js';
const SQL = new URL('../../sql/', import.meta.url).pathname;
const db = new PGlite();
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const one = async (q, p = []) => (await db.query(q, p)).rows[0];
const all = async (q, p = []) => (await db.query(q, p)).rows;

await db.exec(`create role service_role; create role anon; create role authenticated;
  create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null, full_name text,
    created_at timestamptz not null default now(), last_seen timestamptz not null default now());`);
for (const f of ['020_airdef_online.sql', '021_airdef_progress.sql']) await db.exec(Deno.readTextFileSync(SQL + f));

// ── игроки до миграции ──
const mk = async (login) => (await one(`insert into players (login, password_hash) values ($1, 'x') returning id`, [login])).id;
const prog = (pid, xp, silver, res, own, goal = {}) => db.query('insert into airdef_progress (player_id, xp, silver, res, own, goal) values ($1, $2, $3, $4, $5, $6)', [pid, xp, silver, res, own, JSON.stringify(goal)]);
const A = await mk('a'), B = await mk('b'), C = await mk('c'), D = await mk('d'), E = await mk('e'), F = await mk('f');
await prog(A, 100, 200, ['strike:lance', 'strike:jsow'], ['strike:lance', 'strike:jsow']);                       // оба куплены: 5500 + 13800 и опыта, и серебра
await prog(B, 0, 0, ['strike:kh55_s', 'strike:atacms'], ['strike:atacms'], { strike: 'strike:uav_w', air: 'air:e_f4' }); // kh55_s только исследован (опыт 5500); цель — на ставшем стартовым
await prog(C, 50, 60, ['air:e_su25', 'strike:tochka'], ['air:e_su25', 'strike:tochka']);                         // ничего из стартовых — ничего не возвращаем
await prog(D, 7, 8, ['strike:kh55d', 'strike:uav_w', 'strike:kh55_s', 'strike:lance', 'strike:jsow'], ['strike:kh55d', 'strike:uav_w', 'strike:kh55_s', 'strike:lance', 'strike:jsow']); // все пять
await prog(F, 1, 2, [], ['strike:uav_w']);                                                                        // куплено без записи в res (в игре так не бывает, но серебро вернуть)
// E — без строки прогресса вовсе

// ── цены в SQL = старые цены игры (ранг II = 5500, III = 13800) ──
const old = { 'strike:kh55_s': 2, 'strike:kh55d': 2, 'strike:lance': 2, 'strike:jsow': 3, 'strike:uav_w': 3 };
const price = (id) => Math.round(COST.small[old[id] - 1] * BRANCH_K.strike / 100) * 100;
ok(Object.values(old).every((r, i) => price(Object.keys(old)[i]) === { 2: 5500, 3: 13800 }[r]), 'формула старой цены: ранг II → 5500, III → 13800');
ok(Object.keys(old).every((id) => NODE[id] && NODE[id].start) && Object.keys(old).every((id) => START.strike.includes(id.slice(7))), 'все пять узлов теперь стартовые в progress.js');

// ── права до применения: таблицы и функции ещё нет ──
await db.exec(Deno.readTextFileSync(SQL + '023_airdef_multi_starters.sql')); // применение; в конце файла уже вызван возврат
const get = async (p) => one('select xp, silver, version, goal, res, own from airdef_progress where player_id = $1', [p]);
const a = await get(A), b = await get(B), c = await get(C), d = await get(D), f = await get(F);
const P5 = price('strike:kh55_s'), P13 = price('strike:jsow');
ok(a.xp === 100 + P5 + P13 && a.silver === 200 + P5 + P13, `A: lance + jsow в res и own → опыт ${a.xp}, серебро ${a.silver} (100 + 19 300, 200 + 19 300)`);
ok(b.xp === P5 && b.silver === 0, `B: kh55_s только исследован → +5500 опыта, серебро не тронуто (${b.xp} / ${b.silver})`);
ok(b.goal.strike === undefined && b.goal.air === 'air:e_f4', 'B: цель удара на ставшем стартовым снята, цель авиации осталась');
ok(c.xp === 50 && c.silver === 60 && c.version === 1, 'C: нет ставших стартовыми — баланс и версия не тронуты');
ok(d.xp === 7 + 3 * P5 + 2 * P13 && d.silver === 8 + 3 * P5 + 2 * P13, `D: все пять → +${3 * P5 + 2 * P13} опыта и серебра (3 × 5500 + 2 × 13800)`);
ok(f.xp === 1 && f.silver === 2 + P13, 'F: куплено без res → вернулось только серебро 13 800');
ok(a.version === 2 && b.version === 2 && d.version === 2, 'версия строки выросла (параллельный запрос не затрёт возврат)');
ok(a.res.includes('strike:lance') && a.own.includes('strike:lance'), 'записи res / own не удаляются (откат функций не даст купить второй раз)');
ok(!(await one('select 1 from airdef_progress where player_id = $1', [E])), 'E: без строки прогресса — ничего не создано');

// ── журнал ──
const log = await all('select player_id, key, xp, silver from airdef_refund_log order by player_id, key');
ok(log.length === 2 + 1 + 5 + 1, `в журнале 9 записей (A 2, B 1, D 5, F 1; у C нет): ${log.length}`);
ok(!log.some((r) => r.player_id === C), 'C в журнале нет');
ok(log.find((r) => r.player_id === B && r.key === 'strike:kh55_s').xp === P5 && log.find((r) => r.player_id === B && r.key === 'strike:kh55_s').silver === 0, 'журнал B: опыт 5500, серебро 0');
let dup = false; try { await db.query(`insert into airdef_refund_log (player_id, key) values ($1, 'strike:lance')`, [A]); } catch (_) { dup = true; }
ok(dup, 'журнал: (player_id, key) уникален');

// ── повторный прогон: ничего не прибавляется ──
const snap = JSON.stringify(await all('select player_id, xp, silver, version, goal from airdef_progress order by player_id'));
const r2 = await one('select * from airdef_multi_starters_refund()');
await db.exec(Deno.readTextFileSync(SQL + '023_airdef_multi_starters.sql'));
ok(Number(r2.n_players) === 0 && Number(r2.sum_xp) === 0 && Number(r2.sum_silver) === 0, 'повторный вызов: 0 игроков, 0 опыта, 0 серебра');
ok(JSON.stringify(await all('select player_id, xp, silver, version, goal from airdef_progress order by player_id')) === snap, 'повторный прогон (и файл целиком повторно): балансы и версии прежние');
ok((await one('select count(*)::int n from airdef_refund_log')).n === 9, 'журнал не вырос');

// ── игрок, купивший позже (в базе уже была миграция, потом появилась новая запись): возвращается только новое, один раз ──
await db.query(`update airdef_progress set res = res || array['strike:kh55d'], own = own || array['strike:kh55d'] where player_id = $1`, [C]);
const r3 = await one('select * from airdef_multi_starters_refund()');
ok(Number(r3.n_players) === 1 && Number(r3.sum_xp) === P5 && Number(r3.sum_silver) === P5, 'запоздавший (нашёлся после миграции): вернулся один раз 5500 + 5500');
ok((await one('select * from airdef_multi_starters_refund()')).n_players === 0, 'и повторно — нет');

// ── права: только service_role ──
const g = await one(`select has_function_privilege('anon', 'airdef_multi_starters_refund()', 'execute') a, has_function_privilege('authenticated', 'airdef_multi_starters_refund()', 'execute') u, has_function_privilege('service_role', 'airdef_multi_starters_refund()', 'execute') s,
  has_table_privilege('anon', 'airdef_refund_log', 'select') ta, has_table_privilege('authenticated', 'airdef_refund_log', 'select') tu, has_table_privilege('service_role', 'airdef_refund_log', 'select') ts,
  has_table_privilege('authenticated', 'airdef_refund_log', 'insert') ti`);
ok(g.a === false && g.u === false && g.s === true, 'функция возврата: anon / authenticated — нет, service_role — да');
ok(g.ta === false && g.tu === false && g.ti === false && g.ts === true, 'airdef_refund_log: anon / authenticated — нет, service_role — да');
ok(!!(await one(`select 1 from pg_class where relname = 'airdef_refund_log' and relrowsecurity`)) && (await all(`select 1 from pg_policies where tablename = 'airdef_refund_log'`)).length === 0, 'airdef_refund_log: RLS включён, политик нет');

console.log(bad ? `\nИТОГ: ошибок ${bad}` : '\nИТОГ: всё прошло');
if (bad) Deno.exit(1);
