// Тестовый игрок для проверки онлайна без второго человека: входит в комнату по коду, жмёт «Готов»,
// кружит вокруг первого соперника на ~1,5 км и «стреляет» (заявки на попадание, если соперник близко).
//
//   deno run --allow-net game-server/test-client.js КОД [ник] [адрес сервера]
//
const [code, name = 'Тестер', url = 'ws://localhost:8787/ws'] = Deno.args;
if (!code) { console.log('нужен код комнаты'); Deno.exit(1); }
const ws = new WebSocket(url);
const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
let me = 0, room = null, alive = false, pos = null, ang = 0, fireT = 0, target = null;
ws.onopen = () => send({ t: 'hello', name, pid: 'test-' + name });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'welcome') { me = m.id; send({ t: 'join', code }); }
  else if (m.t === 'room') { room = m; const my = m.players.find((p) => p.id === me); if (m.state === 'lobby' && my && !my.ready) send({ t: 'ready', on: true }); }
  else if (m.t === 'start') { const s = m.spawns[me]; pos = { x: s[0], y: s[1], z: s[2] }; alive = true; console.log('бой!'); }
  else if (m.t === 'spawn' && m.id === me) { pos = { x: m.s[0], y: m.s[1], z: m.s[2] }; alive = true; }
  else if (m.t === 'kill') { if (m.victim === me) alive = false; console.log('сбит', m.victim, 'кем', m.killer, 'счёт', m.score.join(':')); }
  else if (m.t === 'snap') { const o = m.P.find((p) => p[0] !== me && p[1]); target = o ? { x: o[3], y: o[4], z: o[5] } : null; }
  else if (m.t === 'end') console.log('итог', m.score.join(':'));
  else if (m.t === 'err') console.log('ошибка:', m.msg);
};
ws.onclose = () => { console.log('соединение закрыто'); Deno.exit(0); };
const dt = 0.05, R = 1500, W = 250 / R; // круг радиусом 1,5 км со скоростью 250 м/с
setInterval(() => {
  if (!alive || !pos || !room || (room.state !== 'play' && room.state !== 'countdown')) return;
  const c = target || { x: 0, y: 4500, z: 0 };
  ang += W * dt;
  const want = { x: c.x + Math.cos(ang) * R, y: c.y + 150, z: c.z + Math.sin(ang) * R };
  const k = Math.min(1, 1.5 * dt), mx = (want.x - pos.x) * k, my = (want.y - pos.y) * k, mz = (want.z - pos.z) * k;
  pos.x += mx; pos.y += my; pos.z += mz;
  const sp = Math.hypot(mx, my, mz) / dt; // курс и скорость — по настоящему движению (иначе упреждение у соперника врёт)
  let yaw = Math.atan2(-mx, -mz), pitch = Math.atan2(my, Math.hypot(mx, mz));
  const firing = target && Math.hypot(target.x - pos.x, target.z - pos.z) < 1700;
  if (firing) { yaw = Math.atan2(-(target.x - pos.x), -(target.z - pos.z)); pitch = Math.atan2(target.y - pos.y, Math.hypot(target.x - pos.x, target.z - pos.z)); } // стреляя — смотрим на цель
  send({ t: 'st', s: [pos.x, pos.y, pos.z, yaw, pitch, -0.5, sp, 1, firing ? 2 : 0] });
  if (firing && (fireT -= dt) <= 0 && room.state === 'play') { fireT = 0.4; const o = room.players.find((p) => p.id !== me); if (o) send({ t: 'hit', target: o.id }); }
}, dt * 1000);
