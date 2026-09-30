// Тестовый игрок для проверки онлайна без второго человека: входит в комнату по коду, жмёт «Готов»,
// кружит вокруг первого соперника и воюет. По 20 с чередует:
//   дальний круг (~5 км) — захват РЛС и пуск Р-77 каждые 10 с (разворот носом на цель на 1,5 с);
//   ближний круг (~1,5 км) — пушка (заявки на попадание), Р-73, если нос на цели.
// На ракеты по себе отвечает ловушками: ИК — ЛТЦ, радиолокационные — диполи.
//
//   deno run --allow-net --allow-read game-server/test-client.js КОД [ник] [адрес сервера]
//   deno run --allow-net --allow-read game-server/test-client.js --queue=arcade [ник]   — быстрый поиск (arcade | real), сам подтверждает бой
//
import { MISSILES } from '../games/drone/missiles.js?v=20260930d';

const [code, name = 'Тестер', url = 'ws://localhost:8787/ws'] = Deno.args;
if (!code) { console.log('нужен код комнаты или --queue=arcade'); Deno.exit(1); }
const QUEUE = code.startsWith('--queue') ? (code.split('=')[1] || 'arcade') : null;
const LOAD = ['r73', 'r77', null, null, null, null, 'r77', 'r73'];
const ws = new WebSocket(url);
const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
let me = 0, room = null, alive = false, pos = null, ang = 0, fireT = 0, target = null, load = LOAD.slice();
let aimT = 0, mslT = 5, cmT = 0, t = 0;
const threats = new Map(); // ракеты в меня: id → вид ГСН
ws.onopen = () => send({ t: 'hello', name, pid: 'test-' + name });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === 'welcome') { me = m.id; if (QUEUE) send({ t: 'queue', mode: QUEUE }); else send({ t: 'join', code }); }
  else if (m.t === 'found') { console.log('бой найден, игроков', m.n, '— подтверждаю'); send({ t: 'accept' }); }
  else if (m.t === 'unqueued') console.log('поиск остановлен:', m.why);
  else if (m.t === 'you') { if (m.s) pos = { x: m.s[0], y: m.s[1], z: m.s[2] }; send({ t: 'back', n: m.n }); }
  else if (m.t === 'room') { room = m; const my = m.players.find((p) => p.id === me); if (m.state === 'lobby' && my && !my.ready) send({ t: 'ready', on: true }); }
  else if (m.t === 'start') { const s = m.spawns[me]; pos = { x: s[0], y: s[1], z: s[2] }; alive = true; rearm(); console.log('бой!'); }
  else if (m.t === 'spawn' && m.id === me) { pos = { x: m.s[0], y: m.s[1], z: m.s[2] }; alive = true; rearm(); }
  else if (m.t === 'kill') { if (m.victim === me) alive = false; console.log('сбит', m.victim, 'кем', m.killer, m.by, 'счёт', m.score.join(':')); }
  else if (m.t === 'snap') { const o = m.P.find((p) => p[0] !== me && p[1]); target = o ? { id: o[0], x: o[3], y: o[4], z: o[5] } : null; }
  else if (m.t === 'ml') {
    if (m.owner === me) console.log('пуск', m.key);
    if (m.target === me) { threats.set(m.id, MISSILES[m.key] ? MISSILES[m.key].kind : 'arh'); console.log('в меня пущена', m.key); }
  }
  else if (m.t === 'mx') { if (threats.delete(m.id)) console.log(m.hit ? 'ракета попала' : 'ракета мимо'); }
  else if (m.t === 'deny') { if (m.msg) console.log('отказ в пуске:', m.msg); }
  else if (m.t === 'lockx') console.log('захват снят:', m.why);
  else if (m.t === 'end') console.log('итог', m.score.join(':'));
  else if (m.t === 'err') console.log('ошибка:', m.msg);
};
ws.onclose = () => { console.log('соединение закрыто'); Deno.exit(0); };
function rearm() { load = LOAD.slice(); threats.clear(); send({ t: 'load', l: load }); }
const dt = 0.05, W = 250; // скорость 250 м/с
setInterval(() => {
  if (!alive || !pos || !room || (room.state !== 'play' && room.state !== 'countdown')) return;
  t += dt;
  const far = Math.floor(t / 20) % 2 === 0, R = far ? 5000 : 1500;
  const c = target || { x: 0, y: 4500, z: 0 };
  ang += W / R * dt;
  const want = { x: c.x + Math.cos(ang) * R, y: c.y + 150, z: c.z + Math.sin(ang) * R };
  const k = Math.min(1, 1.5 * dt), mx = (want.x - pos.x) * k, my = (want.y - pos.y) * k, mz = (want.z - pos.z) * k;
  pos.x += mx; pos.y += my; pos.z += mz;
  const sp = Math.hypot(mx, my, mz) / dt; // курс и скорость — по настоящему движению (иначе упреждение у соперника врёт)
  let yaw = Math.atan2(-mx, -mz), pitch = Math.atan2(my, Math.hypot(mx, mz));
  const d = target ? Math.hypot(target.x - pos.x, target.y - pos.y, target.z - pos.z) : 1e9;
  const firing = target && !far && d < 1700;
  mslT -= dt; aimT -= dt; cmT -= dt;
  if (far && target && mslT <= 0 && d < 20000) { aimT = 1.5; mslT = 10; } // заход на пуск: 1,5 с носом на цель
  const aiming = aimT > 0 && target;
  if (firing || aiming) { yaw = Math.atan2(-(target.x - pos.x), -(target.z - pos.z)); pitch = Math.atan2(target.y - pos.y, Math.hypot(target.x - pos.x, target.z - pos.z)); } // стреляя — смотрим на цель
  const s = [pos.x, pos.y, pos.z, yaw, pitch, -0.5, sp, 1, firing ? 2 : 0];
  send({ t: 'st', s });
  if (room.state !== 'play') return;
  if (aiming) {
    if (aimT > 1.2) send({ t: 'lock', target: target.id }); // захват РЛС (сервер проверит, видит ли его наша РЛС)
    else if (aimT <= 0.5 && aimT > 0.5 - dt * 1.5) launch('r77', s);
  }
  if (firing && (fireT -= dt) <= 0) {
    fireT = 0.4; send({ t: 'hit', target: target.id });
    if (mslT <= 5 && launch('r73', s)) mslT = 10;
  }
  if (threats.size && cmT <= 0) { // ловушки против ракет, летящих в нас
    const kinds = new Set(threats.values());
    if (kinds.has('ir')) send({ t: 'cm', type: 'flare' });
    if (kinds.has('sarh') || kinds.has('arh')) send({ t: 'cm', type: 'chaff' });
    cmT = 0.7;
  }
}, dt * 1000);
function launch(key, s) {
  const slot = load.indexOf(key); if (slot < 0 || !target) return false;
  load[slot] = null;
  send({ t: 'launch', key, target: target.id, slot, s });
  return true;
}
