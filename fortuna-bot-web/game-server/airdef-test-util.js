// Общее для автопроверок игрового сервера «Воздушного превосходства» с настоящим секретом: билеты аккаунтов (как делает edge-функция
// mp-ticket) и разбор подписанного итога боя (как airdef-claim). Только для тестов.
const enc = new TextEncoder();
export const SECRET = 'test-secret-airdef';
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
let key = null;
// билет входа: base64url(JSON {pid, login, exp}) + '.' + base64url(HMAC-SHA256(SECRET, первая часть))
export async function ticket(pid, login) {
  key ||= await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const body = b64u(enc.encode(JSON.stringify({ pid, login, exp: Math.floor(Date.now() / 1000) + 600 })));
  return body + '.' + b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body))));
}
// итог боя: проверить подпись и вернуть тело (null — подпись неверна)
export async function readResult(token) {
  key ||= await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !(await crypto.subtle.verify('HMAC', key, unb64u(sig), enc.encode(body)))) return null;
  return JSON.parse(new TextDecoder().decode(unb64u(body)));
}
// UUID-подобный id аккаунта для теста (не 'test-…': такие итог не подписывается)
export const pidOf = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
