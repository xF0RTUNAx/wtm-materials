// Автопроверка онлайна «Воздушного превосходства» без браузера: поднимает сервер на :8797 и играет двумя клиентами.
//   deno run --allow-net --allow-read --allow-env --allow-run game-server/airdef-smoke.js
// Лётчик создаёт комнату 1×1 (эпоха II, авиация — запад), второй входит за ПВО; оба «Готов» → расстановка: ПВО ставит
// комплекс у цели, лётчик берёт связку; волна: лётчик летит к цели, ставит подсвет, сбрасывает оружие и ЛТЦ.
// Ждём снимки с самолётом и комплексом, события сброса и подрывов. В конце — PASS/FAIL по пунктам.
const PORT = 8797;
const srv = new Deno.Command('deno', { args: ['run', '--allow-net', '--allow-read', '--allow-env', new URL('./server.js', import.meta.url).pathname],
  env: { PORT: String(PORT), HOST: '127.0.0.1' }, stdout: 'piped', stderr: 'piped' }).spawn();
const results = [];
const check = (name, ok) => { results.push([name, !!ok]); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function client(name) {
  for (let i = 0; i < 40; i++) {
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ad`);
      const c = { ws, name, msgs: [], last: {}, on: {} };
      await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = bad; });
      ws.onmessage = (e) => { const m = JSON.parse(e.data); c.msgs.push(m); c.last[m.t] = m; if (c.on[m.t]) c.on[m.t](m); };
      c.send = (m) => ws.send(JSON.stringify(m));
      c.wait = async (t, f = () => true, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = c.msgs.find((q) => q.t === t && f(q)); if (m) return m; await sleep(50); } return null; };
      c.send({ t: 'hello', name, pid: 'test-' + name });
      return c;
    } catch (_) { await sleep(250); }
  }
  throw new Error('сервер не поднялся');
}
try {
  const A = await client('лётчик'), P = await client('зенитчик');
  check('вход', await A.wait('welcome') && await P.wait('welcome'));
  A.send({ t: 'create', mode: 'arcade', size: 1, era: 2, sideAir: 'west', team: 'air', fill: false });
  const room = await A.wait('room'); check('комната создана', room && room.code);
  P.send({ t: 'join', code: room.code, team: 'pvo' });
  check('второй вошёл за ПВО', await P.wait('room', (m) => m.players.some((p) => p.name === 'зенитчик' && p.team === 'pvo')));
  A.send({ t: 'ready', on: true }); P.send({ t: 'ready', on: true });
  const st = await A.wait('start'); check('бой начался', st && st.targets && st.targets.length === 3);
  const plan = await P.wait('room', (m) => m.state === 'plan'); check('расстановка (волна 1)', plan && plan.wave === 1);
  const state = await P.wait('state');
  // ПВО: «Оса» рядом с первой целью — ищем свободное место перебором (сервер проверяет землю)
  const { buildCity } = await import('../games/airdef/city.js?v=20260930m').catch(() => ({}));
  let placed = null;
  for (let k = 0; k < 40 && !placed; k++) {
    const x = 500 + (k % 8) * 120, z = -300 + Math.floor(k / 8) * 140;
    P.send({ t: 'buyUnit', k: 'osa', x, z, roof: 0 });
    const ev = await P.wait('ev', (m) => m.e.some((e) => e[0] === 'ua'), 400);
    if (ev) placed = ev.e.find((e) => e[0] === 'ua');
  }
  check('ПВО поставило комплекс', placed);
  const limit = []; P.send({ t: 'buyUnit', k: 'hawk', x: 0, z: 0 }); // запад — у ПВО восток: не дадут
  check('чужой комплекс не продают', await P.wait('deny', () => true, 1500));
  // связка: первая из 2-й эпохи за запад, которая по карману (очки первой волны)
  globalThis.THREE = await import('npm:three@0.128.0');
  const { LOADOUTS } = await import('../games/airdef/arsenal.js?v=20260930m');
  const O = await import('../games/airdef/sim/online.js?v=20260930m');
  const bi = LOADOUTS[2].findIndex((L) => L.side === 'west' && O.loadoutCost(L) <= O.BUDGET0.air && L.items.some(([k]) => k !== 'ecm_w'));
  A.send({ t: 'buyAir', i: bi });
  const chosen = await A.wait('room', (m) => m.players.some((p) => p.name === 'лётчик' && p.choice !== null), 3000);
  check('связка авиации выбрана', chosen);
  A.send({ t: 'ready', on: true }); P.send({ t: 'ready', on: true });
  const spawn = await A.wait('spawn', () => true, 8000); check('вылет: самолёт на краю карты', spawn && spawn.s && spawn.load && spawn.load.length);
  // летим к цели: шлём состояние 20 Гц по прямой, на подлёте — подсвет и сброс
  let s = spawn.s.slice(), t = 0; const tgt = { x: 500, z: -300 };
  const yaw = Math.atan2(-(tgt.x - s[0]), -(tgt.z - s[2]));
  let released = 0, cms = 0;
  for (let i = 0; i < 20 * 45; i++) {
    t += 0.05; const v = 260;
    s[0] += -Math.sin(yaw) * v * 0.05; s[2] += -Math.cos(yaw) * v * 0.05;
    A.send({ t: 'st', s: [s[0], 3000, s[2], yaw, 0, 0, v, 0.9, 0] });
    const d = Math.hypot(s[0] - tgt.x, s[2] - tgt.z);
    if (d < 9000 && i % 10 === 0) A.send({ t: 'laser', p: [tgt.x, 20, tgt.z] });
    if (d < 9000 && released < 2 && i % 8 === 0) { A.send({ t: 'rel', k: spawn.load[0].key, aim: [tgt.x, 20, tgt.z] }); released++; }
    if (i % 40 === 20 && cms < 3) { A.send({ t: 'cm', type: 'flare' }); cms++; }
    await sleep(50);
  }
  const snaps = A.msgs.filter((m) => m.t === 's');
  check('снимки идут', snaps.length > 100);
  check('в снимке — свой самолёт', snaps.some((m) => m.A.some((a) => a[0] === spawn.id || a[0] === A.last.welcome.id)));
  check('в снимке — комплекс ПВО', snaps.some((m) => m.U.length > 0));
  const evs = A.msgs.filter((m) => m.t === 's' && m.e).flatMap((m) => m.e);
  check('сброс оружия по команде', evs.some((e) => e[0] === 'wr'));
  check('ловушки по команде', evs.some((e) => e[0] === 'cm'));
  console.log('  события:', [...new Set(evs.map((e) => e[0]))].join(' '), '· ценность целей уничтожена', snaps.at(-1) ? snaps.at(-1).V : '?');
  // уходим: в «Летке» и тут комната без людей закрывается
  A.send({ t: 'leave' }); P.send({ t: 'leave' });
  check('выход из комнаты', await A.wait('left', () => true, 3000));
  const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
  check('/health показывает онлайн «Воздушного превосходства»', h.airdef && typeof h.airdef.rooms === 'number');
} catch (e) { check('без исключений: ' + (e && e.stack || e), false); }
srv.kill();
const bad = results.filter(([, ok]) => !ok);
console.log(bad.length ? `ИТОГ: ошибок ${bad.length}` : 'ИТОГ: всё прошло');
Deno.exit(bad.length ? 1 : 0);
