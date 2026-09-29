// Автопроверка онлайн-сервера без браузера: два клиента проходят весь круг — вход, комната по коду, «Готов»,
// отсчёт, бой, попадания пушки (с проверкой угла), сбитие, счёт, возрождение; затем этап 2 — подвеска, отказ в пуске,
// захват РЛС (виден цели), пуск ракеты, ракета в снимках, попадание, ЛТЦ, потеря захвата. Печатает PASS/FAIL по шагам.
//   deno run --allow-net --allow-read --allow-env --allow-run game-server/smoke-test.js
// Сам поднимает сервер на свободном порту (PORT=8799) и гасит его в конце.
const PORT = 8799, url = `ws://localhost:${PORT}/ws`;
const srv = new Deno.Command('deno', { args: ['run', '--allow-net', '--allow-read', '--allow-env', new URL('./server.js', import.meta.url).pathname],
  env: { PORT: String(PORT) }, stdout: 'null', stderr: 'inherit' }).spawn();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = '') => { if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : '')); };
function client(name) {
  const c = { name, last: {}, msgs: [] };
  c.open = (async () => { for (let i = 0; i < 50; i++) { try { c.ws = new WebSocket(url); await new Promise((res, rej) => { c.ws.onopen = res; c.ws.onerror = rej; }); return; } catch (_) { await sleep(200); } } throw new Error('сервер не поднялся'); })();
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.listen = () => { c.ws.onmessage = (e) => { const m = JSON.parse(e.data); c.last[m.t] = m; c.msgs.push(m); }; };
  return c;
}
try {
  const a = client('Альфа'), b = client('Бета');
  await a.open; await b.open; a.listen(); b.listen();
  a.send({ t: 'hello', name: 'Альфа' }); b.send({ t: 'hello', name: 'Бета' }); await sleep(150);
  check('вход (dev-режим)', a.last.welcome && b.last.welcome);
  a.send({ t: 'create', mode: 'arcade', size: 1 }); await sleep(150);
  const code = a.last.room && a.last.room.code;
  check('комната создана', /^[A-Z0-9]{4}$/.test(code || ''), code);
  b.send({ t: 'join', code: code.toLowerCase() }); await sleep(150);
  check('вход по коду (регистр не важен), команды 0/1', a.last.room.players.map((p) => p.team).join() === '0,1');
  a.send({ t: 'ready', on: true }); await sleep(150);
  check('без готовности всех старта нет', !a.last.start);
  b.send({ t: 'ready', on: true }); await sleep(200);
  check('все готовы → старт с точками появления', a.last.start && Object.keys(a.last.start.spawns).length === 2);
  await sleep(3300);
  check('отсчёт → бой', a.last.room.state === 'play');
  const idB = b.last.welcome.id;
  for (let i = 0; i < 10; i++) { a.send({ t: 'st', s: [0, 4000, 500, 0, 0, 0, 250, 1, 0] }); b.send({ t: 'st', s: [0, 4000, -500, Math.PI, 0, 0, 250, 1, 0] }); await sleep(50); }
  check('снимки приходят обоим', a.last.snap && a.last.snap.P.length === 2 && b.last.snap.P.length === 2);
  a.send({ t: 'st', s: [0, 4000, 500, Math.PI, 0, 0, 250, 1, 0] }); await sleep(80); // Альфа отвернулся
  a.send({ t: 'hit', target: idB }); await sleep(120);
  check('попадание не засчитано, если стрелок не смотрит на цель', !a.msgs.some((m) => m.t === 'hp'));
  a.send({ t: 'st', s: [0, 4000, 500, 0, 0, 0, 250, 1, 0] }); await sleep(80);
  for (let i = 0; i < 30; i++) { a.send({ t: 'hit', target: idB }); await sleep(45); }
  await sleep(300);
  const kill = a.msgs.find((m) => m.t === 'kill');
  check('сбитие пушкой: 29 попаданий по 3,5 (Аркада)', kill && kill.victim === idB && kill.by === 'ПУШКА', kill ? `счёт ${kill.score.join(':')}` : 'нет сбития');
  check('счёт команды', kill && kill.score[0] === 1);
  await sleep(5300);
  check('возрождение через 5 с', a.msgs.some((m) => m.t === 'spawn' && m.id === idB));

  // ── этап 2: ракеты, захват, ловушки ──
  const idA = a.last.welcome.id, LOAD = ['aim9l', 'aim120c', null, null, null, null, 'aim120c', 'aim9l'];
  // оба летят навстречу друг другу на 4 км высоты, 8 км между ними; состояние — 20 раз в секунду, как у клиента
  const fly = { a: { x: 0, y: 4000, z: 4000, yaw: 0 }, b: { x: 0, y: 4000, z: -4000, yaw: Math.PI } };
  const st = (f) => [f.x, f.y, f.z, f.yaw, 0, 0, 250, 1, 0];
  const flyT = setInterval(() => {
    for (const [k, c] of [['a', a], ['b', b]]) { const f = fly[k]; f.x -= Math.sin(f.yaw) * 250 * 0.05; f.z -= Math.cos(f.yaw) * 250 * 0.05; c.send({ t: 'st', s: st(f) }); }
  }, 50);
  await sleep(300);
  a.send({ t: 'load', l: LOAD }); b.send({ t: 'load', l: LOAD }); await sleep(100);
  a.msgs.length = 0; b.msgs.length = 0;
  a.send({ t: 'launch', key: 'r77', target: idB, slot: 1 }); await sleep(150);
  check('пуск ракеты, которой нет на подвеске, — отказ', a.msgs.some((m) => m.t === 'deny') && !a.msgs.some((m) => m.t === 'ml'));
  a.send({ t: 'launch', key: 'aim9l', target: idB, slot: 0, s: [fly.a.x, 4000, fly.a.z, Math.PI, 0, 0, 250, 1, 0] }); await sleep(150); // нос от цели
  check('ИК-пуск без цели в поле ГСН — отказ', a.msgs.filter((m) => m.t === 'deny').length === 2 && !a.msgs.some((m) => m.t === 'ml'));
  a.send({ t: 'lock', target: idB }); await sleep(500);
  const rowA = b.last.snap.P.find((row) => row[0] === idA);
  check('захват РЛС виден цели в снимке (СПО)', rowA && rowA[12] === idB, rowA ? 'lock=' + rowA[12] : 'нет строки');
  a.send({ t: 'launch', key: 'aim120c', target: idB, slot: 1, s: st(fly.a) }); await sleep(200);
  const ml = b.msgs.find((m) => m.t === 'ml');
  check('пуск AIM-120C по захвату — обоим событие ml', ml && ml.owner === idA && ml.target === idB && ml.key === 'aim120c' && a.msgs.some((m) => m.t === 'ml'), ml ? 'ракета ' + ml.id : 'нет пуска');
  await sleep(1000);
  const row0 = b.last.snap.M && b.last.snap.M.find((row) => row[0] === (ml && ml.id));
  const dist = (row) => Math.hypot(row[1] - fly.b.x, row[2] - fly.b.y, row[3] - fly.b.z);
  const d0 = row0 ? dist(row0) : 0; await sleep(500);
  const row1 = b.last.snap.M && b.last.snap.M.find((row) => row[0] === (ml && ml.id));
  check('ракета в снимках летит к цели', row0 && row1 && dist(row1) < d0 - 200 && row1[9] === idB, row0 && row1 ? `${Math.round(d0)} → ${Math.round(dist(row1))} м, сближение ${row1[10]} м/с` : 'нет в снимке');
  for (let i = 0; i < 100 && !b.msgs.some((m) => m.t === 'mx'); i++) await sleep(100);
  const mx = b.msgs.find((m) => m.t === 'mx'), hp = b.msgs.find((m) => m.t === 'hp' && m.id === idB);
  check('ракета попала: mx с попаданием, урон цели засчитан стрелку', mx && mx.hit === 1 && hp && hp.by === idA && hp.hp < 100, hp ? 'корпус ' + hp.hp : mx ? 'промах' : 'нет подрыва');
  b.msgs.length = 0; a.msgs.length = 0;
  for (let i = 0; i < 26; i++) { b.send({ t: 'cm', type: 'flare' }); await sleep(20); }
  await sleep(200);
  const cmN = a.msgs.filter((m) => m.t === 'cm' && m.id === idB && m.type === 'flare').length;
  check('ЛТЦ: событие остальным, запас 48 = 24 сброса', cmN === 24 && !b.msgs.some((m) => m.t === 'cm'), cmN + ' событий');
  a.send({ t: 'lock', target: idB }); await sleep(100);
  fly.a.yaw = Math.PI; // отвернулся — РЛС больше не видит цель
  for (let i = 0; i < 25 && !a.msgs.some((m) => m.t === 'lockx'); i++) await sleep(100);
  const lx = a.msgs.find((m) => m.t === 'lockx');
  check('цель вне обзора РЛС — сервер снимает захват', lx && lx.why === 'lost');
  clearInterval(flyT);
  a.ws.close(); b.ws.close();
} catch (e) { fails++; console.log('FAIL исключение: ' + (e && e.stack || e)); }
srv.kill(); await srv.status;
console.log(fails ? `ИТОГ: ${fails} ошибок` : 'ИТОГ: всё прошло');
Deno.exit(fails ? 1 : 0);
