// Автопроверка онлайн-сервера без браузера: два клиента проходят весь круг — вход, комната по коду, «Готов»,
// отсчёт, бой, попадания пушки (с проверкой угла), сбитие, счёт, возрождение. Печатает PASS/FAIL по шагам.
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
  a.ws.close(); b.ws.close();
} catch (e) { fails++; console.log('FAIL исключение: ' + (e && e.stack || e)); }
srv.kill(); await srv.status;
console.log(fails ? `ИТОГ: ${fails} ошибок` : 'ИТОГ: всё прошло');
Deno.exit(fails ? 1 : 0);
