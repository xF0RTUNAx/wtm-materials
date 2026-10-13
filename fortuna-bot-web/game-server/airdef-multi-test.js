// Автопроверка онлайна «Мульти-волны» без браузера (AD_FAST=1 — короткая подготовка, бой ×4):
//   deno run --allow-net --allow-read --allow-env --allow-run game-server/airdef-multi-test.js
// Двое людей в комнате 1×1 (восток и запад), два раунда со сменой сторон: атакующий шлёт план (дроны, крылатые, баллистика по
// объекту), обороняющийся ставит ПВО. Проверяем: раунды и смена сторон, туман войны (атака не видит не засечённые комплексы,
// ПВО — не увиденное оружие), расписание атакующему, ускорение ×3, чат только своей команде, «Помощь», итог со счётом.
const PORT = 8798;
const srv = new Deno.Command('deno', { args: ['run', '--allow-net', '--allow-read', '--allow-env', new URL('./server.js', import.meta.url).pathname],
  env: { PORT: String(PORT), HOST: '127.0.0.1', AD_FAST: '1' }, stdout: 'piped', stderr: 'piped' }).spawn();
const results = []; const check = (n, ok) => { results.push([n, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + n); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(0, eval)(Deno.readTextFileSync(new URL('../tools/drone-headless/three.min.js', import.meta.url).pathname));
const { buildCity } = await import('../games/airdef/city.js');
const { freeGround } = await import('../games/airdef/mission.js');
const city = buildCity(1);
async function client(name) {
  for (let i = 0; i < 60; i++) {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ad`); const c = { ws, name, msgs: [], st: {} };
      await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
      ws.onmessage = (e) => { const m = JSON.parse(e.data); c.msgs.push(m); if (c.on) c.on(m); };
      c.send = (m) => ws.send(JSON.stringify(m));
      c.wait = async (f, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.msgs.find(f); if (m) return m; await sleep(50); } return null; };
      c.send({ t: 'hello', name, pid: 'test-' + name });
      const pi = setInterval(() => { if (ws.readyState === 1) c.send({ t: 'ping', i: 1 }); else clearInterval(pi); }, 2000); // как игра: пинг раз в 2 с (молчащее соединение сервер закрывает)
      return c;
    } catch (_) { await sleep(250); }
  }
  throw new Error('сервер не поднялся');
}
const objs = city.objects ? city.objects : null;
try {
  const A = await client('восток'), B = await client('запад');
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
  // ── 2×2 с ботами: бот-атакующий собирает план (сводка союзнику), бот-ПВО ставит комплексы; их волна долетает
  const P = await client('бот-союзник'), Q = await client('бот-соперник');
  await P.wait((m) => m.t === 'welcome'); await Q.wait((m) => m.t === 'welcome');
  P.send({ t: 'create', kind: 'multi', mode: 'real', size: 2, era: 3, team: 'east', fill: true });
  const r2 = await P.wait((m) => m.t === 'room' && m.kind === 'multi'); Q.send({ t: 'join', code: r2.code, team: 'west' });
  await Q.wait((m) => m.t === 'room' && m.players.length >= 2); P.send({ t: 'ready', on: true }); Q.send({ t: 'ready', on: true });
  const s2 = await P.wait((m) => m.t === 'start' && m.kind === 'multi', 20000);
  const atkC = s2 && s2.atk === 'east' ? P : Q, defC = atkC === P ? Q : P;
  const view = await atkC.wait((m) => m.t === 'room' && m.allies && m.allies.some((a) => a.cost > 0), 8000);
  check(`2×2 с ботами: бот-атакующий собрал план (${view ? view.allies.map((a) => a.name + ' ' + a.cost).join(', ') : '—'})`, !!view);
  const botUnits = await defC.wait((m) => m.t === 'ev' && m.e.some((e) => e[0] === 'ua'), 8000);
  check('2×2 с ботами: бот-ПВО поставил комплексы', !!botUnits);
  atkC.send({ t: 'ready', on: true }); defC.send({ t: 'ready', on: true });
  const e2 = await atkC.wait((m) => m.t === 'roundEnd', 400000);
  check(`2×2 с ботами: раунд с волной бота прошёл (разрушено ${e2 ? e2.value : '?'})`, !!e2 && atkC.msgs.some((m) => m.t === 's' && m.W.length > 0));
} catch (e) { console.log('ОШИБКА', e && e.stack || e); check('без исключений', false); }
srv.kill();
const out = new TextDecoder().decode((await srv.output()).stderr).split('\n').filter((l) => /ошибка|Error/i.test(l)).slice(0, 8);
if (out.length) { console.log('сервер:', out.join('\n')); check('сервер без ошибок', false); }
const bad = results.filter(([, ok]) => !ok); console.log(bad.length ? `ИТОГ: ошибок ${bad.length}` : 'ИТОГ: всё прошло'); Deno.exit(bad.length ? 1 : 0);
