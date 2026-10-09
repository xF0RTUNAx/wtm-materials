// Онлайн-сервер «Симулятора Летки» (Deno). Комнаты и бой — rooms.js, правила — ONLINE_PLAN.md.
// «Воздушное превосходство» — airdef-rooms.js на адресе /ad (правила — AIRDEF_PLAN.md).
//
//   deno run --allow-net --allow-read --allow-env game-server/server.js
//
// Переменные окружения:
//   PORT       — порт (по умолчанию 8787)
//   HOST       — адрес (по умолчанию 0.0.0.0 — виден в локальной сети, для проверки с телефона;
//                на ноутбуке-сервере 127.0.0.1 — снаружи только через Cloudflare Tunnel)
//   MP_SECRET  — общий секрет с edge-функцией mp-ticket: вход только по подписанному билету аккаунта сайта.
//                Без него — режим разработки: сервер верит нику из клиента (только для локальной проверки!).
//   MATCH_T    — длина боя, с (для проверки; по умолчанию — из sim/online.js)
//   LOG_DIR    — папка журнала боёв (по умолчанию game-server/logs), LOG_DAYS — сколько дней хранить (14)
//   LOG_KEY    — ключ для чтения журнала по сети: /logs?key=…&date=ГГГГ-ММ-ДД[&room=КОД] (без ключа чтение по сети выключено)
import * as THREE from 'npm:three@0.128.0';
globalThis.THREE = THREE; // модули боя (games/drone/sim) считают векторами three.js, как в браузере

const { PORT: DEF_PORT } = await import('../games/drone/sim/online.js');
const { createRooms } = await import('./rooms.js');
const { createJournal } = await import('./journal.js');

const PORT = +(Deno.env.get('PORT') || DEF_PORT);
const HOST = Deno.env.get('HOST') || '0.0.0.0';
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
  return { pid: String(p.pid), name: String(p.login).slice(0, 24), owned: Array.isArray(p.u) ? p.u.map(String) : [] };
}
// Итог боя для наград (edge-функция drone-claim проверяет той же подписью): base64url(JSON) + '.' + base64url(HMAC)
const b64uEnc = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let signKey = null;
async function sign(obj) {
  if (!SECRET) return null; // режим разработки — наград нет
  signKey ||= await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const body = b64uEnc(new TextEncoder().encode(JSON.stringify(obj)));
  return body + '.' + b64uEnc(new Uint8Array(await crypto.subtle.sign('HMAC', signKey, new TextEncoder().encode(body))));
}
const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
async function auth(m) {
  if (SECRET) { try { return await checkTicket(m.ticket); } catch (_) { return null; } }
  const name = cleanName(m.name);
  return name ? { pid: String(m.pid || ''), name, owned: null } : null; // owned null — в разработке ограничений Реализма нет
}

const MAX_CLIENTS = +(Deno.env.get('MAX_CLIENTS') || 400);
const journal = createJournal({ dir: Deno.env.get('LOG_DIR') || decodeURIComponent(new URL('./logs', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'),
  days: +(Deno.env.get('LOG_DAYS') || 14), log });
const LOG_KEY = Deno.env.get('LOG_KEY') || '';
const rooms = createRooms({ log, auth, sign, matchT: +(Deno.env.get('MATCH_T') || 0) || undefined, journal: journal.write });
// «Воздушное превосходство» — свои комнаты на /ad. Грузится мягко: нет его файлов (на ноутбуке не скачана папка игры) или
// ошибка в нём — «Летка» работает как раньше, /ad отвечает 503
let adRooms = null;
try { const { createAdRooms } = await import('./airdef-rooms.js'); adRooms = createAdRooms({ log, auth, sign, journal: journal.write }); }
catch (e) { log('«Воздушное превосходство» не загрузилось — онлайн только «Летки»: ' + (e && e.message || e)); }
journal.write('server_start', { port: PORT, dev: SECRET ? 0 : 1 });
const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8' };

Deno.serve({ port: PORT, hostname: HOST, onListen: () => log(`онлайн-сервер на ${HOST}:${PORT}${SECRET ? ' (вход по билетам сайта)' : ' (режим разработки: вход по нику без билета)'}`) }, (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/ws' || url.pathname === '/ad') {
    if ((req.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return new Response('нужен WebSocket', { status: 426 });
    if (url.pathname === '/ad' && !adRooms) return new Response('«Воздушное превосходство» на сервере не установлено', { status: 503 });
    if (rooms.stats().online + (adRooms ? adRooms.stats().online : 0) >= MAX_CLIENTS) return new Response('сервер заполнен', { status: 503 });
    const { socket, response } = Deno.upgradeWebSocket(req);
    (url.pathname === '/ad' ? adRooms : rooms).connect(socket);
    return response;
  }
  if (url.pathname === '/logs') { // журнал боёв по ключу LOG_KEY: без date — список файлов
    if (!LOG_KEY || url.searchParams.get('key') !== LOG_KEY) return new Response('нет доступа', { status: 403 });
    const date = url.searchParams.get('date');
    if (!date) return new Response(journal.list().join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    const txt = journal.read(date, (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || null);
    return txt === null ? new Response('нет журнала за эту дату', { status: 404 }) : new Response(txt, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
  }
  if (url.pathname === '/health') return new Response(JSON.stringify({ ok: true, ...rooms.stats(), airdef: adRooms ? adRooms.stats() : null }), { headers: cors });
  return new Response('Симулятор Летки — онлайн-сервер', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
});
