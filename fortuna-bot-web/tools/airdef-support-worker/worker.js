// Файлы поддержки «Воздушного превосходства» (Mark 2026-11-18). Хранилище R2 airdef-support закрыто; сюда ходят только по ссылкам,
// подписанным функцией Supabase airdef-support (_shared/support-files.ts) общим секретом SUPPORT_FILE_KEY:
//   PUT    /f/<key>?op=put&exp&size&type&sig  - загрузка из браузера игрока: размер ровно size (≤ 15 МБ), тип - из списка и совпадает с заголовком,
//                                              после загрузки - проверка начала файла (картинка/видео по сигнатуре), иначе файл удаляется
//   GET    /f/<key>?op=get&exp&sig            - скачать (ссылка в Telegram): всегда как вложение, без исполнения в браузере
//   DELETE /f/<prefix>?op=del&exp&sig         - удалить всё по префиксу p/<player_id>/ (удаление аккаунта)
// Автоудаление через 60 дней - правило жизненного цикла хранилища (wrangler r2 bucket lifecycle).
const MAX = 15 * 1024 * 1024;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const ORIGINS = [/^https:\/\/(www\.)?fortunawtm\.com$/, /^https:\/\/[a-z0-9-]+\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/];
const enc = new TextEncoder();

function cors(req) {
  const o = req.headers.get('Origin') || '';
  return ORIGINS.some((r) => r.test(o)) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'PUT, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
}
const b64url = (u) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, s) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(s))));
}
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
// сигнатуры: png, jpeg, webp (RIFF....WEBP), mp4/mov (....ftyp или ....moov/wide/mdat), webm (EBML)
function magicOk(type, b) {
  const s = (i, t) => [...t].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (type === 'image/png') return b[0] === 0x89 && s(1, 'PNG');
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/webp') return s(0, 'RIFF') && s(8, 'WEBP');
  if (type === 'video/mp4' || type === 'video/quicktime') return s(4, 'ftyp') || s(4, 'moov') || s(4, 'wide') || s(4, 'mdat') || s(4, 'free') || s(4, 'skip');
  if (type === 'video/webm') return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
  return false;
}
const txt = (req, status, msg) => new Response(msg, { status, headers: { ...cors(req), 'Content-Type': 'text/plain; charset=utf-8' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/f/')) return txt(req, 404, 'not found');
    const key = url.pathname.slice(3).split('/').map(decodeURIComponent).join('/');
    if (!/^p\/[0-9a-f-]{36}\/(\d+\/[A-Za-z0-9._-]{1,80})?$/.test(key)) return txt(req, 400, 'bad key');
    const q = url.searchParams, op = q.get('op') || '', exp = q.get('exp') || '', sig = q.get('sig') || '';
    if (!env.SUPPORT_FILE_KEY) return txt(req, 503, 'not configured');
    if (!/^\d{9,11}$/.test(exp) || +exp < Date.now() / 1000) return txt(req, 403, 'expired');
    const size = op === 'put' ? q.get('size') || '' : '', type = op === 'put' ? q.get('type') || '' : '';
    if (!same(sig, await hmac(env.SUPPORT_FILE_KEY, [op, key, exp, size, type].join('\n')))) return txt(req, 403, 'bad signature');

    if (op === 'put' && req.method === 'PUT') {
      const n = +size;
      if (!TYPES[type] || !(n > 0 && n <= MAX) || key.endsWith('/')) return txt(req, 400, 'bad file');
      if ((req.headers.get('Content-Type') || '').split(';')[0].trim() !== type) return txt(req, 415, 'type mismatch');
      if (+(req.headers.get('Content-Length') || -1) !== n) return txt(req, 411, 'length mismatch');
      if (await env.B.head(key)) return txt(req, 409, 'exists');
      const fixed = new FixedLengthStream(n); // R2 знает длину заранее; больше n байт не пропустит
      const put = env.B.put(key, fixed.readable, { httpMetadata: { contentType: type } });
      await req.body.pipeTo(fixed.writable).catch(() => {});
      try { await put; } catch (_) { return txt(req, 400, 'upload failed'); }
      const head = await env.B.get(key, { range: { offset: 0, length: 16 } });
      const b = head ? new Uint8Array(await head.arrayBuffer()) : new Uint8Array(0);
      if (!magicOk(type, b)) { await env.B.delete(key); return txt(req, 415, 'not an image or video'); }
      return txt(req, 200, 'ok');
    }
    if (op === 'get' && req.method === 'GET') {
      if (key.endsWith('/')) return txt(req, 400, 'bad key');
      const o = await env.B.get(key);
      if (!o) return txt(req, 404, 'gone');
      const name = key.split('/').pop();
      return new Response(o.body, { headers: { ...cors(req), 'Content-Type': o.httpMetadata?.contentType || 'application/octet-stream', 'Content-Length': String(o.size), 'Content-Disposition': `attachment; filename="${name}"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': 'private, max-age=3600' } });
    }
    if (op === 'del' && req.method === 'DELETE') {
      if (!key.endsWith('/')) return txt(req, 400, 'prefix only');
      let cursor, n = 0;
      do { const l = await env.B.list({ prefix: key, cursor, limit: 1000 }); if (l.objects.length) { await env.B.delete(l.objects.map((x) => x.key)); n += l.objects.length; } cursor = l.truncated ? l.cursor : undefined; } while (cursor);
      return txt(req, 200, 'deleted ' + n);
    }
    return txt(req, 405, 'method');
  },
};
