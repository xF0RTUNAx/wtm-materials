// Залп НАР в онлайне (2026-10-22): лётчик берёт Viggen «Hydra ×4 + Mk 82 ×2» (эпоха II, запад), шлёт залп одним сообщением
// { t: 'rel', k: 'hydra', n: 4 } — сервер должен пустить 4 ракеты (события 'wr'), блок пустеет через load/salvo залпов,
// темп — один залп на токен (два подряд проходят). Сервер поднимается на :8798.
//   deno run --allow-net --allow-read --allow-env --allow-run game-server/airdef-nar-test.js
const PORT = 8798;
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
  await P.wait('room', (m) => m.players.some((p) => p.name === 'зенитчик' && p.team === 'pvo'));
  A.send({ t: 'ready', on: true }); P.send({ t: 'ready', on: true });
  await A.wait('start'); await P.wait('room', (m) => m.state === 'plan');
  globalThis.THREE = await import('npm:three@0.128.0');
  const { LOADOUTS, AG } = await import('../games/airdef/arsenal.js?v=20260930m');
  const bi = LOADOUTS[2].findIndex((L) => L.side === 'west' && !L.heli && L.items.some(([k]) => k === 'hydra'));
  check('связка с НАР есть в онлайне (Viggen)', bi >= 0);
  A.send({ t: 'buyAir', i: bi });
  check('связка с НАР выбрана', await A.wait('room', (m) => m.players.some((p) => p.name === 'лётчик' && p.choice === bi), 3000));
  A.send({ t: 'ready', on: true }); P.send({ t: 'ready', on: true });
  const spawn = await A.wait('spawn', () => true, 8000); check('вылет', spawn && spawn.load);
  const L0 = spawn.load.find((l) => l.key === 'hydra'), W = AG.hydra, per = Math.ceil(W.load / W.salvo);
  check('в подвеске — блоки Hydra', L0 && L0.n > 0);
  let s = spawn.s.slice(); const yaw = s[3] || 0;
  const fly = async (n) => { for (let i = 0; i < n; i++) { s[0] += -Math.sin(yaw) * 13; s[2] += -Math.cos(yaw) * 13; A.send({ t: 'st', s: [s[0], 1500, s[2], yaw, -0.1, 0, 260, 0.9, 0] }); await sleep(50); } };
  await fly(10);
  A.send({ t: 'rel', k: 'hydra', n: W.salvo, aim: null, tg: 0 }); await fly(6);
  A.send({ t: 'rel', k: 'hydra', n: W.salvo, aim: null, tg: 0 }); await fly(30);
  const evs = A.msgs.filter((m) => m.t === 's' && m.e).flatMap((m) => m.e), wr = evs.filter((e) => e[0] === 'wr' && e[2] === 'hydra');
  check(`залп — ${W.salvo} ракет на сообщение (пущено ${wr.length} за 2 залпа)`, wr.length === 2 * W.salvo);
  check('ракеты летят со скоростью самолёта и больше', wr.every((e) => Math.hypot(e[7], e[8], e[9]) > 100));
  // блок пустеет через per залпов: шлём ещё (per*n0) залпов с паузами — подвеска кончится, лишние — отказ
  const n0 = L0.n; let deny = 0; P.msgs.length = 0;
  for (let k = 0; k < per * n0 + 2; k++) { A.send({ t: 'rel', k: 'hydra', n: W.salvo }); await fly(6); }
  await fly(10);
  const wr2 = A.msgs.filter((m) => m.t === 's' && m.e).flatMap((m) => m.e).filter((e) => e[0] === 'wr' && e[2] === 'hydra').length;
  deny = A.msgs.filter((m) => m.t === 'deny').length;
  check(`блоков ${n0} × ${per} залпов × ${W.salvo} = ${n0 * per * W.salvo} ракет (как у клиента, air.js rocketsOf), пущено ${wr2}`, wr2 === n0 * per * W.salvo);
  check('пустой блок — отказ', deny >= 1);
  A.send({ t: 'leave' }); P.send({ t: 'leave' });
} catch (e) { check('без исключений: ' + (e && e.stack || e), false); }
srv.kill();
const bad = results.filter(([, ok]) => !ok);
console.log(bad.length ? `ИТОГ: ошибок ${bad.length}` : 'ИТОГ: всё прошло');
Deno.exit(bad.length ? 1 : 0);
