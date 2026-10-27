// Проверка sql/028_airdef_shop.sql без боевой базы (PGlite, как season-sql-test.js): магазин окрасок — купить за кристаллы, взять «на выбор»,
// надеть и снять; чужую, «будущую» и уже свою окраску не купить, кристаллы в минус не уходят, повторное нажатие не списывает дважды; права.
//   deno run -A tools/airdef-headless/shop-sql-test.js
import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
import { CAMO_PRICE, camosOut } from '../../games/airdef/arsenal.js';
const SQL = new URL('../../sql/', import.meta.url).pathname;
const db = new PGlite();
let bad = 0; const ok = (c, t) => { console.log((c ? 'OK   ' : 'ОШИБКА ') + t); if (!c) bad++; };
const one = async (q, p = []) => (await db.query(q, p)).rows[0];

await db.exec(`create role service_role; create role anon; create role authenticated;
  create table players (id uuid primary key default gen_random_uuid(), login text unique not null, password_hash text not null, full_name text,
    created_at timestamptz not null default now(), last_seen timestamptz not null default now());`);
for (const f of ['020_airdef_online.sql', '021_airdef_progress.sql', '022_airdef_accounts_rating.sql', '024_airdef_season_rewards.sql', '025_airdef_rating_slots.sql', '027_airdef_offseason.sql', '028_airdef_shop.sql']) await db.exec(Deno.readTextFileSync(SQL + f));
await db.exec(Deno.readTextFileSync(SQL + '028_airdef_shop.sql')); // повторно — без ошибок
ok(true, 'миграции 020…028 (и 028 повторно) применились');

const CAT = camosOut(1), [A, B] = CAT;
ok(CAMO_PRICE === 150 && A === 'e_f15e:inferno' && B === 'e_mig31:dragon', `каталог сезона 1: ${CAT.join(', ')}, цена ${CAMO_PRICE}`);
const p = (await one(`insert into players (login, password_hash, kind) values ('pilot', 'x', 'airdef') returning id`)).id;
const buy = (k, pr = CAMO_PRICE, cat = CAT) => one('select airdef_shop_buy($1, $2, $3, $4) r', [p, k, pr, cat]).then((x) => x.r);
const pick = (k, cat = CAT) => one('select airdef_shop_pick($1, $2, $3) r', [p, k, cat]).then((x) => x.r);
const wear = (pl, sk) => one('select airdef_shop_wear($1, $2, $3) r', [p, pl, sk]).then((x) => x.r);
const view = () => one('select airdef_wallet_view($1) r', [p]).then((x) => x.r);

let v = await view();
ok(v.crystals === 0 && v.camos.length === 0 && v.picks === 0 && JSON.stringify(v.worn) === '{}', 'кошелька нет — пустой вид');
ok((await buy(A)).error === 'no_crystals', 'без кристаллов не купить');
await db.query('update airdef_wallet set crystals = 320 where player_id = $1', [p]);
ok((await buy('e_f35:sakura')).error === 'not_sold', 'окраска не из магазина (не вышла) — не купить');
let r = await buy(A);
ok(r.wallet && r.wallet.crystals === 170 && r.wallet.camos.includes(A), `купить ${A}: 320 → ${r.wallet && r.wallet.crystals}`);
ok((await buy(A)).error === 'owned', 'свою — второй раз не купить (кристаллы не списаны)');
ok((await view()).crystals === 170, 'после отказа кристаллов столько же');
r = await buy(B);
ok(r.wallet && r.wallet.crystals === 20 && r.wallet.camos.length === 2, 'вторая покупка: 170 → 20');
await db.query('update airdef_wallet set camos = $2, crystals = 100 where player_id = $1', [p, [A]]);
ok((await buy(B)).error === 'no_crystals' && (await view()).crystals === 100, 'не хватает — отказ, в минус не уходит');
// два нажатия сразу (обе в одной транзакции не проверить; проверяем, что второе после первого — «уже своя»)
await db.query('update airdef_wallet set crystals = 300 where player_id = $1', [p]);
const [x1, x2] = [await buy(B), await buy(B)];
ok(x1.wallet && x2.error === 'owned' && (await view()).crystals === 150, 'повторное нажатие «Купить» не списывает дважды');
// на выбор
await db.query('update airdef_wallet set camos = $2, picks = 0 where player_id = $1', [p, [A]]);
ok((await pick(B)).error === 'no_pick', 'без «на выбор» не взять');
await db.query('update airdef_wallet set picks = 1 where player_id = $1', [p]);
ok((await pick(A)).error === 'owned', '«на выбор» — свою не взять, выбор не сгорает');
r = await pick(B);
ok(r.wallet && r.wallet.picks === 0 && r.wallet.camos.includes(B) && r.wallet.crystals === 150, 'взять на выбор: picks 1 → 0, кристаллы те же');
ok((await pick('e_tu22:milk')).error === 'not_sold', '«на выбор» — только из магазина');
// надеть / снять
ok((await wear('e_f35', 'sakura')).error === 'not_owned', 'чужую окраску не надеть');
r = await wear('e_f15e', 'inferno');
ok(r.wallet && r.wallet.worn.e_f15e === 'inferno', 'надеть «Инферно» на F-15E');
r = await wear('e_mig31', 'dragon');
ok(r.wallet && r.wallet.worn.e_f15e === 'inferno' && r.wallet.worn.e_mig31 === 'dragon', 'вторая — на другой самолёт, первая на месте');
r = await wear('e_f15e', null);
ok(r.wallet && !('e_f15e' in r.wallet.worn) && r.wallet.worn.e_mig31 === 'dragon', 'снять с F-15E');
let threw = false; try { await wear("x'; drop", null); } catch (_) { threw = true; }
ok(threw, 'имя самолёта проверяется');
threw = false; try { await buy(A, 0); } catch (_) { threw = true; }
ok(threw, 'нулевая цена — ошибка');
// права
for (const f of ['airdef_shop_buy(uuid,text,int,text[])', 'airdef_shop_pick(uuid,text,text[])', 'airdef_shop_wear(uuid,text,text)', 'airdef_wallet_view(uuid)']) {
  const g = await one(`select has_function_privilege('anon', '${f}', 'execute') a, has_function_privilege('authenticated', '${f}', 'execute') u, has_function_privilege('service_role', '${f}', 'execute') s`);
  ok(!g.a && !g.u && g.s, `${f}: только service_role`);
}
console.log(bad ? `ОШИБОК: ${bad}` : 'итог: ошибок нет');
Deno.exit(bad ? 1 : 0);
