// Тест серверной прокачки «Воздушного превосходства» (supabase/functions/_shared/airdef-progress.ts) на поддельной базе:
// действия, начисление за бой, пределы одиночной игры, «Реализм» без купленного, гонка двух запросов (версия строки),
// и что копия правил в _shared/airdef совпадает с игрой (sync-shared.js).
//   deno run -A tools/airdef-headless/progress-server-test.js
import { act, credit, cleanEvents, mutate, load, toProgress, extraOf, view } from '../../supabase/functions/_shared/airdef-progress.ts';
import { unseal } from '../../supabase/functions/_shared/airdef-seal.ts';
import { NODE, TREE, START, SOLO_DAY } from '../../supabase/functions/_shared/airdef/progress.js';
import { FILES, OUT, ROOT, shared } from './sync-shared.js';

let fails = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++; };

// 0. копии правил — свежие
for (const [from, to] of FILES) ok(`копия ${to} совпадает с ${from}`, Deno.readTextFileSync(OUT + to) === shared(Deno.readTextFileSync(ROOT + from)), 'запустите sync-shared.js');

// поддельная база: таблицы players / airdef_progress, rpc airdef_progress_save (версия как в SQL)
function fakeDb(extra = {}) {
  const T = { players: [{ id: 'p-0000001' }], airdef_progress: [], airdef_mp_results: [], ...extra };
  const q = (table) => {
    let head = false; const f = []; const api = {
      select(_c, o) { head = !!(o && o.head); return api; }, eq(k, v) { f.push([k, v]); return api; },
      then(res, rej) { return Promise.resolve({ data: null, error: null, count: head ? T[table].filter((x) => f.every(([k, v]) => x[k] === v)).length : null }).then(res, rej); }, // select(…, { count, head }) → { count }
      maybeSingle() { const r = T[table].find((x) => f.every(([k, v]) => x[k] === v)); return Promise.resolve({ data: r ? structuredClone(r) : null, error: null }); },
    }; return api;
  };
  const db = {
    T, delay: null,
    from: q,
    async rpc(name, a) {
      if (name !== 'airdef_progress_save') throw new Error(name);
      if (db.delay) await db.delay();
      const rows = T.airdef_progress, cur = rows.find((r) => r.player_id === a.p_player_id);
      if (a.p_xp < 0 || a.p_silver < 0) return { data: null, error: new Error('negative') };
      const vals = { xp: a.p_xp, silver: a.p_silver, res: a.p_res, own: a.p_own, goal: a.p_goal, first_win_day: a.p_first_win_day, solo_day: a.p_solo_day, solo_xp: a.p_solo_xp };
      if (a.p_version === 0) { if (cur) return { data: -1, error: null }; rows.push({ player_id: a.p_player_id, ...structuredClone(vals), version: 1 }); return { data: 1, error: null }; }
      if (!cur || cur.version !== a.p_version) return { data: -1, error: null };
      Object.assign(cur, structuredClone(vals), { version: cur.version + 1 }); return { data: cur.version, error: null };
    },
  };
  return db;
}
const PID = 'p-0000001', DAY = '2026-10-20';
const db = fakeDb();

// 1. нет строки — пустое состояние; несуществующий игрок
{ const o = await mutate(db, 'p-nobody', () => ({ ok: true })); ok('чужой игрок — notFound', o.notFound === true); }
// 2. исследовать без опыта — отказ, ничего не сохранено
const r1 = 'air:e_su7b'; // начало линии ранга I (Су-17 — после него)
{ const o = await mutate(db, PID, (P) => act(P, 'research', r1)); ok('исследовать без опыта — нельзя', !o.ok && /опыта/.test(o.why), o.why); ok('строка не создана', db.T.airdef_progress.length === 0); }
// 3. бой: 10 минут, 2 цели, вернулся — опыт = серебро
const ev = cleanEvents({ targets: [1, 1.5], sams: 1, back: true, win: true, min: 999 }, 10);
ok('длительность — по серверу (10 мин), не по браузеру', ev.min === 10);
let o = await mutate(db, PID, (P, x) => { const c = credit(P, x, ev, { real: false, online: false, today: DAY }); globalThis.c1 = c; return { ok: true, extra: c.extra }; });
ok('начислено', o.ok && o.P.xp > 0 && o.P.xp === o.P.silver, `опыт ${o.P.xp}`);
ok('первая победа дня ×2', globalThis.c1.reward.mult.some(([n]) => /Первая победа/.test(n)));
const xp1 = o.P.xp;
// 4. второй бой тот же день — без ×2
o = await mutate(db, PID, (P, x) => { const c = credit(P, x, ev, { real: false, online: false, today: DAY }); globalThis.c2 = c; return { ok: true, extra: c.extra }; });
ok('вторая победа — без ×2', !globalThis.c2.reward.mult.some(([n]) => /Первая победа/.test(n)) && globalThis.c2.reward.xp < globalThis.c1.reward.xp);
// 5. «Реализм» на некупленном самолёте — множителя нет
{ const P = toProgress(db.T.airdef_progress[0]), x = extraOf(db.T.airdef_progress[0]);
  const a = credit(structuredClone(P), x, ev, { real: true, online: false, today: DAY, used: ['air:e_su24'] });
  const b = credit(structuredClone(P), x, ev, { real: true, online: false, today: DAY, used: ['air:e_su17', 'wpn:fab500'] });
  ok('Реализм на некупленном — как Аркада', !a.realOk && !a.reward.mult.some(([n]) => n === 'Реализм'));
  ok('Реализм на стартовом — ×1,5', b.realOk && b.reward.mult.some(([n]) => n === 'Реализм') && b.reward.xp > a.reward.xp); }
// 6. исследовать и купить; паритет покупки
{ db.T.airdef_progress[0].xp = 50000; db.T.airdef_progress[0].silver = 50000; }
o = await mutate(db, PID, (P) => act(P, 'research', r1)); ok('исследовано за опыт', o.ok && o.P.res.includes(r1) && o.P.xp === 50000 - NODE[r1].cost);
o = await mutate(db, PID, (P) => act(P, 'buy', r1)); ok('куплено за серебро', o.ok && o.P.own.includes(r1));
o = await mutate(db, PID, (P) => act(P, 'buy', r1)); ok('второй раз не купить', !o.ok);
o = await mutate(db, PID, (P) => act(P, 'research', 'air:e_su34')); ok('ранг III без паритета — нельзя', !o.ok && /паритет/.test(o.why), o.why);
o = await mutate(db, PID, (P) => act(P, 'research', 'air:nope')); ok('нет такой единицы', !o.ok);
// 7. цель ветки: исследуется сама, когда хватает опыта
{ const g = 'wpn:fab100'; db.T.airdef_progress[0].xp = 0;
  o = await mutate(db, PID, (P) => act(P, 'goal', g, 'wpn')); ok('цель выбрана', o.ok && o.P.goal.wpn === g);
  o = await mutate(db, PID, (P) => act(P, 'goal', g, 'air')); ok('цель чужой ветки — нельзя', !o.ok);
  o = await mutate(db, PID, (P, x) => { const c = credit(P, x, cleanEvents({ targets: [2, 2, 2], sams: 3 }, 15), { real: false, online: true, today: DAY }); globalThis.c3 = c; return { ok: true, extra: c.extra }; });
  ok('цель исследована за бой', globalThis.c3.auto.includes(g) && o.P.res.includes(g) && !o.P.goal.wpn); }
// 8. дневной предел (все бои): после SOLO_DAY (= DAY_FULL) — ×0,3
{ const P = toProgress(null), x = { first_win_day: DAY, solo_day: DAY, solo_xp: SOLO_DAY };
  const big = cleanEvents({ targets: Array(30).fill(2), sams: 30, samsLong: 10 }, 15);
  const a = credit(structuredClone(P), x, big, { real: false, online: false, today: DAY });
  const b = credit(structuredClone(P), { ...x, solo_xp: 0 }, big, { real: false, online: false, today: DAY });
  ok('после суточного предела — ×0,3', a.reward.xp < b.reward.xp && a.reward.xp > 0, `${a.reward.xp} против ${b.reward.xp}`);
  const c = credit(structuredClone(P), x, big, { real: false, online: false, today: '2026-10-21' }); ok('новые сутки — предел сброшен', c.reward.xp >= b.reward.xp); }
// 9. события — в пределах; короткий бой — мало опыта
{ const e = cleanEvents({ targets: Array(100).fill(9), sams: 1e9, kills: -5, waves: [99] }, 0.5);
  ok('пределы событий', e.targets.length === 30 && e.targets[0] === 2 && e.sams === 30 && e.kills === 0 && e.waves[0] === 12);
  const r = credit(toProgress(null), extraOf(null), e, { real: false, online: false, today: DAY });
  ok('полминуты боя — не больше предела на минуту', r.reward.xp <= 400 * 2, `${r.reward.xp}`); }
// 10. гонка: два начисления одновременно — оба учтены ровно один раз
{ const before = db.T.airdef_progress[0].xp; let gate = 0;
  db.delay = () => new Promise((res) => setTimeout(res, gate++ === 0 ? 30 : 0));
  const add = (n) => mutate(db, PID, (P) => { P.xp += n; return { ok: true }; });
  await Promise.all([add(100), add(7)]); db.delay = null;
  ok('гонка двух запросов — сумма верная', db.T.airdef_progress[0].xp === before + 107, `${db.T.airdef_progress[0].xp - before}`); }
// 11. неизвестные узлы в базе отбрасываются; стартовые не хранятся
{ const P = toProgress({ xp: 5, silver: 5, res: ['air:старый'], own: [START.air[0] && 'air:' + START.air[0]], goal: { air: 'pvo:s75' } });
  ok('чужая цель ветки и неизвестный узел — отброшены', P.res.length === 0 && !P.goal.air); }
ok('дерево на сервере — то же', TREE.length > 100);
const v = view(toProgress(db.T.airdef_progress[0]), extraOf(db.T.airdef_progress[0]), DAY); ok('состояние для клиента', typeof v.xp === 'number' && v.first_win_today === true);
// 12. онлайн (игровой сервер): замки «Реализма» по билету и эпоха быстрой комнаты
{ const { adProgress, adRank, realDeny, loadoutIds, samIds, strikeIds, quickEra } = await import('../../game-server/airdef-own.js');
  const { LOADOUTS } = await import('../../games/airdef/arsenal.js');
  const newbie = { adP: adProgress([]) }, dev = { adP: adProgress(null) };
  const L1 = LOADOUTS[1].find((L) => L.plane === 'e_su17'), L2 = LOADOUTS[2].find((L) => L.plane === 'e_su24');
  ok('новичок: стартовая подвеска — можно', !realDeny('real', newbie, loadoutIds(L1)));
  ok('новичок: подвеска II — нельзя', !!realDeny('real', newbie, loadoutIds(L2)), realDeny('real', newbie, loadoutIds(L2)));
  ok('аркада — без замков', !realDeny('arcade', newbie, loadoutIds(L2)));
  ok('разработка (без билета) — без замков', !realDeny('real', dev, loadoutIds(L2)));
  ok('комплекс: стартовый / нет', !realDeny('real', newbie, samIds('s75')) && !!realDeny('real', newbie, samIds('s300')));
  ok('удар по ключу JASSM — узел jassm_s', strikeIds({ jassm: 2, r17: 1, kh55: 0 }).join() === 'strike:jassm_s,strike:r17');
  ok('ранг новичка — I', adRank(newbie.adP) === 1 && adRank(null) === 4);
  ok('эпоха быстрой комнаты «Реализма» — по самому младшему', [...Array(20)].every(() => quickEra('real', [newbie, dev]) === 1) && quickEra('arcade', [newbie]) === null);
  ok('«Мульти-волна» — не ниже II', quickEra('real', [newbie], 2) === 2); }
// 13. правило «только аккаунт игры» (Mark 2026-10-25): аккаунт сайта без прогресса игры — needGame; с прогрессом или боями — работает как раньше
{ const ndb = fakeDb({ players: [{ id: 'p-game001', kind: 'airdef' }, { id: 'p-site-new', kind: 'site' }, { id: 'p-site-res', kind: 'site' }, { id: 'p-site-prog', kind: 'site' }],
    airdef_mp_results: [{ player_id: 'p-site-res', match_id: 'm1' }] });
  ndb.T.airdef_progress.push({ player_id: 'p-site-prog', xp: 100, silver: 50, res: [], own: [], goal: {}, first_win_day: null, solo_day: null, solo_xp: 0, version: 1 });
  const l0 = await load(ndb, 'p-site-new'); ok('сайт без прогресса и без боёв — needGame', l0.exists && l0.needGame === true && l0.row === null);
  const o0 = await mutate(ndb, 'p-site-new', (P, x) => { const c = credit(P, x, cleanEvents({ sams: 3, win: true }, 10), { real: false, online: true, today: DAY }); return { ok: true, extra: c.extra }; });
  ok('начислить за бой новичку с аккаунтом сайта — отказ needGame, строка не создана', !o0.ok && o0.needGame === true && !ndb.T.airdef_progress.some((r) => r.player_id === 'p-site-new'));
  const o0b = await mutate(ndb, 'p-site-new', (P) => act(P, 'goal', 'wpn:fab100', 'wpn')); ok('действие прокачки (цель) для такого — needGame', !o0b.ok && o0b.needGame === true);
  const l1 = await load(ndb, 'p-site-res'); ok('сайт с онлайн-боями (без строки прокачки) — можно', l1.exists && !l1.needGame);
  const o1 = await mutate(ndb, 'p-site-res', (P, x) => { const c = credit(P, x, cleanEvents({ sams: 3, win: true }, 10), { real: false, online: true, today: DAY }); return { ok: true, extra: c.extra }; });
  ok('сайт с боями: опыт начислен, строка создана', o1.ok && o1.P.xp > 0 && ndb.T.airdef_progress.some((r) => r.player_id === 'p-site-res'));
  const l2 = await load(ndb, 'p-site-prog'); ok('сайт со строкой прокачки — можно', l2.exists && !l2.needGame && l2.row.xp === 100);
  const o2 = await mutate(ndb, 'p-site-prog', (P, x) => { P.xp += 5; return { ok: true }; }); ok('сайт с прогрессом: действие проходит', o2.ok && o2.P.xp === 105);
  const l3 = await load(ndb, 'p-game001'); ok('аккаунт игры без прогресса — можно (kind = airdef)', l3.exists && !l3.needGame);
  const o3 = await mutate(ndb, 'p-game001', (P, x) => { P.xp += 7; return { ok: true }; }); ok('аккаунт игры: действие проходит, строка создана', o3.ok && ndb.T.airdef_progress.some((r) => r.player_id === 'p-game001'));
  const l4 = await load(ndb, 'p-nobody'); ok('несуществующий игрок — exists false', !l4.exists && !l4.needGame);
}
// 14. запечатанный список соперников (ope): независимая сборка по описанию формата → unseal читает; испорченное — пусто
{ const secret = 'test-secret', enc = new TextEncoder();
  const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode('airdef-op:' + secret)), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(['id-1', 'id-2', 5]))));
  const sealed = b64(new Uint8Array([...iv, ...ct]));
  ok('unseal: читает запечатанный список (нестроки отбрасываются)', JSON.stringify(await unseal(sealed, secret)) === '["id-1","id-2"]');
  ok('unseal: чужой секрет — пусто', (await unseal(sealed, 'other')).length === 0);
  ok('unseal: испорченное / пустое / не строка — пусто, без исключений', (await unseal(sealed.slice(0, -4) + 'AAAA', secret)).length === 0 && (await unseal('', secret)).length === 0 && (await unseal(undefined, secret)).length === 0 && (await unseal({ a: 1 }, secret)).length === 0 && (await unseal('!!!', secret)).length === 0);
  ok('unseal: старое поле op (голый список) не читается', (await unseal(['id-1'], secret)).length === 0);
}
console.log(fails ? `\nИТОГ: ошибок ${fails}` : '\nИТОГ: всё прошло');
if (fails) Deno.exit(1);
