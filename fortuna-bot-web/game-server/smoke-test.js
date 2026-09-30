// Автопроверка онлайн-сервера без браузера. Печатает PASS/FAIL по шагам.
//   этап 1 — вход, комната по коду, «Готов», отсчёт, бой, попадания пушки (с проверкой угла), сбитие, счёт, возрождение;
//   этап 2 — подвеска, отказ в пуске, захват РЛС (виден цели), пуск ракеты, ракета в снимках, попадание, ЛТЦ, потеря захвата;
//   этап 3 — боты в лобби, самолёт молчащего игрока ведёт ИИ и возвращается к нему, переподключение, быстрый поиск;
//   этап 4 — вход по билету сайта (второй сервер с MP_SECRET): правильный, поддельный и просроченный билет;
//   ИК-ГСН в онлайне — пуск с хвоста принят, в лоб ранней ракетой и за дальностью — отказ с текстом «СЕРВЕР: …».
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
  c.send = (m) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };
  c.listen = () => { c.ws.onmessage = (e) => { const m = JSON.parse(e.data); c.last[m.t] = m; c.msgs.push(m); }; };
  return c;
}
const waitFor = async (fn, ms = 3000) => { for (let t = 0; t < ms && !fn(); t += 50) await sleep(50); return fn(); };
// «полёт» клиента: состояние 20 раз в секунду, как у настоящего (молчание > 1 с — сервер отдаёт самолёт ИИ)
function flier(c, f) {
  c.f = f; c.mute = false;
  c.flyT = setInterval(() => {
    if (c.mute) return;
    if (f.move) { f.x -= Math.sin(f.yaw) * 250 * 0.05; f.z -= Math.cos(f.yaw) * 250 * 0.05; }
    c.send({ t: 'st', s: [f.x, f.y, f.z, f.yaw, 0, 0, 250, 1, 0] });
  }, 50);
}
try {
  const a = client('Альфа'), b = client('Бета');
  await a.open; await b.open; a.listen(); b.listen();
  a.send({ t: 'hello', name: 'Альфа', pid: 'p-alpha' }); b.send({ t: 'hello', name: 'Бета', pid: 'p-beta' }); await sleep(150);
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
  flier(a, { x: 0, y: 4000, z: 500, yaw: 0 }); flier(b, { x: 0, y: 4000, z: -500, yaw: Math.PI });
  await sleep(3300);
  check('отсчёт → бой', a.last.room.state === 'play');
  const idA = a.last.welcome.id, idB = b.last.welcome.id;
  await sleep(300);
  check('снимки приходят обоим', a.last.snap && a.last.snap.P.length === 2 && b.last.snap.P.length === 2);
  a.f.yaw = Math.PI; await sleep(150); // Альфа отвернулся
  a.send({ t: 'hit', target: idB }); await sleep(120);
  check('попадание не засчитано, если стрелок не смотрит на цель', !a.msgs.some((m) => m.t === 'hp'));
  a.f.yaw = 0; await sleep(150);
  for (let i = 0; i < 30; i++) { a.send({ t: 'hit', target: idB }); await sleep(45); }
  await sleep(300);
  const kill = a.msgs.find((m) => m.t === 'kill');
  check('сбитие пушкой: 29 попаданий по 3,5 (Аркада)', kill && kill.victim === idB && kill.by === 'ПУШКА', kill ? `счёт ${kill.score.join(':')}` : 'нет сбития');
  check('счёт команды', kill && kill.score[0] === 1);
  await sleep(5300);
  check('возрождение через 5 с', a.msgs.some((m) => m.t === 'spawn' && m.id === idB));

  // ── этап 2: ракеты, захват, ловушки ──
  const LOAD = ['aim9l', 'aim120c', null, null, null, null, 'aim120c', 'aim9l'];
  // оба летят навстречу друг другу на 4 км высоты, 8 км между ними
  Object.assign(a.f, { x: 0, y: 4000, z: 4000, yaw: 0, move: true }); Object.assign(b.f, { x: 0, y: 4000, z: -4000, yaw: Math.PI, move: true });
  const st = (f) => [f.x, f.y, f.z, f.yaw, 0, 0, 250, 1, 0];
  await sleep(300);
  a.send({ t: 'load', l: LOAD }); b.send({ t: 'load', l: LOAD }); await sleep(100);
  a.msgs.length = 0; b.msgs.length = 0;
  a.send({ t: 'launch', key: 'r77', target: idB, slot: 1 }); await sleep(150);
  check('пуск ракеты, которой нет на подвеске, — отказ', a.msgs.some((m) => m.t === 'deny') && !a.msgs.some((m) => m.t === 'ml'));
  a.send({ t: 'launch', key: 'aim9l', target: idB, slot: 0, s: [a.f.x, 4000, a.f.z, Math.PI, 0, 0, 250, 1, 0] }); await sleep(150); // нос от цели
  check('ИК-пуск без цели в поле ГСН — отказ', a.msgs.filter((m) => m.t === 'deny').length === 2 && !a.msgs.some((m) => m.t === 'ml'));
  a.send({ t: 'lock', target: idB }); await sleep(500);
  const rowA = b.last.snap.P.find((row) => row[0] === idA);
  check('захват РЛС виден цели в снимке (СПО)', rowA && rowA[12] === idB, rowA ? 'lock=' + rowA[12] : 'нет строки');
  a.send({ t: 'launch', key: 'aim120c', target: idB, slot: 1, s: st(a.f) }); await sleep(200);
  const ml = b.msgs.find((m) => m.t === 'ml');
  check('пуск AIM-120C по захвату — обоим событие ml', ml && ml.owner === idA && ml.target === idB && ml.key === 'aim120c' && a.msgs.some((m) => m.t === 'ml'), ml ? 'ракета ' + ml.id : 'нет пуска');
  await sleep(1000);
  const row0 = b.last.snap.M && b.last.snap.M.find((row) => row[0] === (ml && ml.id));
  const dist = (row) => Math.hypot(row[1] - b.f.x, row[2] - b.f.y, row[3] - b.f.z);
  const d0 = row0 ? dist(row0) : 0; await sleep(500);
  const row1 = b.last.snap.M && b.last.snap.M.find((row) => row[0] === (ml && ml.id));
  check('ракета в снимках летит к цели', row0 && row1 && dist(row1) < d0 - 200 && row1[9] === idB, row0 && row1 ? `${Math.round(d0)} → ${Math.round(dist(row1))} м, сближение ${row1[10]} м/с` : 'нет в снимке');
  await waitFor(() => b.msgs.some((m) => m.t === 'mx'), 10000);
  const mx = b.msgs.find((m) => m.t === 'mx'), hp = b.msgs.find((m) => m.t === 'hp' && m.id === idB);
  check('ракета попала: mx с попаданием, урон цели засчитан стрелку', mx && mx.hit === 1 && hp && hp.by === idA && hp.hp < 100, hp ? 'корпус ' + hp.hp : mx ? 'промах' : 'нет подрыва');
  b.msgs.length = 0; a.msgs.length = 0;
  for (let i = 0; i < 32; i++) { b.send({ t: 'cm', type: 'flare' }); await sleep(20); }
  await sleep(200);
  const cmN = a.msgs.filter((m) => m.t === 'cm' && m.id === idB && m.type === 'flare').length;
  check('ЛТЦ: событие остальным, запас 60 («Аркада») = 30 сбросов', cmN === 30 && !b.msgs.some((m) => m.t === 'cm'), cmN + ' событий');
  a.send({ t: 'lock', target: idB }); await sleep(100);
  a.f.yaw = Math.PI; // отвернулся — РЛС больше не видит цель
  await waitFor(() => a.msgs.some((m) => m.t === 'lockx'), 2500);
  const lx = a.msgs.find((m) => m.t === 'lockx');
  check('цель вне обзора РЛС — сервер снимает захват', lx && lx.why === 'lost');
  Object.assign(a.f, { move: false, x: 0, z: 3000, yaw: 0 }); Object.assign(b.f, { move: false, x: 0, z: -3000, yaw: Math.PI });

  // ── этап 3: игрок молчит (свернул) — самолёт ведёт ИИ; вернулся — самолёт снова его ──
  b.mute = true; b.msgs.length = 0; a.msgs.length = 0;
  await waitFor(() => a.last.room.players.some((p) => p.id === idB && p.ai), 2500);
  check('молчит > 1 с — самолёт ведёт ИИ (в комнате ai)', a.last.room.players.some((p) => p.id === idB && p.ai));
  const rb0 = a.last.snap.P.find((row) => row[0] === idB); await sleep(1000);
  const rb1 = a.last.snap.P.find((row) => row[0] === idB);
  check('под ИИ самолёт летит (снимки меняются)', rb0 && rb1 && Math.hypot(rb1[3] - rb0[3], rb1[5] - rb0[5]) > 100, rb0 && rb1 ? Math.round(Math.hypot(rb1[3] - rb0[3], rb1[5] - rb0[5])) + ' м за 1 с' : '');
  b.mute = false;
  await waitFor(() => b.msgs.some((m) => m.t === 'you'), 1500);
  const you = b.msgs.find((m) => m.t === 'you');
  check('снова шлёт состояние — сервер присылает «you» с положением самолёта', you && you.s && you.s.length === 9 && Array.isArray(you.load), you ? `ЛТЦ ${you.flares}, корпус ${you.hp}` : 'нет');
  if (you) { Object.assign(b.f, { x: you.s[0], y: you.s[1], z: you.s[2], yaw: you.s[3] }); b.send({ t: 'back', n: you.n }); }
  await waitFor(() => a.last.room.players.some((p) => p.id === idB && !p.ai), 1500);
  check('ответ back — самолёт снова у игрока', a.last.room.players.some((p) => p.id === idB && !p.ai));

  // ── этап 3: обрыв связи и возвращение по pid ──
  clearInterval(b.flyT); b.ws.close(); a.msgs.length = 0;
  await waitFor(() => a.last.room.players.some((p) => p.id === idB && p.away), 2000);
  check('обрыв связи — место держится, самолёт ведёт ИИ (без gone)', a.last.room.players.some((p) => p.id === idB && p.away && p.ai) && !a.msgs.some((m) => m.t === 'gone'));
  const b2 = client('Бета'); await b2.open; b2.listen();
  b2.send({ t: 'hello', name: 'Бета', pid: 'p-beta', resume: true });
  await waitFor(() => b2.last.start, 2000);
  check('переподключение: та же запись и start с resume', b2.last.welcome && b2.last.welcome.id === idB && b2.last.start && b2.last.start.resume && b2.last.start.resume.you && b2.last.start.cd === 0,
    b2.last.start ? 'время боя ' + Math.round(b2.last.start.resume.t) + ' с' : 'нет start');
  const you2 = b2.last.start && b2.last.start.resume.you;
  if (you2 && you2.s) { flier(b2, { x: you2.s[0], y: you2.s[1], z: you2.s[2], yaw: you2.s[3] }); b2.send({ t: 'back', n: you2.n }); }
  await waitFor(() => a.last.room.players.some((p) => p.id === idB && !p.away && !p.ai), 1500);
  check('после back — снова человек на связи', a.last.room.players.some((p) => p.id === idB && !p.away && !p.ai));

  // ── этап 3: боты в лобби ──
  const c = client('Гамма'); await c.open; c.listen();
  c.send({ t: 'hello', name: 'Гамма', pid: 'p-gamma' }); await sleep(150);
  c.send({ t: 'create', mode: 'real', size: 2 }); await sleep(150);
  c.send({ t: 'bot', team: 1 }); c.send({ t: 'bot', team: 0 }); await sleep(150);
  const rc = c.last.room;
  check('«+ бот» в обе команды — боты готовы', rc.players.filter((p) => p.bot && p.ready).length === 2, rc.players.map((p) => p.name).join(', '));
  const botId = rc.players.find((p) => p.bot && p.team === 0).id;
  c.send({ t: 'kick', id: botId }); await sleep(150);
  check('убрать бота', c.last.room.players.length === 2);
  c.send({ t: 'ready', on: true }); await sleep(200);
  check('один человек + бот: старт по «Готов»', c.last.start && c.last.start.cd > 0);
  flier(c, { x: 0, y: 4500, z: 9500, yaw: 0 });
  await sleep(3500);
  const bot = c.last.room.players.find((p) => p.bot);
  const s0 = c.last.snap.P.find((row) => row[0] === bot.id); await sleep(1000);
  const s1 = c.last.snap.P.find((row) => row[0] === bot.id);
  check('бот летает (снимки меняются)', s0 && s1 && Math.hypot(s1[3] - s0[3], s1[5] - s0[5]) > 150, s0 && s1 ? Math.round(Math.hypot(s1[3] - s0[3], s1[5] - s0[5])) + ' м за 1 с' : '');
  const d2 = client('Дельта'); await d2.open; d2.listen();
  d2.send({ t: 'hello', name: 'Дельта', pid: 'p-delta' }); await sleep(150);
  d2.send({ t: 'join', code: c.last.room.code }); await sleep(300);
  check('вход в идущий бой на свободное место — start с resume', d2.last.start && d2.last.start.resume && d2.last.room && d2.last.room.state === 'play');

  // ── этап 3: быстрый поиск ──
  const e1 = client('Эпсилон'), e2 = client('Дзета'); await e1.open; await e2.open; e1.listen(); e2.listen();
  e1.send({ t: 'hello', name: 'Эпсилон', pid: 'p-e1' }); e2.send({ t: 'hello', name: 'Дзета', pid: 'p-e2' }); await sleep(150);
  e1.send({ t: 'queue', mode: 'arcade' }); e2.send({ t: 'queue', mode: 'arcade' }); await sleep(300);
  const health = await (await fetch(`http://localhost:${PORT}/health`)).json();
  check('«кто ищет»: /health и сообщение search', health.searching && health.searching.arcade === 2 && e1.last.search && e1.last.search.arcade === 2, JSON.stringify(health.searching));
  await waitFor(() => e1.last.found && e2.last.found, 11000);
  check('быстрый поиск: обоим «Бой найден»', e1.last.found && e2.last.found, e1.last.found ? `игроков ${e1.last.found.n}, ${e1.last.found.T} с на подтверждение` : '');
  e1.send({ t: 'accept' }); e2.send({ t: 'accept' });
  await waitFor(() => e1.last.start && e2.last.start, 2000);
  check('оба подтвердили — комната и старт', e1.last.start && e2.last.start && e1.last.room.quick && e1.last.room.players.length === 2);
  for (const x of [a, b2, c, d2, e1, e2]) { clearInterval(x.flyT); x.ws.close(); }

  // ── этап 4: вход по билету (формат — как в supabase/functions/mp-ticket) ──
  const SECRET = 'test-secret-' + Math.random(), P2 = 8798;
  const srv2 = new Deno.Command('deno', { args: ['run', '--allow-net', '--allow-read', '--allow-env', new URL('./server.js', import.meta.url).pathname],
    env: { PORT: String(P2), MP_SECRET: SECRET, HOST: '127.0.0.1' }, stdout: 'null', stderr: 'inherit' }).spawn();
  const enc = new TextEncoder(), b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const ticket = async (login, exp, secret = SECRET) => {
    const body = b64u(enc.encode(JSON.stringify({ pid: 'uuid-' + login, login, exp })));
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return body + '.' + b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body))));
  };
  const tryHello = async (hello) => {
    for (let i = 0; i < 50; i++) {
      try {
        const ws = new WebSocket(`ws://127.0.0.1:${P2}/ws`), got = [];
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (e) => got.push(JSON.parse(e.data));
        ws.send(JSON.stringify({ t: 'hello', ...hello })); await sleep(300); ws.close();
        return got;
      } catch (_) { await sleep(200); }
    }
    return [];
  };
  const now = Math.floor(Date.now() / 1000);
  const ok = await tryHello({ name: 'Самозванец', ticket: await ticket('Марк', now + 600) });
  const w = ok.find((m) => m.t === 'welcome');
  check('билет сайта: вход, ник — из билета (не из клиента)', w && w.name === 'Марк', w ? w.name : JSON.stringify(ok));
  const forged = await tryHello({ name: 'Марк', ticket: await ticket('Марк', now + 600, 'чужой-секрет') });
  check('поддельный билет — отказ', !forged.some((m) => m.t === 'welcome') && forged.some((m) => m.t === 'err'));
  const old = await tryHello({ name: 'Марк', ticket: await ticket('Марк', now - 5) });
  check('просроченный билет — отказ', !old.some((m) => m.t === 'welcome') && old.some((m) => m.t === 'err'));
  const none = await tryHello({ name: 'Марк' });
  check('без билета при MP_SECRET — отказ', !none.some((m) => m.t === 'welcome'));
  srv2.kill(); await srv2.status;

  // ── награды: «Реализм» только с открытыми ракетами, подписанный итог боя (сервер с MP_SECRET и коротким боем) ──
  const P3 = 8797;
  const srv3 = new Deno.Command('deno', { args: ['run', '--allow-net', '--allow-read', '--allow-env', new URL('./server.js', import.meta.url).pathname],
    env: { PORT: String(P3), MP_SECRET: SECRET, MATCH_T: '5' }, stdout: 'null', stderr: 'inherit' }).spawn();
  const ticketU = async (login, u) => {
    const body = b64u(enc.encode(JSON.stringify({ pid: 'uuid-' + login, login, u, exp: now + 600 })));
    const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return body + '.' + b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body))));
  };
  const cl = async (login, u) => {
    for (let i = 0; i < 50; i++) {
      try {
        const x = { last: {}, msgs: [] }; x.ws = new WebSocket(`ws://localhost:${P3}/ws`);
        await new Promise((res, rej) => { x.ws.onopen = res; x.ws.onerror = rej; });
        x.ws.onmessage = (e) => { const m = JSON.parse(e.data); x.last[m.t] = m; x.msgs.push(m); };
        x.send = (m) => x.ws.send(JSON.stringify(m));
        x.send({ t: 'hello', ticket: await ticketU(login, u) }); await sleep(200);
        return x;
      } catch (_) { await sleep(200); }
    }
  };
  const r1 = await cl('Реалист', ['r73']), r2 = await cl('Соперник', []);
  r1.send({ t: 'create', mode: 'real', size: 1 }); await sleep(150);
  r2.send({ t: 'join', code: r1.last.room.code }); await sleep(150);
  r1.send({ t: 'ready', on: true }); r2.send({ t: 'ready', on: true }); await sleep(300);
  flier(r1, { x: 0, y: 4000, z: 9000, yaw: 0 }); flier(r2, { x: 0, y: 4000, z: -9000, yaw: Math.PI });
  r1.msgs.length = 0;
  r1.send({ t: 'load', l: ['aim9b', 'aim120c', null, null, null, null, null, null] }); await sleep(150);
  check('«Реализм»: закрытая ракета на подвеске — отказ', r1.msgs.some((m) => m.t === 'err' && /открытые/.test(m.msg)));
  r1.msgs.length = 0;
  r1.send({ t: 'load', l: ['aim9b', 'aim7e', null, null, null, null, 'r73', 'firestreak'] }); await sleep(150);
  check('«Реализм»: базовые и купленные — можно', !r1.msgs.some((m) => m.t === 'err'));
  await waitFor(() => r1.last.result && r2.last.result, 12000);
  const res = r1.last.result;
  // проверяем той же функцией, что и edge-функция drone-claim
  const { verifySigned } = await import('../supabase/functions/_shared/drone.ts');
  const payload = res ? await verifySigned(res.token, SECRET) : null;
  check('поддельная подпись итога не проходит', res && !(await verifySigned(res.token, SECRET + 'x')));
  check('итог боя подписан сервером (проверка drone-claim проходит)', payload && payload.p === 'uuid-Реалист' && payload.mode === 'real' && payload.hm === 1 && typeof payload.m === 'string',
    payload ? JSON.stringify({ m: payload.m, w: payload.w, k: payload.k, hm: payload.hm }) : 'нет итога');
  for (const x of [r1, r2]) { clearInterval(x.flyT); x.ws.close(); }
  srv3.kill(); await srv3.status;

  // ── ИК-ГСН в онлайне (п. 1 отзыва Mark): «Изделие» заметнее (ONLINE_IR), у сервера запас по дальности/ракурсу и свои тексты отказа ──
  const i1 = client('ИК-1'), i2 = client('ИК-2');
  await i1.open; await i2.open; i1.listen(); i2.listen();
  i1.send({ t: 'hello', name: 'ИК-1', pid: 'p-ir1' }); i2.send({ t: 'hello', name: 'ИК-2', pid: 'p-ir2' }); await sleep(150);
  i1.send({ t: 'create', mode: 'arcade', size: 1 }); await waitFor(() => i1.last.room);
  i2.send({ t: 'join', code: i1.last.room.code }); await sleep(150);
  i1.send({ t: 'ready', on: true }); i2.send({ t: 'ready', on: true });
  await waitFor(() => i1.last.room && i1.last.room.state === 'play', 5000);
  // i1 на юге смотрит на север, i2 в 3 км впереди летит от него (хвостом к i1)
  flier(i1, { x: 0, y: 4000, z: 5000, yaw: 0, move: false }); flier(i2, { x: 0, y: 4000, z: 2000, yaw: 0, move: false });
  const IRL = ['aim9b', 'aim9l', null, null, null, null, 'aim9l', 'aim9b'];
  i1.send({ t: 'load', l: IRL }); await sleep(400);
  const idI2 = i2.last.welcome.id, sI1 = [0, 4000, 5000, 0, 0, 0, 250, 1, 0];
  i1.msgs.length = 0;
  i1.send({ t: 'launch', key: 'aim9b', target: idI2, slot: 0, s: sI1 }); await sleep(250);
  check('ИК: AIM-9B с хвоста с 3 км — пуск принят', i1.msgs.some((m) => m.t === 'ml' && m.key === 'aim9b'), (i1.msgs.find((m) => m.t === 'deny') || {}).msg || '');
  Object.assign(i2.f, { yaw: Math.PI }); await sleep(600); i1.msgs.length = 0; // i2 развернулся в лоб
  i1.send({ t: 'launch', key: 'aim9b', target: idI2, slot: 7, s: sI1 }); await sleep(250);
  const dn1 = i1.msgs.find((m) => m.t === 'deny');
  check('ИК: AIM-9B в лоб — отказ сервера «нужен заход в хвост»', dn1 && /СЕРВЕР/.test(dn1.msg) && /ХВОСТ/.test(dn1.msg) && !i1.msgs.some((m) => m.t === 'ml'), dn1 ? dn1.msg : 'нет отказа');
  Object.assign(i2.f, { z: -10000, yaw: 0 }); await sleep(600); i1.msgs.length = 0; // 15 км, хвостом
  i1.send({ t: 'launch', key: 'aim9l', target: idI2, slot: 1, s: sI1 }); await sleep(250);
  const dn2 = i1.msgs.find((m) => m.t === 'deny');
  check('ИК: AIM-9L с 15 км — отказ сервера «дальше дальности ГСН»', dn2 && /СЕРВЕР/.test(dn2.msg) && /ДАЛЬНОСТИ/.test(dn2.msg), dn2 ? dn2.msg : 'нет отказа');
  for (const x of [i1, i2]) { clearInterval(x.flyT); x.ws.close(); }
} catch (e) { fails++; console.log('FAIL исключение: ' + (e && e.stack || e)); }
srv.kill(); await srv.status;
console.log(fails ? `ИТОГ: ${fails} ошибок` : 'ИТОГ: всё прошло');
Deno.exit(fails ? 1 : 0);
