// Проверка SQL-миграции 018 (ракеты за детали, награды, операция) на настоящем Postgres в памяти (PGlite), без Supabase:
//   deno run --allow-read --allow-env --allow-net tools/sql-test/drone-rewards.test.js
// Поднимает минимальную схему (игроки, экономика), применяет 017 и 018 (018 — дважды: повторное применение безопасно)
// и прогоняет сценарии: покупка, вылеты с билетом и без, бонусный билет, очки, пределы, шаги, финал, топ-3.
import { PGlite } from 'npm:@electric-sql/pglite@0.3';
const fs = { readFileSync: (p) => Deno.readTextFileSync(p) };
const R = new URL('../../sql/', import.meta.url).pathname;
const db = new PGlite();
let fails = 0;
const check = (n, ok, info = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + n + (info ? ' — ' + info : '')); };
const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`create role service_role;
create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null default '');
create table player_economy (player_id uuid primary key references players(id) on delete cascade, keys_current bigint not null default 0, keys_lifetime bigint not null default 0, details bigint not null default 0, updated_at timestamptz not null default now());`);
await db.exec(fs.readFileSync(R + '017_tickets.sql', 'utf8'));
await db.exec(fs.readFileSync(R + '018_drone_rewards.sql', 'utf8'));
await db.exec(fs.readFileSync(R + '018_drone_rewards.sql', 'utf8')); // повторное применение безопасно
const mk = async (login, details = 0) => { const [p] = await q(`insert into players (login) values ($1) returning id`, [login]); await q(`insert into player_economy (player_id, details) values ($1, $2)`, [p.id, details]); return p.id; };
const A = await mk('Марк', 40), B = await mk('Друг', 5), C = await mk('Третий'), D = await mk('Четвёртый');
const econ = async (id) => (await q(`select details::int, keys_current::int k, tickets_used, tickets_day from player_economy where player_id=$1`, [id]))[0];

check('первая операция создана (и только одна после повторного применения)', (await q(`select count(*)::int n from operations`))[0].n === 1);
// покупка
check('покупка ракеты', (await q(`select drone_buy_missile($1,'r73',30) r`, [A]))[0].r === 'ok' && (await econ(A)).details === 10);
check('повторная покупка — owned', (await q(`select drone_buy_missile($1,'r73',30) r`, [A]))[0].r === 'owned');
check('не хватает деталей', (await q(`select drone_buy_missile($1,'aim9l',15) r`, [B]))[0].r === 'no_details' && (await econ(B)).details === 5);
// вылеты и билеты
let r = (await q(`select drone_start_run($1,'real',true,5) j`, [A]))[0].j;
check('вылет с билетом', r.ranked === true && r.tickets_left === 4, JSON.stringify(r));
for (let i = 0; i < 4; i++) await q(`select drone_start_run($1,'arcade',true,5)`, [A]);
r = (await q(`select drone_start_run($1,'arcade',true,5) j`, [A]))[0].j;
check('билеты кончились — вылет без награды', r.ranked === false, JSON.stringify(r));
r = (await q(`select drone_start_run($1,'arcade',false,5) j`, [B]))[0].j;
check('без билета по желанию — билет не тратится', r.ranked === false && (await econ(B)).tickets_used === 0);
// награда и бонусный билет
check('бонусный билет возвращает потраченный', (await q(`select drone_grant($1,6,1,true) t`, [A]))[0].t === 'ticket' && (await econ(A)).tickets_used === 4 && (await econ(A)).details === 16 && (await econ(A)).k === 1);
check('бонусный билет без трат сегодня — ключ', (await q(`select drone_grant($1,0,0,true) t`, [C]))[0].t === 'key' && (await econ(C)).k === 1);
// операция: шаг 1200 очков
r = (await q(`select operation_add_points($1,450,true,450) j`, [A]))[0].j;
check('очки в операцию', r.added === 450 && r.points === 450 && r.step_after === 0);
r = (await q(`select operation_add_points($1,100,true,450) j`, [A]))[0].j;
check('суточный предел одиночных очков', r.added === 0 && r.capped === true);
r = (await q(`select operation_add_points($1,800,false,450) j`, [A]))[0].j;
check('онлайн-очки без предела, шаг пройден', r.added === 800 && r.step_before === 0 && r.step_after === 1, JSON.stringify(r));
check('награда шага: мало вклада — отказ', (await q(`select operation_claim($1) j`, [B]))[0].j.error === 'low_contrib');
r = (await q(`select operation_claim($1) j`, [A]))[0].j;
check('награда шага 1: 15 деталей', r.details === 15 && r.keys === 0 && r.steps.join() === '1', JSON.stringify(r));
check('повторно — ничего', (await q(`select operation_claim($1) j`, [A]))[0].j.details === 0);
// дойти до 5-го шага (6000) и до финала (30000)
await q(`select operation_add_points($1,4750,false,450)`, [B]);
r = (await q(`select operation_claim($1) j`, [A]))[0].j;
check('шаги 2–5: 4×15 деталей + 15 ключей на 5-м', r.details === 60 && r.keys === 15 && r.steps.join() === '2,3,4,5', JSON.stringify(r));
await q(`select operation_add_points($1,5000,false,450)`, [C]);
await q(`select operation_add_points($1,30,false,450)`, [D]);
r = (await q(`select operation_add_points($1,20000,false,450) j`, [B]))[0].j;
check('цель достигнута — операция завершена', r.step_after === 25 && (await q(`select status from operations`))[0].status === 'finished', JSON.stringify(r));
check('после финала очки не добавляются', (await q(`select operation_add_points($1,10,false,450) j`, [A]))[0].j === null);
r = (await q(`select operation_claim($1) j`, [B]))[0].j;
// B: шаги 1..24 — по 15 деталей (360), на 5,10,15,20 — +15 ключей (60), 25-й (финал) — 50/50; топ-1 — 30/30
check('финал и топ-1 у лидера вклада', r.details === 360 + 50 + 30 && r.keys === 60 + 50 + 30 && r.steps.includes(25) && r.steps.includes(1001), JSON.stringify({ d: r.details, k: r.keys }));
r = (await q(`select operation_claim($1) j`, [C]))[0].j; check('топ-2', r.steps.includes(1002) && r.keys === 60 + 50 + 20, JSON.stringify({ d: r.details, k: r.keys }));
r = (await q(`select operation_claim($1) j`, [A]))[0].j; check('топ-3 (шаги 6–25 + бонус 10)', r.steps.includes(1003) && r.details === 19 * 15 + 50 + 10, JSON.stringify({ d: r.details, k: r.keys }));
r = (await q(`select operation_claim($1) j`, [D]))[0].j; check('4-й — без бонуса топа', !r.steps.some((s) => s > 1000));
const id = (await q(`select operation_start('Вторая волна', 50000, 25) id`))[0].id;
check('новая операция (админ)', id === 2 && (await q(`select count(*)::int n from operations where status='active'`))[0].n === 1);
console.log(fails ? `ИТОГ: ${fails} ошибок` : 'ИТОГ: всё прошло');
Deno.exit(fails ? 1 : 0);
