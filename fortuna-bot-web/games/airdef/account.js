// Аккаунты «Воздушного превосходства» (Mark 2026-10-25): отдельные аккаунты игры (логин и пароль игры, ник для рейтинга) и прежний аккаунт
// сайта. Новичкам - только аккаунт игры (Mark: «все в одной категории аккаунтов»); аккаунт сайта игра использует лишь у «старых» игроков, у кого
// уже есть прогресс игры, ещё не перенесённый (legacySite: статус сайта из airdef-account site_status, кэш в localStorage). Активный - аккаунт игры,
// иначе «старый» аккаунт сайта, иначе гость: от него идут прогресс, онлайн-билет и итог боя. Рейтинг - только у аккаунта игры;
// прогресс сайта можно один раз перенести в аккаунт игры (функция airdef-account, sql/022). Чистый модуль: хранилище, запросы, заглушка ?rmock=1.
/* global CONFIG */
import { tr } from './i18n.js?v=20261118b';
import { AVA_SHOP } from './arsenal.js?v=20261118b';

const KEY_GAME = 'fortuna_airdef_acc', KEY_SITE = 'fortuna_web_player', KEY_SST = 'fortuna_airdef_site_st';
// ?rmock=1 - заглушка: airdef-account и get-airdef-rating отвечают локально (сервер ещё не применён в боевой базе); ?rmock=empty - у «вас» нет боёв,
// ?rmock=idle - в «Моих боях» ещё и бой без действий; ?rmock=newsite - как 1, но аккаунт сайта без прогресса игры (новичок).
// Только на своём компьютере и в локальной сети: на боевом сайте заглушка сохраняла бы аккаунт 'rmock-…', с которым игра молча идёт без сервера
const LOCAL_HOST = (() => { try { const h = String(location.hostname || ''); return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^192\.168\./.test(h) || /^10\./.test(h) || /\.local$/.test(h); } catch (_) { return false; } })();
export const RMOCK = (() => { try { return LOCAL_HOST ? new URLSearchParams(location.search).get('rmock') || '' : ''; } catch (_) { return ''; } })();
export const isMock = (id) => String(id || '').startsWith('rmock-');

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
export function gameAcc() { const a = read(KEY_GAME); return a && a.id && a.login ? a : null; }
export function siteAcc() { const p = read(KEY_SITE); return p && p.id && p.login ? p : null; }
// sess - секретный ключ сессии этого устройства (Mark 2026-11-17, sql/032): функции игры принимают аккаунт игры только по нему; новый объект без ключа
// (смена ника, перенос) ключ того же аккаунта сохраняет
export function setGameAcc(a) { const o = read(KEY_GAME), sess = a.sess || (o && o.id === a.id ? o.sess : undefined);
  if (o && o.sess && sess && o.sess !== sess && !RMOCK) acct('logout', { sess: o.sess }).catch(() => {}); // новый ключ на устройстве (вход в другой аккаунт, перенос) - прежний гасим
  try { localStorage.setItem(KEY_GAME, JSON.stringify({ id: a.id, login: a.login, nick: a.nick || a.login, transferred: !!a.transferred, ...(sess ? { sess } : {}) })); } catch (_) { /* приватный режим */ } }
export function clearGameAcc() { try { localStorage.removeItem(KEY_GAME); } catch (_) { try { localStorage.setItem(KEY_GAME, 'null'); } catch (_2) { /* нет */ } } }
if (!RMOCK) { const g = read(KEY_GAME); if (g && isMock(g.id)) clearGameAcc(); } // аккаунт заглушки, оставшийся от прежнего запуска ?rmock, без заглушки не нужен

// ── «старый» аккаунт сайта: статус хранится в localStorage { id, progress, transferred } для текущего аккаунта сайта ──
// (заглушка ?rmock - только в памяти: её ответ не должен попасть в настоящий кэш)
const SS = { id: '', p: null, st: null, failAt: 0 }, subs = [];
function stCached() {
  const s = siteAcc(); if (!s) return null;
  if (RMOCK) return SS.id === s.id ? SS.st : null;
  const c = read(KEY_SST); return c && c.id === s.id ? { progress: !!c.progress, transferred: !!c.transferred } : null;
}
export const legacySite = () => { const c = stCached(); return !!c && c.progress && !c.transferred; }; // синхронно: аккаунт сайта с прогрессом игры, ещё не перенесённым
// сохранить статус; если от него изменился активный аккаунт - оповестить (вход / выход / перенос - тот же повод, что у окна аккаунта)
function stStore(st) {
  const s = siteAcc(); if (!s) return;
  const was = legacySite();
  SS.id = s.id; SS.st = st;
  if (!RMOCK) try { localStorage.setItem(KEY_SST, JSON.stringify({ id: s.id, progress: st.progress, transferred: st.transferred })); } catch (_) { /* приватный режим */ }
  if (was !== legacySite()) for (const f of subs) try { f(); } catch (e) { console.warn('account', e); }
}
// вошёл на сайте, статус известен и «старым» игроком он не считается (нет прогресса игры или уже перенесён) - игре нужен отдельный аккаунт игры
export const siteNewbie = () => !!siteAcc() && !!stCached() && !legacySite();
export const onAccChange = (f) => { subs.push(f); }; // активный аккаунт сменился сам (пришёл статус сайта, сервер сказал «нужен аккаунт игры»)
// активный аккаунт: игры, иначе «старый» аккаунт сайта, иначе null (гость)
export function activeAcc() {
  const g = gameAcc(); if (g) return { id: g.id, login: g.login, nick: g.nick || g.login, kind: 'airdef' };
  const s = siteAcc(); return s && legacySite() ? { id: s.id, login: s.login, nick: s.login, kind: 'site' } : null;
}
// сервер ответил 403 need_game: у аккаунта сайта нет прогресса игры - играть только с аккаунтом игры
export function siteNoProgress() { const s = siteAcc(); if (s && !gameAcc()) stStore({ progress: false, transferred: false }); }

// ── запросы ──
// ключ сессии: запросы с номером своего аккаунта игры несут ещё и его ключ (sess); сервер ответил «ключ не годится» (401 session) - один раз
// получаем новый (ensureSession: уже вошедшее до ключей устройство меняет id + логин на ключ) и повторяем
export function withSess(body) { const g = gameAcc(); return body && g && g.sess && body.player_id === g.id && !body.sess ? { ...body, sess: g.sess } : body; }
// 401 session на ключ sent: если его уже сменил другой запрос - просто повторить; иначе обмен (ensureSession(true)). true - можно повторить с withSess
export async function refreshSession(sent) { const g = gameAcc(); if (!g) return false; if (g.sess && g.sess !== sent) return true; return ensureSession(true); }
const resend = (body, sent) => { const g = gameAcc(); if (!body || !g) return body; return body.sess === sent || body.player_id === g.id ? { ...body, sess: g.sess } : body; };
export async function callFn(fn, body, retried) {
  body = withSess(body); const sent = body && body.sess;
  try { return await callFn0(fn, body); } catch (e) {
    if (retried || e.status !== 401 || e.code !== 'session' || !gameAcc()) throw e;
    if (!(await refreshSession(sent))) throw e;
    return callFn(fn, resend(body, sent), true);
  }
}
// ключа нет (вошли до ключей) или он отозван: обмен id + логин на ключ; не вышло (аккаунт засвечен или удалён) - выйти и попросить войти паролем
let sessP = null;
export const reloginNeeded = { on: false };
export function ensureSession(force) {
  const g = gameAcc(); if (!g || (g.sess && !force)) return Promise.resolve(!!g);
  if (!sessP) sessP = acct('session', { id: g.id, login: g.login }).then((d) => { const n = gameAcc(); if (n && n.id === g.id && d.session) setGameAcc({ ...n, sess: d.session }); return true; }).catch((e) => {
    if (e.status === 401 && e.code === 'relogin' && gameAcc() && gameAcc().id === g.id) { clearGameAcc(); reloginNeeded.on = true; for (const f of subs) try { f(); } catch (_) { /* подписчик */ } } // за время обмена вошли в другой - его не трогаем
    return false;
  }).finally(() => { sessP = null; });
  return sessP;
}
// выход: ключ этого устройства гасится на сервере (не дожидаясь ответа), аккаунт - с устройства
export function logoutGame() { const g = gameAcc(); if (g && g.sess && !RMOCK) acct('logout', { sess: g.sess }).catch(() => {}); clearGameAcc(); }
// поля для своих запросов (билет онлайна, итог боя): номер и, у аккаунта игры, ключ
export function authBody(acc) { const g = gameAcc(); return { player_id: acc.id, ...(g && g.id === acc.id && g.sess ? { sess: g.sess } : {}) }; }
async function callFn0(fn, body) {
  if (RMOCK) return mockFn(fn, body);
  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) throw Object.assign(new Error(tr('Нет связи с сайтом')), { status: 0 });
  const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
  let res; try { res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify(body) }); }
  catch (_) { throw Object.assign(new Error(tr('Нет связи с сайтом')), { status: 0, offline: typeof navigator !== 'undefined' && navigator.onLine === false }); } // у ненайденной функции Supabase ответ без CORS - браузер даёт ту же ошибку, что и при обрыве
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d.error || tr('Ошибка сервера')), { status: res.status, code: d.code || '' }); // code - машинный код ответа airdef-account (login_taken, nick_taken, nick_site, already_used…)
  return d;
}
const acct = (action, body) => callFn('airdef-account', { action, ...body });
export const accountApi = {
  register: (login, password, nick) => acct('register', { login, password, nick }).then((d) => ({ ...d.account, sess: d.session })),
  login: (login, password) => acct('login', { login, password }).then((d) => ({ ...d.account, sess: d.session })),
  rename: (id, password, nick) => acct('rename', { id, password, nick }).then((d) => d.account),
  remove: async () => { await ensureSession(); const g = gameAcc(); if (!g || !g.sess) throw Object.assign(new Error(tr('Войдите в аккаунт игры заново')), { status: 401 }); return acct('delete', { sess: g.sess, confirm: true }); }, // удаление (Mark 2026-11-17): без пароля, по ключу сессии этого устройства
  transfer: (id, password, site_login, site_password) => acct('transfer', { id, password, site_login, site_password }).then((d) => { if (d.account && d.session) d.account.sess = d.session; return d; }),
  // перенос в один шаг (у игрока нет аккаунта игры): сервер сам создаёт аккаунт игры и переносит прогресс; b: { site_login, site_password, password?, login?, nick? }
  migrate: (b) => acct('migrate', b).then((d) => { if (d.account && d.session) d.account.sess = d.session; return d; }),
};
// есть ли у аккаунта сайта прогресс игры, который ещё не перенесён: { progress, transferred } - из кэша; нет кэша для этого аккаунта сайта -
// запрос (promise; после ошибки - не чаще раза в минуту), его итог ложится в кэш и, если что-то поменялось, оповещает подписчиков
export function siteStatus() {
  const s = siteAcc(); if (!s) return null;
  if (SS.id !== s.id) { SS.id = s.id; SS.p = null; SS.st = null; SS.failAt = 0; }
  const c = stCached(); if (c) return c;
  if (!SS.p && Date.now() - SS.failAt > 60000) SS.p = acct('site_status', { site_id: s.id }).then((d) => { SS.p = null; if (siteAcc() && siteAcc().id === s.id) stStore({ progress: !!d.progress, transferred: !!d.transferred }); return stCached(); }, () => { SS.failAt = Date.now(); SS.p = null; return null; });
  return SS.p;
}
export const siteStatusDone = () => { if (siteAcc()) stStore({ progress: true, transferred: true }); };
// «Перенести прогресс» уместно: вошёл на сайте, у аккаунта сайта есть прогресс игры, ещё не перенесён, и в аккаунт игры его ещё не переносили
export function transferOk() { const g = gameAcc(); return legacySite() && !(g && g.transferred); }
export const rating = (playerId) => { const b = playerId ? { player_id: playerId } : {}; return callFn('get-airdef-rating', b).catch((e) => (e && e.status >= 500 ? new Promise((r) => setTimeout(r, 1200)).then(() => callFn('get-airdef-rating', b)) : Promise.reject(e))); }; // свой аккаунт игры - с ключом (callFn); 500 (функция только проснулась) - один тихий повтор
// профиль игрока по нику (get-airdef-profile, sql/029; Mark 2026-10-28): season - сезон, который сейчас в окне рейтинга
export const profile = (nick, season) => callFn('get-airdef-profile', { nick, ...(season ? { season } : {}) });

// ── заглушка ?rmock=1: примеры из макета рейтинга ──
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MOCK = { transferred: false };
const mockAcc = (login, nick) => ({ id: 'rmock-' + String(login).toLowerCase(), login, nick: nick || login, transferred: MOCK.transferred });
const mockErr = (status, error, code) => Object.assign(new Error(error), { status, code: code || '' });
async function mockFn(fn, b) {
  await sleep(160);
  if (fn === 'airdef-account') {
    if (b.action === 'register') {
      if (/^busy$/i.test(b.login)) throw mockErr(409, 'Этот логин уже занят', 'login_taken');
      const s = siteAcc(); if (s && String(b.nick).toLowerCase() === s.login.toLowerCase()) throw mockErr(409, 'Этот ник - логин аккаунта сайта. Если он ваш - перенесите прогресс, ник останется за вами', 'nick_site');
      return { account: mockAcc(b.login, b.nick) };
    }
    if (b.action === 'migrate') { // site_password 'wrong' - 401; site_login 'used' - already_used; логин 'busy' - занят; ник 'busy' - занят; пароль сайта 'short' без своего пароля - password_needed
      if (b.site_password === 'wrong') throw mockErr(401, 'Неверный логин или пароль сайта');
      if (/^used$/i.test(b.site_login)) throw mockErr(409, 'С этого аккаунта сайта прогресс уже перенесён', 'already_used');
      if (/^busy$/i.test(b.login || b.site_login)) throw mockErr(409, 'Этот логин уже занят', 'login_taken');
      if (/^busy$/i.test(b.nick || '')) throw mockErr(409, 'Этот ник уже занят', 'nick_taken');
      if (b.site_password === 'short' && !b.password) throw mockErr(400, 'Пароль сайта короче 6 символов', 'password_needed');
      MOCK.transferred = true; const lg = b.login || b.site_login;
      return { account: mockAcc(lg, b.nick || b.site_login), moved: { progress: true, runs: 12, online: 5 } };
    }
    if (b.action === 'login') { if (b.password === 'wrong') throw mockErr(401, 'Неверный логин или пароль'); return { account: mockAcc(b.login, (read(KEY_GAME) || {}).nick) }; }
    if (b.action === 'rename') { const g = gameAcc(); return { account: mockAcc(g ? g.login : 'player', b.nick) }; }
    if (b.action === 'delete') return { deleted: true };
    if (b.action === 'session') return { session: 'rmock-session-' + 'x'.repeat(24) };
    if (b.action === 'logout') return { ok: true };
    if (b.action === 'transfer') { if (b.site_password === 'wrong') throw mockErr(401, 'Неверный логин или пароль сайта'); MOCK.transferred = true; const g = gameAcc(); return { moved: { progress: true, runs: 12, online: 5 }, account: mockAcc(g ? g.login : 'player', g && g.nick) }; }
    if (b.action === 'site_status') return { progress: RMOCK !== 'newsite', transferred: MOCK.transferred }; // ?rmock=newsite - новичок с аккаунтом сайта
    throw mockErr(400, 'Неизвестное действие');
  }
  if (fn === 'get-airdef-rating') return mockRating(b.player_id);
  if (fn === 'get-airdef-profile') return mockProfile(b.nick, b.season);
  if (fn === 'airdef-shop') return mockShop(b);
  if (fn === 'airdef-support') return mockSupport(b);
  throw mockErr(404, 'Not found');
}
// поддержка (support-ui.js): три обращения как в макете (tools/airdef-mockups/support); create / reply отдают uploads с адресом mock:// - загрузки нет, сразу успех
// (?rmock=empty - обращений нет; ?rmock=err - любое действие отвечает 429 limit, чтобы увидеть ошибку)
let MSUP = null;
function mockSupport(b) {
  const ago = (d, h, m) => new Date(Date.now() - d * 86400000 - h * 3600000 - m * 60000).toISOString(), lim = { maxFiles: 3, maxFileMB: 15, maxText: 2000 };
  if (!MSUP) {
    const e = RMOCK === 'empty';
    MSUP = { n: 45, tickets: e ? [] : [
      { id: 45, topic: 'idea', title: 'Ночной бой в «Мульти-волне»', status: 'new', unread: false, created_at: ago(0, 2, 0), updated_at: ago(0, 2, 0), files: 0 },
      { id: 42, topic: 'bug', title: 'Пропал звук ракет', status: 'answered', unread: true, created_at: ago(1, 14, 0), updated_at: ago(0, 11, 30), files: 2 },
      { id: 39, topic: 'purchase', title: 'Не пришли кристаллы за задание', status: 'closed', unread: false, created_at: ago(6, 3, 0), updated_at: ago(6, 1, 0), files: 0 }],
      msgs: { 45: [{ id: 'm1', author: 'player', body: 'Хочется ночной бой в «Мульти-волне»: прожекторы, трассеры, меньше видимость.', files: [], created_at: ago(0, 2, 0) }],
        42: [{ id: 'm2', author: 'player', body: 'После второй волны на «Речном узле» пропал звук ракет - вернулся только после перезапуска игры.\nПовторилось два раза.', files: [{ name: 'screenshot.webp', size: 420000, type: 'image/webp' }, { name: 'видео.mp4', size: 14900000, type: 'video/mp4' }], created_at: ago(1, 14, 0) },
          { id: 'm3', author: 'support', body: 'Спасибо! Нашли причину: звук не возвращался после паузы на второй волне. Исправим в ближайшем обновлении.', files: [], created_at: ago(0, 11, 30) }],
        39: [{ id: 'm4', author: 'player', body: 'За задание «Три сбитых» не пришли кристаллы.', files: [], created_at: ago(6, 3, 0) }, { id: 'm5', author: 'support', body: 'Начислили вручную, приятной игры. Закрываю обращение.', files: [], created_at: ago(6, 1, 0) }] } };
  }
  if (RMOCK === 'err' && b.action !== 'list') throw mockErr(429, 'Слишком много обращений: следующее можно отправить через час', 'limit');
  const T = (id) => (typeof id === 'number' ? MSUP.tickets.find((t) => t.id === id) : null) /* номер - числом, как ждёт сервер (строка - «не найдено») */, ups = (fs) => (fs || []).map((_, i) => ({ url: 'mock://upload/' + i, method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' } }));
  if (b.action === 'list') return { tickets: MSUP.tickets.map((t) => ({ ...t })), unread: MSUP.tickets.filter((t) => t.unread).length, limits: lim };
  if (b.action === 'thread') { const t = T(b.id); if (!t) throw mockErr(404, 'Обращение не найдено'); t.unread = false; return { ticket: { id: t.id, topic: t.topic, title: t.title, status: t.status, created_at: t.created_at }, messages: MSUP.msgs[t.id] || [] }; }
  if (b.action === 'create') {
    if (!String(b.body || '').trim()) throw mockErr(400, 'Пустой текст'); const id = ++MSUP.n, now = new Date().toISOString();
    MSUP.tickets.unshift({ id, topic: b.topic, title: String(b.body).split('\n')[0].slice(0, 60), status: 'new', unread: false, created_at: now, updated_at: now, files: (b.files || []).length });
    MSUP.msgs[id] = [{ id: 'm' + id, author: 'player', body: b.body, files: b.files || [], created_at: now }]; MSUP.last = { id, mid: 'm' + id };
    return { id, msg_id: id * 100, uploads: ups(b.files) };
  }
  if (b.action === 'reply') {
    const t = T(b.id); if (!t) throw mockErr(404, 'Обращение не найдено'); if (t.status === 'closed') throw mockErr(400, 'Обращение закрыто');
    const mid = Date.now() % 1e9; (MSUP.msgs[t.id] ||= []).push({ id: mid, author: 'player', body: b.body, files: b.files || [], created_at: new Date().toISOString() }); t.status = 'new'; t.updated_at = new Date().toISOString();
    return { msg_id: mid, uploads: ups(b.files) };
  }
  if (b.action === 'sent' || b.action === 'cancel') return { ok: true };
  if (b.action === 'close') { const t = T(b.id); if (t) t.status = 'closed'; return { ok: true }; }
  throw mockErr(400, 'Неизвестное действие');
}
// магазин (shop-ui.js): 340 кристаллов; ?shop=token - окраска на выбор, owned - обе окраски куплены и «Инферно» надета, две аватарки куплены и одна надета, poor - не хватает на окраску, broke - и на аватарку
const SHOP0 = { token: { crystals: 60, camos: [], picks: 1, worn: {} }, owned: { crystals: 190, camos: ['e_f15e:inferno', 'e_mig31:dragon', 'ava:a13', 'ava:a16'], picks: 0, worn: { e_f15e: 'inferno', ava: 'a16' } },
  poor: { crystals: 120, camos: [], picks: 0, worn: {} }, broke: { crystals: 8, camos: [], picks: 0, worn: {} } };
let MSHOP = null;
function mockShop(b) {
  if (!MSHOP) { let st = ''; try { st = new URLSearchParams(location.search).get('shop') || ''; } catch (_) { /* нет адреса */ } MSHOP = JSON.parse(JSON.stringify(SHOP0[st] || { crystals: 340, camos: [], picks: 0, worn: {} })); }
  const W = MSHOP, PRICE = String(b.key || '').startsWith('ava:') ? 20 : 150; // как AVA_PRICE и CAMO_PRICE (arsenal.js)
  if (b.action === 'buy') { if (W.camos.includes(b.key)) throw mockErr(409, tr('Эта окраска уже ваша')); if (W.crystals < PRICE) throw mockErr(409, tr('Не хватает кристаллов')); W.crystals -= PRICE; W.camos.push(b.key); }
  else if (b.action === 'pick') { if (W.picks < 1) throw mockErr(409, tr('Окраски на выбор нет')); W.picks -= 1; W.camos.push(b.key); }
  else if (b.action === 'wear') { if (b.key) { const [pl, id] = b.key.split(':'); W.worn[pl] = id; } else delete W.worn[b.plane]; }
  else if (b.action !== 'state') throw mockErr(400, tr('Неизвестное действие'));
  return { season: 1, wallet: JSON.parse(JSON.stringify(W)) };
}
const MOCK_TOP = [['Гром_52', 6480], ['SkyKeeper', 6215], ['Волхов', 6090], ['Tanker_Alpha', 5870], ['Беркут-7', 5655], ['Орлан', 5410], ['Strela_21', 5330], ['Ястреб', 5260], ['Nord_Fox', 5190], ['Кречет', 5120], ['Zenit', 5040], ['Дозор-3', 4980],
  ['Ghost_Rider', 4900], ['Сокол', 4860], ['Radar_K', 4790], ['Пересвет', 4720], ['MiG_Man', 4660], ['Бурый', 4590], ['Фортуна', 4530], ['Delta_9', 4470], ['Лис', 4400], ['Vector', 4350], ['Ермак', 4290], ['Patriot_7', 4230],
  ['Север', 4180], ['Hawk_Eye', 4130], ['Тополь', 4080], ['Raptor', 4040], ['Грач', 4000], ['Pilot_Q', 3990], ['Мираж', 3985], ['Alfa_Z', 3975], ['Шторм', 3970], ['Бекас', 3960], ['Iron_Sky', 3955], ['Лунь', 3950]];
function mockRating(pid) {
  const day = 86400000, t0 = Date.parse('2026-10-25T00:00:00+03:00'), t1 = Date.parse('2027-01-01T00:00:00+03:00') /* сезон 1 - до 01.01.2027, sql/026 */, now = Date.now();
  const ago = (d, h, m) => new Date(now - d * day - h * 3600000 - m * 60000).toISOString();
  const g = gameAcc(), nick = g ? g.nick || g.login : 'xFORTUNAx';
  const top = MOCK_TOP.map(([n, p], i) => ({ place: i + 1, nick: n, points: p, n: 7, ava: AVA_SHOP[i % 13] })); // часть - без аватарки: у них та, что у всех
  top.push({ place: 37, nick, points: 3940, n: 5 }); // «вы» - 37-е место; остальные ниже
  for (let i = 0; i < 12; i++) top.push({ place: 38 + i, nick: ['Кедр', 'Rook', 'Ветер', 'Bravo_4', 'Лайка', 'Orbit', 'Гюрза', 'Sparrow', 'Ратник', 'Echo_2', 'Витязь', 'Nimbus'][i], points: 3930 - i * 90, n: 4 });
  const base = { season: 1, current: 1, live: true, starts_at: new Date(t0).toISOString(), ends_at: new Date(t1).toISOString(), next: null, total: 214, top };
  if (RMOCK === 'break') Object.assign(base, { current: 2, live: false, ends_at: ago(2, 0, 0), next: { season: 2, starts_at: new Date(now + 5 * day).toISOString() } }); // ?rmock=break - межсезонье
  if (!pid) return { ...base, me: null };
  const isGame = g && g.id === pid, empty = RMOCK === 'empty';
  if (!isGame) return { ...base, me: { kind: 'site', nick: null, place: null, points: 0, n: 0, battles: [] } };
  const B = (at, multi, mode, team, win, draw, rating, r, c, s, bm, m, k, counted) => ({ at, multi, mode, team, win, draw, rating, rp: { r, c, s, b: bm, m, k, idle: 0 }, counted });
  const battles = empty ? [] : [
    B(ago(1, 3, 20), false, 'real', 'air', true, false, 882, 400, 380, 60, 1, 1, 1.05, true),
    B(ago(2, 5, 55), true, 'real', 'pvo', true, false, 912, 400, 470, 42, 1, 1, 1, true),
    B(ago(3, 1, 48), false, 'arcade', 'pvo', true, false, 490, 400, 440, 50, 0.9, 0.6, 1.02, true),
    B(ago(4, 6, 30), false, 'real', 'air', false, false, 165, 0, 310, 20, 0.5, 1, 1, false),
    B(ago(5, 2, 33), true, 'real', 'air', false, true, 660, 200, 420, 40, 1, 1, 1, true),
    B(ago(6, 4, 45), false, 'real', 'air', true, false, 996, 400, 460, 62, 1, 1, 1.08, true),
  ];
  if (RMOCK === 'idle') battles.push({ at: ago(7, 9, 10), multi: false, mode: 'real', team: 'air', win: false, draw: false, rating: 0, rp: { r: 0, c: 0, s: 0, b: 1, m: 1, k: 1, idle: 1 }, counted: false }); // бой без действий
  return { ...base, me: { kind: 'airdef', nick, place: empty ? null : 37, points: empty ? 0 : 3940, n: empty ? 0 : 5, battles } };
}
// профиль (заглушка get-airdef-profile): игроки - из таблицы mockRating, числа - от ника (одни и те же при каждом открытии); свой ник при
// ?rmock=empty - профиль без боёв; места за сезоны - у первых 12 (чтобы видеть значки, хотя сезон 1 ещё идёт)
function mockProfile(nick, season) {
  const R = mockRating(null), row = R.top.find((r) => r.nick.toLowerCase() === String(nick || '').trim().toLowerCase());
  if (!row) throw mockErr(404, 'Игрок не найден');
  const g = gameAcc(), own = row.nick === (g ? g.nick || g.login : 'xFORTUNAx'), empty = own && RMOCK === 'empty';
  let h = 7; for (const ch of row.nick) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const rnd = () => ((h = (Math.imul(h, 1103515245) + 12345) >>> 0) / 4294967296);
  const md = (k) => { const n = (3 + Math.floor(rnd() * 10)) * k; return { n, w: Math.floor(n * (0.35 + rnd() * 0.35)), k: Math.floor(n * (1 + rnd() * 2)), best: 640 + Math.floor(rnd() * 350) }; };
  const PL = ['su30', 'mig29', 'f16', 'e_su27', 'e_f15e', 'e_su34'], SM = ['s300', 'torm2', 'pantsir', 'patriot', 'buk', 'nasams'];
  const fav = (k) => (empty ? { plane: null, sam: null } : { plane: { key: PL[h % PL.length], n: 7 * k, of: 16 * k }, sam: { key: SM[(h >>> 3) % SM.length], n: 4 * k, of: 9 * k } });
  const day = 86400000, now = Date.now(), n = empty ? 0 : row.n || 5, kinds = ['air', 'air', 'pvo', 'pvo', 'multi', 'multi', 'air'];
  const best = Array.from({ length: n }, (_, i) => ({ at: new Date(now - (i + 1) * day * 0.6 - rnd() * 6 * 3600000).toISOString(), kind: kinds[i], mode: rnd() < 0.85 ? 'real' : 'arcade', win: rnd() < 0.75, draw: false, k: kinds[i] === 'multi' ? 1 : [1, 1.02, 1.05, 1.08][Math.floor(rnd() * 4)], rating: 0 }));
  let left = empty ? 0 : row.points; best.forEach((b, i) => { b.rating = i === n - 1 ? left : Math.round(row.points / n * (1.15 - i * 0.05)); left -= b.rating; });
  best.sort((a, b) => b.rating - a.rating);
  const modes = empty ? { season: {}, all: {} } : { season: { air: md(1), pvo: md(1), multi: md(1) }, all: { air: md(2), pvo: md(2), multi: md(2) } };
  const games = Object.values(modes.all).reduce((a, x) => a + x.n, 0);
  return { season: season || R.season, live: R.live, profile: { nick: row.nick, ava: row.ava, since: '2026-10-25T12:00:00+03:00', games, place: empty ? null : row.place, points: empty ? 0 : row.points, n,
    modes, fav: { season: fav(1), all: fav(2) }, best, awards: row.place <= 12 && !empty ? [{ season: 1, place: row.place }] : [] } };
}

if (siteAcc()) siteStatus(); // при старте: статуса для этого аккаунта сайта нет - спросить (в кэше есть - ничего не делает); в конце файла: заглушка использует const ниже
