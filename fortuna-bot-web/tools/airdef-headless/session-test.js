// Проверка ключей сессий (supabase/functions/_shared/airdef-session.ts) на подставной базе: выдача, проверка, аккаунт игры без ключа - 401,
// аккаунт сайта - по номеру, чужой и просроченный ключ, выход, не больше 10 устройств. deno run -A tools/airdef-headless/session-test.js
import { newSession, dropSession, sessionPlayer, sha256hex } from '../../supabase/functions/_shared/airdef-session.ts';
const T = { players: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', kind: 'airdef' }, { id: 'bbbbbbbb-0000-4000-8000-000000000002', kind: 'site' }], airdef_sessions: [], airdef_accounts: [{ player_id: 'aaaaaaaa-0000-4000-8000-000000000001', sess_since: null }] };
function q(table) { // крошечная копия цепочек supabase-js, которые использует модуль
  let rows = T[table], op = 'select', patch = null, ins = null, order = null, rng = null;
  const api = {
    select() { return api; }, insert(r) { ins = r; op = 'insert'; return api; }, update(p) { patch = p; op = 'update'; return api; }, delete() { op = 'delete'; return api; },
    eq(k, v) { rows = rows.filter((r) => r[k] === v); return api; }, is(k, v) { rows = rows.filter((r) => (r[k] ?? null) === v); return api; }, in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return api; },
    order(k, o) { order = [k, o.ascending]; return api; }, range(a, b) { rng = [a, b]; return api; }, limit() { return api; },
    maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
    then(res) {
      if (op === 'insert') { T[table].push({ created_at: new Date().toISOString(), last_used: new Date().toISOString(), expires_at: new Date(Date.now() + 90 * 864e5).toISOString(), ...ins }); return res({ error: null }); }
      if (op === 'update') { rows.forEach((r) => Object.assign(r, patch)); return res({ error: null }); }
      if (op === 'delete') { T[table] = T[table].filter((r) => !rows.includes(r)); return res({ error: null }); }
      let out = rows.slice(); if (order) out.sort((a, b) => (a[order[0]] < b[order[0]] ? 1 : -1) * (order[1] ? -1 : 1)); if (rng) out = out.slice(rng[0], rng[1] + 1);
      return res({ data: out, error: null });
    },
  };
  return api;
}
const db = { from: q };
let bad = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const s1 = await newSession(db, 'aaaaaaaa-0000-4000-8000-000000000001');
ok(s1.length >= 40 && !T.airdef_sessions.some((r) => r.token_hash === s1), 'ключ длинный, в базе - только хеш');
ok(T.airdef_sessions[0].token_hash === await sha256hex(s1), 'хеш совпадает');
const since = T.airdef_accounts[0].sess_since; ok(!!since, 'отмечено: ключ выдавался (обмен без пароля закрыт)');
await newSession(db, 'aaaaaaaa-0000-4000-8000-000000000001'); ok(T.airdef_accounts[0].sess_since === since, 'отметка не перезаписывается');
ok((await sessionPlayer(db, { sess: s1 })).id === 'aaaaaaaa-0000-4000-8000-000000000001', 'по ключу - свой игрок');
ok((await sessionPlayer(db, { player_id: 'aaaaaaaa-0000-4000-8000-000000000001' })).err?.status === 401, 'аккаунт игры по одному номеру - 401');
ok((await sessionPlayer(db, { player_id: 'aaaaaaaa-0000-4000-8000-000000000001', sess: 'x'.repeat(43) })).err?.status === 401, 'чужой ключ - 401');
ok((await sessionPlayer(db, { player_id: 'bbbbbbbb-0000-4000-8000-000000000002' })).id === 'bbbbbbbb-0000-4000-8000-000000000002', 'аккаунт сайта - по номеру, как раньше');
ok(!(await sessionPlayer(db, { player_id: 'aaaaaaaa-0000-4000-8000-000000000001' }, false)).id, 'нестрогий режим: номер аккаунта игры - «нет игрока»');
T.airdef_sessions[0].expires_at = new Date(Date.now() - 1000).toISOString();
ok((await sessionPlayer(db, { sess: s1 })).err?.status === 401, 'просроченный ключ - 401');
const s2 = await newSession(db, 'aaaaaaaa-0000-4000-8000-000000000001'); await dropSession(db, s2);
ok((await sessionPlayer(db, { sess: s2 })).err?.status === 401, 'после выхода ключ не действует');
for (let i = 0; i < 14; i++) await newSession(db, 'aaaaaaaa-0000-4000-8000-000000000001');
ok(T.airdef_sessions.filter((r) => r.player_id === 'aaaaaaaa-0000-4000-8000-000000000001').length <= 10, 'не больше 10 устройств');
console.log(bad ? `ИТОГ: ошибок ${bad}` : 'ИТОГ: всё прошло'); Deno.exit(bad ? 1 : 0);
