// Автопроверка онлайна «Мульти-волны» без браузера (AD_FAST=1 — короткая подготовка, бой ×4):
//   deno run --allow-net --allow-read --allow-env --allow-run game-server/airdef-multi-test.js
// Двое людей в комнате 1×1 (восток и запад), два раунда со сменой сторон: атакующий шлёт план (дроны, крылатые, баллистика по
// объекту), обороняющийся ставит ПВО. Проверяем: раунды и смена сторон, туман войны (атака не видит не засечённые комплексы,
// ПВО — не увиденное оружие), расписание атакующему, ускорение ×3, чат только своей команде, «Помощь», итог со счётом.
// Сервер запущен с секретом, вход — по билетам: итоги боя подписываются, и можно проверить их состав — в итоге своей комнаты нет rt (рейтинг
// только у быстрого боя), нигде нет поля op, есть ope (id соперников запечатаны), клиентам не уходят id чужих аккаунтов.
import { SECRET, ticket, readResult, pidOf } from './airdef-test-util.js';
import { unseal } from '../supabase/functions/_shared/airdef-seal.ts';
const PORT = 8798;
const srv = new Deno.Command('deno', { args: ['run', '--allow-net', '--allow-read', '--allow-env', new URL('./server.js', import.meta.url).pathname],
  env: { PORT: String(PORT), HOST: '127.0.0.1', AD_FAST: '1', MP_SECRET: SECRET }, stdout: 'piped', stderr: 'piped' }).spawn();
const ALLP = [1, 2, 3, 4, 5, 6].map(pidOf); let leaks = 0;
const results = []; const check = (n, ok) => { results.push([n, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(0, eval)(Deno.readTextFileSync(new URL('../tools/drone-headless/three.min.js', import.meta.url).pathname));
const { buildCity } = await import('../games/airdef/city.js');
const { freeGround } = await import('../games/airdef/mission.js');
const city = buildCity(1);
async function client(name, n) {
  for (let i = 0; i < 60; i++) {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ad`); const c = { ws, name, msgs: [], st: {} };
      await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
      ws.onmessage = (e) => { if (ALLP.some((id) => id !== pidOf(n) && e.data.includes(id))) leaks++; const m = JSON.parse(e.data); c.msgs.push(m); if (c.on) c.on(m); };
      c.send = (m) => ws.send(JSON.stringify(m));
      c.wait = async (f, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.msgs.find(f); if (m) return m; await sleep(50); } return null; };
      c.send({ t: 'hello', ticket: await ticket(pidOf(n), name) });
      const pi = setInterval(() => { if (ws.readyState === 1) c.send({ t: 'ping', i: 1 }); else clearInterval(pi); }, 2000); // как игра: пинг раз в 2 с (молчащее соединение сервер закрывает)
      return c;
    } catch (_) { await sleep(250); }
  }
  throw new Error('сервер не поднялся');
}
const objs = city.objects ? city.objects : null;
try {
  const A = await client('восток', 1), B = await client('запад', 2);
  // быстрый поиск «Мульти-волны» вдвоём (идёт параллельно, игроки бездействуют): итоги — с rt
  const Q1 = await client('быстрый1', 5), Q2 = await client('быстрый2', 6);
  await Q1.wait((m) => m.t === 'welcome'); await Q2.wait((m) => m.t === 'welcome');
  Q1.send({ t: 'queue', mode: 'arcade', kind: 'multi' }); Q2.send({ t: 'queue', mode: 'arcade', kind: 'multi' });
  await A.wait((m) => m.t === 'welcome'); await B.wait((m) => m.t === 'welcome');
  A.send({ t: 'create', kind: 'multi', mode: 'arcade', size: 1, era: 4, team: 'east', fill: false });
  const room = await A.wait((m) => m.t === 'room'); check('комната мульти создана', room && room.kind === 'multi');
  B.send({ t: 'join', code: room.code, team: 'west' });
  await B.wait((m) => m.t === 'room' && m.players.length === 2);
  A.send({ t: 'ready', on: true }); B.send({ t: 'ready', on: true });
  const rounds = [];
  for (let round = 1; round <= 2; round++) {
    const sA = await A.wait((m) => m.t === 'start' && m.round === round, 30000), sB = await B.wait((m) => m.t === 'start' && m.round === round, 30000);
    check(`раунд ${round}: старт у обоих`, sA && sB && sA.atk === sB.atk);
    if (!sA) break;
    const atk = sA.atk === 'east' ? A : B, def = atk === A ? B : A; rounds.push(sA.atk);
    // объекты: id из состояния сервера — военные (по ключам города)
    const st = await atk.wait((m) => m.t === 'state' && m.round === round);
    const tgtId = 3; // объект с id 3 (военный — по buildCity)
    // ПВО: несколько комплексов у центра (места — свободная земля)
    const keys = sA.atk === 'east' ? ['patriot', 'nasams', 'gepard', 'stinger'] : ['s400', 'pantsir', 'torm2', 'verba'];
    let placed = 0; for (let k = 0; k < 400 && placed < 6; k++) { const a = k * 2.399, d = 1500 + (k % 9) * 300, x = Math.cos(a) * d, z = Math.sin(a) * d; if (freeGround(city, x, z, 9)) { def.send({ t: 'buyUnit', k: keys[placed % keys.length], x, z }); placed++; await sleep(60); } }
    // чат: атакующий пишет своей команде — оборона не получает
    atk.send({ t: 'chat', text: 'Беру склад, иди нахуй' });
    // план: дроны, крылатые с носителя, баллистика — по одному объекту; ложные — на ПВО
    const plan = sA.atk === 'east'
      ? { n: { shahed: 4, kalibr: 2, kh55d: 2, iskander: 1 }, cfg: { shahed: { pts: [], units: [{ tgt: tgtId }, { tgt: tgtId }, { tgt: tgtId }, { tgt: tgtId }] }, kalibr: { pts: [], units: [{ tgt: tgtId }, { tgt: tgtId }] }, kh55d: { pts: [], units: [{ sam: true }, { sam: true }] }, iskander: { pts: [], units: [{ tgt: tgtId }] } } }
      : { n: { uav_w: 3, tomahawk: 2, quail: 2, atacms: 1 }, cfg: { uav_w: { pts: [], units: [{ tgt: tgtId }, { tgt: tgtId }, { tgt: tgtId }] }, tomahawk: { pts: [], units: [{ tgt: tgtId }, { tgt: tgtId }] }, quail: { pts: [], units: [{ sam: true }, { sam: true }] }, atacms: { pts: [], units: [{ tgt: tgtId }] } } };
    atk.send({ t: 'plan', json: JSON.stringify(plan) });
    await sleep(600);
    const chatA = await atk.wait((m) => m.t === 'chat' && m.round === undefined && m.text.includes('Беру'), 3000), chatD = def.msgs.find((m) => m.t === 'chat' && m.text.includes('Беру'));
    check(`раунд ${round}: чат — своей команде, мат скрыт`, chatA && !chatD && chatA.text.includes('*'));
    if (!chatA) console.log('  чат: у атаки', atk.msgs.filter((m) => m.t === 'chat' || m.t === 'deny' || m.t === 'room').slice(-3).map((m) => m.t + ':' + (m.state || m.text || m.msg)).join(' | '));
    const unitsSeenByDef = def.msgs.filter((m) => m.t === 'ev' && m.e.some((e) => e[0] === 'ua')).length;
    check(`раунд ${round}: ПВО видит свои комплексы (${placed} поставлено)`, unitsSeenByDef > 0);
    check(`раунд ${round}: атака расстановку не видит`, !atk.msgs.some((m) => m.t === 'ev' && m.e.some((e) => e[0] === 'ua') && m !== undefined && atk.msgs.indexOf(m) > atk.msgs.indexOf(sA)));
    atk.send({ t: 'ready', on: true }); def.send({ t: 'ready', on: true });
    def.send({ t: 'help', p: [100, 200] });
    // докупка в бою: +1 дрон на ту же цель — в расписании не пущен, пуск ≈ через 30 с
    const sc0 = await atk.wait((m) => m.t === 'sched', 60000), dk = sA.atk === 'east' ? 'shahed' : 'uav_w', n0 = plan.n[dk];
    plan.n[dk] = n0 + 1; plan.cfg[dk].units.push({ tgt: tgtId }); atk.send({ t: 'plan', json: JSON.stringify(plan) });
    const sc1 = await atk.wait((m) => m.t === 'sched' && m.u[dk] && m.u[dk].length === n0 + 1, 15000), nu = sc1 && sc1.u[dk][n0];
    check(`раунд ${round}: докупка в бою — новая единица ждёт ≈ 30 с (${nu ? JSON.stringify(nu) + ' при T ' + sc1.T : 'нет'})`, nu && nu[0] === 0 && nu[1] - sc0.T > 25);
    const end = await A.wait((m) => m.t === 'roundEnd' && m.round === round, 400000);
    check(`раунд ${round}: итог раунда (разрушено ${end ? end.value : '?'} из ${end ? end.v0 : '?'}, ${end ? end.why : ''})`, !!end);
    const snapsA = atk.msgs.filter((m) => m.t === 's'), snapsD = def.msgs.filter((m) => m.t === 's');
    const wA = Math.max(0, ...snapsA.map((m) => m.W.length)), wD = Math.max(0, ...snapsD.map((m) => m.W.length));
    check(`раунд ${round}: снимки обеим сторонам (атака ${snapsA.length}, ПВО ${snapsD.length})`, snapsA.length > 10 && snapsD.length > 10);
    check(`раунд ${round}: атака видит своё оружие (до ${wA}), ПВО — меньше или столько же (до ${wD})`, wA > 0 && wD <= wA);
    check(`раунд ${round}: атака видит только засечённые комплексы`, snapsA.every((m) => m.U.length <= placed));
    check(`раунд ${round}: расписание атакующему`, atk.msgs.some((m) => m.t === 'sched' && m.ev.length) && !def.msgs.some((m) => m.t === 'sched'));
    check(`раунд ${round}: было ускорение ×3`, snapsA.some((m) => m.k === 3));
    check(`раунд ${round}: «Помощь» — своей команде`, def.msgs.some((m) => m.t === 'help') && !atk.msgs.some((m) => m.t === 'help'));
    check(`раунд ${round}: носитель виден атаке`, snapsA.some((m) => m.A.length > 0) && snapsD.every((m) => m.A.length === 0));
    for (const c of [A, B]) c.msgs.length = 0;
  }
  check('смена сторон между раундами', rounds.length === 2 && rounds[0] !== rounds[1]);
  const endA = await A.wait((m) => m.t === 'end', 30000);
  check(`итог боя: счёт восток ${endA ? endA.scores.east : '?'} / запад ${endA ? endA.scores.west : '?'}, победил ${endA ? endA.winner : '?'}`, endA && endA.kind === 'multi' && endA.players.length === 2);
  { const R = endA && endA.result ? await readResult(endA.result) : null;
    check('итог своей комнаты: подписан, без rt, без op', !!R && R.p === pidOf(1) && R.mm === 1 && !('rt' in R) && !('op' in R));
    check(`итог: u.sm — ЗРК, стоявшие в раунде за ПВО, вылетов нет (налёт ведёт ИИ) — ${R && JSON.stringify(R.u)}`, !!R && !!R.u && Array.isArray(R.u.sm) && R.u.sm.length >= 1 && !R.u.fl);
    const got = R && R.ope ? await unseal(R.ope, SECRET) : null;
    check('итог своей комнаты: ope открывается в соперника-человека, не читается чужим ключом', !!got && got.length === 1 && got[0] === pidOf(2) && (await unseal(R.ope, 'чужой')).length === 0 && !JSON.stringify(R).includes(pidOf(2))); }
  // ── 2×2 с ботами: бот-атакующий собирает план (сводка союзнику), бот-ПВО ставит комплексы; их волна долетает
  const P = await client('бот-союзник', 3), Q = await client('бот-соперник', 4);
  await P.wait((m) => m.t === 'welcome'); await Q.wait((m) => m.t === 'welcome');
  P.send({ t: 'create', kind: 'multi', mode: 'real', size: 2, era: 3, team: 'east', fill: true });
  const r2 = await P.wait((m) => m.t === 'room' && m.kind === 'multi'); Q.send({ t: 'join', code: r2.code, team: 'west' });
  await Q.wait((m) => m.t === 'room' && m.players.length >= 2); P.send({ t: 'ready', on: true }); Q.send({ t: 'ready', on: true });
  const s2 = await P.wait((m) => m.t === 'start' && m.kind === 'multi', 20000);
  const atkC = s2 && s2.atk === 'east' ? P : Q; let defC = atkC === P ? Q : P;
  const view = await atkC.wait((m) => m.t === 'room' && m.allies && m.allies.some((a) => a.cost > 0), 8000);
  check(`2×2 с ботами: бот-атакующий собрал план (${view ? view.allies.map((a) => a.name + ' ' + a.cost).join(', ') : '—'})`, !!view);
  const botUnits = await defC.wait((m) => m.t === 'ev' && m.e.some((e) => e[0] === 'ua'), 8000);
  check('2×2 с ботами: бот-ПВО поставил комплексы', !!botUnits);
  // фильтр целей комплекса: ПВО покупает, ставит фильтр (с мусором в списке); чужая команда фильтр не меняет; вернулся тем же аккаунтом — в состоянии фильтр на месте
  {
    let x0 = 0, z0 = 0; for (let k = 0; k < 400; k++) { const a = k * 2.399, d = 1500 + (k % 9) * 300, x = Math.cos(a) * d, z = Math.sin(a) * d; if (freeGround(city, x, z, 9)) { x0 = x; z0 = z; break; } }
    defC.send({ t: 'buyUnit', k: s2.atk === 'east' ? 'hawk' : 's75', x: x0, z: z0 }); // стартовый комплекс (в «Реализме» купленное в исследованиях)
    const ua = await defC.wait((m) => m.t === 'ev' && m.e.some((e) => e[0] === 'ua' && Math.abs(e[3] - x0) < 1 && Math.abs(e[4] - z0) < 1), 5000), id = ua && ua.e.find((e) => e[0] === 'ua' && Math.abs(e[3] - x0) < 1)[1];
    if (!id) console.log('  фильтр целей: комплекс не куплен', JSON.stringify(defC.msgs.filter((m) => m.t === 'deny').slice(-2)));
    if (id) { atkC.send({ t: 'tgt', id, c: ['bomb'] }); defC.send({ t: 'tgt', id, c: ['drone', 'zzz', 'cruise'] }); }
    await sleep(500);
    const defC2 = await client(defC.name, defC === P ? 3 : 4), st2 = await defC2.wait((m) => m.t === 'state' && m.kind === 'multi', 8000), row = st2 && st2.units.find((u) => u[0] === id);
    check(`фильтр целей: после возврата у комплекса — drone, cruise (${row ? JSON.stringify(row[8]) : 'нет состояния'})`, !!row && Array.isArray(row[8]) && row[8].length === 2 && row[8].includes('drone') && row[8].includes('cruise'));
    check('фильтр целей: у бота-комплексов фильтра нет', !!st2 && st2.units.filter((u) => u[0] !== id).every((u) => !u[8]));
    defC.ws.close(); defC = defC2;
  }
  atkC.send({ t: 'ready', on: true }); defC.send({ t: 'ready', on: true });
  const e2 = await atkC.wait((m) => m.t === 'roundEnd', 400000);
  check(`2×2 с ботами: раунд с волной бота прошёл (разрушено ${e2 ? e2.value : '?'})`, !!e2 && atkC.msgs.some((m) => m.t === 's' && m.W.length > 0));
  // итоги быстрого боя «Мульти-волны» (двое в очереди): есть rt, ope — один соперник-человек
  const qa = await Q1.wait((m) => m.t === 'end', 300000), qb = await Q2.wait((m) => m.t === 'end', 60000);
  const Ra = qa && qa.result ? await readResult(qa.result) : null, Rb = qb && qb.result ? await readResult(qb.result) : null;
  check('быстрый бой «Мульти-волны»: итог пришёл обоим, с rt и без op', !!Ra && !!Rb && !!Ra.rt && !!Rb.rt && typeof Ra.rt.r === 'number' && !('op' in Ra) && !('op' in Rb));
  check('быстрый бой «Мульти-волны»: ope открывается в соперника', !!Ra && !!Rb && JSON.stringify(await unseal(Ra.ope, SECRET)) === JSON.stringify([pidOf(6)]) && JSON.stringify(await unseal(Rb.ope, SECRET)) === JSON.stringify([pidOf(5)]));
  check(`клиентам не уходят id чужих аккаунтов (совпадений: ${leaks})`, leaks === 0);
} catch (e) { console.log('ОШИБКА', e && e.stack || e); check('без исключений', false); }
srv.kill();
const out = new TextDecoder().decode((await srv.output()).stderr).split('\n').filter((l) => /ошибка|Error/i.test(l)).slice(0, 8);
if (out.length) { console.log('сервер:', out.join('\n')); check('сервер без ошибок', false); }
const bad = results.filter(([, ok]) => !ok); console.log(bad.length ? `ИТОГ: ошибок ${bad.length}` : 'ИТОГ: всё прошло'); Deno.exit(bad.length ? 1 : 0);
