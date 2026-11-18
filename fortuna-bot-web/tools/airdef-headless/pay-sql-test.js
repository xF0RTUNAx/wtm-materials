// Проверка sql/037_airdef_premium_pay.sql без боевой базы (PGlite, как shop-sql-test.js): заказ → проверка перед списанием → начисление
// (премиум, кристаллы), повтор того же платежа не начисляет, другой платёж на оплаченный заказ - ошибка, возврат снимает не больше, чем есть,
// премиум продлевается от конца текущего, кристалл за вход - раз в день и только с премиумом, удалённый игрок - заказ остаётся.
//   deno run -A tools/airdef-headless/pay-sql-test.js
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
import { PAY } from '../../games/airdef/arsenal.js';
const SQL = new URL('../../sql/', import.meta.url).pathname;
const db = new PGlite();
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const one = async (q, p = []) => (await db.query(q, p)).rows[0];

await db.exec(`create role service_role; create role anon; create role authenticated;
  create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null, full_name text,
    created_at timestamptz not null default now(), last_seen timestamptz not null default now());`);
for (const f of ['020_airdef_online.sql', '021_airdef_progress.sql', '022_airdef_accounts_rating.sql', '024_airdef_season_rewards.sql', '025_airdef_rating_slots.sql', '027_airdef_offseason.sql', '028_airdef_shop.sql', '037_airdef_premium_pay.sql']) await db.exec(Deno.readTextFileSync(SQL + f));
await db.exec(Deno.readTextFileSync(SQL + '037_airdef_premium_pay.sql')); // повторно - без ошибок
ok(true, 'миграции 020…028 и 037 (037 повторно) применились');

const p = (await one(`insert into players (login, password_hash, kind) values ('pilot', 'x', 'airdef') returning id`)).id;
const order = async (sku, pl = p) => { const s = PAY[sku]; return (await one('select airdef_order_new($1, $2, $3, $4, $5) r', [pl, sku, s.stars, s.prem || 0, s.gems || 0])).r; };
const check = (o, st) => one('select airdef_pay_check($1, $2) r', [o, st]).then((x) => x.r);
const credit = (o, ch, st, tg = 777) => one('select airdef_pay_credit($1, $2, $3, $4) r', [o, ch, st, tg]).then((x) => x.r);
const refund = (ch) => one('select airdef_pay_refund($1) r', [ch]).then((x) => x.r);
const daily = (d, pl = p) => one('select airdef_prem_daily($1, $2) r', [pl, d]).then((x) => x.r);
const view = (pl = p) => one('select airdef_wallet_view($1) r', [pl]).then((x) => x.r);
const until = async (pl = p) => (await one('select premium_until u from airdef_wallet where player_id = $1', [pl]))?.u;
const days = (a, b) => (new Date(a) - new Date(b)) / 864e5;

// каталог
ok(Object.values(PAY).every((s) => s.stars > 0 && !!s.prem !== !!s.gems), 'каталог: у каждой позиции цена в звёздах и ровно одно - дни или кристаллы');

// кристаллы
let v = await view();
ok(v.crystals === 0 && v.premium_until === null, 'кошелька нет - пустой вид, премиума нет');
const g1 = await order('gems_100');
ok(!!g1.id, 'заказ 100 кристаллов создан');
ok(await check(g1.id, PAY.gems_100.stars) === 'ok', 'проверка перед списанием: ok');
ok(await check(g1.id, PAY.gems_100.stars - 1) === 'bad_sum', 'другая сумма - bad_sum');
ok(await check('00000000-0000-0000-0000-000000000000', 100) === 'no_order', 'нет заказа - no_order');
let r = await credit(g1.id, 'ch-1', PAY.gems_100.stars);
ok(r.ok && (await view()).crystals === 100, 'оплачено: +100 кристаллов');
r = await credit(g1.id, 'ch-1', PAY.gems_100.stars);
ok(r.dup && (await view()).crystals === 100, 'тот же платёж ещё раз (Telegram повторил) - не начисляет');
r = await credit(g1.id, 'ch-2', PAY.gems_100.stars);
ok(r.error === 'not_new' && (await view()).crystals === 100, 'другой платёж на оплаченный заказ - ошибка, без начисления');
ok(await check(g1.id, PAY.gems_100.stars) === 'not_new', 'оплаченный заказ второй раз не проходит проверку');
const g2 = await order('gems_550');
ok((await credit(g2.id, 'ch-3', 1)).error === 'bad_sum', 'начисление с чужой суммой - отказ');

// возврат кристаллов: потратил часть - снимается остаток, в минус не уходит
await db.query('update airdef_wallet set crystals = 30 where player_id = $1', [p]);
r = await refund('ch-1');
ok(r.ok && r.gems === 30 && (await view()).crystals === 0 && Number(r.tg_user) === 777, 'возврат: снято сколько было (30 из 100), кошелёк 0, известен плательщик');
ok((await refund('ch-1')).error === 'not_paid', 'второй возврат того же - отказ');
ok((await refund('nope')).error === 'no_order', 'возврат неизвестного платежа - отказ');

// премиум: от покупки, следующий - от конца текущего
const p1 = await order('prem_7d');
await credit(p1.id, 'ch-p1', PAY.prem_7d.stars);
let u1 = await until();
ok(Math.abs(days(u1, new Date()) - 7) < 0.01 && (await view()).premium_until !== null, 'премиум 7 дней: до «сейчас + 7 д»');
const p2 = await order('prem_1d');
await credit(p2.id, 'ch-p2', PAY.prem_1d.stars);
let u2 = await until();
ok(Math.abs(days(u2, u1) - 1) < 0.001, 'ещё 1 день - продлён от конца текущего (8 д)');
r = await refund('ch-p1');
ok(r.ok && Math.abs(days(await until(), u2) + 7) < 0.001, 'возврат 7 дней - срок сдвинут назад на 7 д');
// кончившийся премиум: новая покупка - от «сейчас», не от прошлого конца
await db.query(`update airdef_wallet set premium_until = now() - interval '3 days' where player_id = $1`, [p]);
ok((await view()).premium_until === null, 'кончился - в виде кошелька null');
const p3 = await order('prem_30d');
await credit(p3.id, 'ch-p3', PAY.prem_30d.stars);
ok(Math.abs(days(await until(), new Date()) - 30) < 0.01, 'после конца - 30 дней от покупки');

// кристалл за вход
const c0 = (await view()).crystals;
ok(await daily('2026-11-19') === 1 && (await view()).crystals === c0 + 1, 'первый вход дня с премиумом: +1');
ok(await daily('2026-11-19') === 0 && (await view()).crystals === c0 + 1, 'второй вход в тот же день: ничего');
ok(await daily('2026-11-20') === 1, 'на следующий день: снова +1');
const q = (await one(`insert into players (login, password_hash, kind) values ('free', 'x', 'airdef') returning id`)).id;
await db.query('insert into airdef_wallet (player_id) values ($1)', [q]);
ok(await daily('2026-11-19', q) === 0, 'без премиума: ничего');

// лимит неоплаченных счетов
let lim = null; for (let i = 0; i < 21; i++) lim = await order('prem_1d', q);
ok(lim.error === 'too_many', '21-й неоплаченный счёт за час - too_many');
let threw = false; try { await one('select airdef_order_new($1, $2, $3, $4, $5)', [p, 'x', 10, 1, 5]); } catch (_) { threw = true; }
ok(threw, 'заказ «и дни, и кристаллы» - исключение');

// удалённый игрок: заказы остаются без игрока; оплата после удаления - заказ помечен, начислять некому
const d = (await one(`insert into players (login, password_hash, kind) values ('gone', 'x', 'airdef') returning id`)).id;
const dOld = await order('gems_100', d); await credit(dOld.id, 'ch-d0', PAY.gems_100.stars);
const dNew = await order('gems_100', d);
await db.query('delete from players where id = $1', [d]);
ok((await one('select player_id from airdef_orders where id = $1', [dOld.id])).player_id === null, 'удалён аккаунт - оплаченный заказ остался без игрока');
ok(await check(dNew.id, PAY.gems_100.stars) === 'no_player', 'счёт удалённого - не проходит проверку');
r = await credit(dNew.id, 'ch-d1', PAY.gems_100.stars);
ok(r.error === 'no_player' && (await one('select status from airdef_orders where id = $1', [dNew.id])).status === 'paid', 'оплата после удаления - заказ «paid» для возврата');

// права
for (const f of ['airdef_order_new(uuid,text,int,int,int)', 'airdef_pay_check(uuid,int)', 'airdef_pay_credit(uuid,text,int,bigint)', 'airdef_pay_refund(text)', 'airdef_prem_daily(uuid,date)', 'airdef_wallet_view(uuid)']) {
  const g = await one(`select has_function_privilege('anon', '${f}', 'execute') a, has_function_privilege('authenticated', '${f}', 'execute') u, has_function_privilege('service_role', '${f}', 'execute') s`);
  ok(!g.a && !g.u && g.s, `${f}: только service_role`);
}
const t = await one(`select has_table_privilege('anon', 'airdef_orders', 'select') a, has_table_privilege('authenticated', 'airdef_orders', 'select') u`);
ok(!t.a && !t.u, 'airdef_orders: не читается anon / authenticated');
console.log(bad ? `ОШИБОК: ${bad}` : 'итог: ошибок нет');
Deno.exit(bad ? 1 : 0);
