// Онлайн-сервер «Симулятора Летки» (Deno). Комнаты и бой — rooms.js, правила — ONLINE_PLAN.md.
//
//   deno run --allow-net --allow-read --allow-env game-server/server.js
//
// Переменные окружения:
//   PORT       — порт (по умолчанию 8787)
//   MP_SECRET  — общий секрет с edge-функцией mp-ticket: вход только по подписанному билету аккаунта сайта.
//                Без него — режим разработки: сервер верит нику из клиента (только для локальной проверки!).
//   MATCH_T    — длина боя, с (для проверки; по умолчанию — из sim/online.js)
import * as THREE from 'npm:three@0.128.0';
globalThis.THREE = THREE; // модули боя (games/drone/sim) считают векторами three.js, как в браузере

const { PORT: DEF_PORT } = await import('../games/drone/sim/online.js');
const { createRooms } = await import('./rooms.js');

const PORT = +(Deno.env.get('PORT') || DEF_PORT);
const SECRET = Deno.env.get('MP_SECRET') || '';
const log = (s) => console.log(new Date().toISOString().slice(11, 19), s);

// Билет: base64url(JSON {pid, login, exp}) + '.' + base64url(HMAC-SHA256(секрет, первая часть))
const b64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (ch) => ch.charCodeAt(0));
let hmacKey = null;
async function checkTicket(ticket) {
  const [body, sig] = String(ticket || '').split('.');
  if (!body || !sig) return null;
  hmacKey ||= await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('HMAC', hmacKey, b64u(sig), new TextEncoder().encode(body)))) return null;
  const p = JSON.parse(new TextDecoder().decode(b64u(body)));
  if (!p.pid || !p.login || !(p.exp * 1000 > Date.now())) return null;
  return { pid: String(p.pid), name: String(p.login).slice(0, 24) };
}
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
async function auth(m) {
  if (SECRET) { try { return await checkTicket(m.ticket); } catch (_) { return null; } }
  const name = cleanName(m.name);
  return name ? { pid: String(m.pid || ''), name } : null;
}

const rooms = createRooms({ log, auth, matchT: +(Deno.env.get('MATCH_T') || 0) || undefined });
const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };

Deno.serve({ port: PORT, hostname: '0.0.0.0', onListen: () => log(`онлайн-сервер на :${PORT}${SECRET ? '' : ' (режим разработки: вход по нику без билета)'}`) }, (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/ws') {
    if ((req.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('нужен WebSocket', { status: 426 });
    const { socket, response } = Deno.upgradeWebSocket(req);
    rooms.connect(socket);
    return response;
  }
  if (url.pathname === '/health') return new Response(JSON.stringify({ ok: true, ...rooms.stats() }), { headers: cors });
  return new Response('Симулятор Летки — онлайн-сервер', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
});
