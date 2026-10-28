// Аккаунты «Воздушного превосходства» (Mark 2026-10-25): отдельные аккаунты игры (логин и пароль игры, ник для рейтинга) и прежний аккаунт
// сайта. Новичкам — только аккаунт игры (Mark: «все в одной категории аккаунтов»); аккаунт сайта игра использует лишь у «старых» игроков, у кого
// уже есть прогресс игры, ещё не перенесённый (legacySite: статус сайта из airdef-account site_status, кэш в localStorage). Активный — аккаунт игры,
// иначе «старый» аккаунт сайта, иначе гость: от него идут прогресс, онлайн-билет и итог боя. Рейтинг — только у аккаунта игры;
// прогресс сайта можно один раз перенести в аккаунт игры (функция airdef-account, sql/022). Чистый модуль: хранилище, запросы, заглушка ?rmock=1.
/* global CONFIG */
import { tr } from './i18n.js?v=20261028a';

const KEY_GAME = 'fortuna_airdef_acc', KEY_SITE = 'fortuna_web_player', KEY_SST = 'fortuna_airdef_site_st';
// ?rmock=1 — заглушка: airdef-account и get-airdef-rating отвечают локально (сервер ещё не применён в боевой базе); ?rmock=empty — у «вас» нет боёв,
// ?rmock=idle — в «Моих боях» ещё и бой без действий; ?rmock=newsite — как 1, но аккаунт сайта без прогресса игры (новичок).
// Только на своём компьютере и в локальной сети: на боевом сайте заглушка сохраняла бы аккаунт 'rmock-…', с которым игра молча идёт без сервера
const LOCAL_HOST = (() => { try { const h = String(location.hostname || ''); return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /^192\.168\./.test(h) || /^10\./.test(h) || /\.local$/.test(h); } catch (_) { return false; } })();
export const RMOCK = (() => { try { return LOCAL_HOST ? new URLSearchParams(location.search).get('rmock') || '' : ''; } catch (_) { return ''; } })();
export const isMock = (id) => String(id || '').startsWith('rmock-');

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } };
export function gameAcc() { const a = read(KEY_GAME); return a && a.id && a.login ? a : null; }
export function siteAcc() { const p = read(KEY_SITE); return p && p.id && p.login ? p : null; }
export function setGameAcc(a) { try { localStorage.setItem(KEY_GAME, JSON.stringify({ id: a.id, login: a.login, nick: a.nick || a.login, transferred: !!a.transferred })); } catch (_) { /* приватный режим */ } }
export function clearGameAcc() { try { localStorage.removeItem(KEY_GAME); } catch (_) { try { localStorage.setItem(KEY_GAME, 'null'); } catch (_2) { /* нет */ } } }
if (!RMOCK) { const g = read(KEY_GAME); if (g && isMock(g.id)) clearGameAcc(); } // аккаунт заглушки, оставшийся от прежнего запуска ?rmock, без заглушки не нужен

// ── «старый» аккаунт сайта: статус хранится в localStorage { id, progress, transferred } для текущего аккаунта сайта ──
// (заглушка ?rmock — только в памяти: её ответ не должен попасть в настоящий кэш)
const SS = { id: '', p: null, st: null, failAt: 0 }, subs = [];
function stCached() {
  const s = siteAcc(); if (!s) return null;
  if (RMOCK) return SS.id === s.id ? SS.st : null;
  const c = read(KEY_SST); return c && c.id === s.id ? { progress: !!c.progress, transferred: !!c.transferred } : null;
}
export const legacySite = () => { const c = stCached(); return !!c && c.progress && !c.transferred; }; // синхронно: аккаунт сайта с прогрессом игры, ещё не перенесённым
// сохранить статус; если от него изменился активный аккаунт — оповестить (вход / выход / перенос — тот же повод, что у окна аккаунта)
function stStore(st) {
  const s = siteAcc(); if (!s) return;
  const was = legacySite();
  SS.id = s.id; SS.st = st;
  if (!RMOCK) try { localStorage.setItem(KEY_SST, JSON.stringify({ id: s.id, progress: st.progress, transferred: st.transferred })); } catch (_) { /* приватный режим */ }
  if (was !== legacySite()) for (const f of subs) try { f(); } catch (e) { console.warn('account', e); }
}
// вошёл на сайте, статус известен и «старым» игроком он не считается (нет прогресса игры или уже перенесён) — игре нужен отдельный аккаунт игры
export const siteNewbie = () => !!siteAcc() && !!stCached() && !legacySite();
export const onAccChange = (f) => { subs.push(f); }; // активный аккаунт сменился сам (пришёл статус сайта, сервер сказал «нужен аккаунт игры»)
// активный аккаунт: игры, иначе «старый» аккаунт сайта, иначе null (гость)
export function activeAcc() {
  const g = gameAcc(); if (g) return { id: g.id, login: g.login, nick: g.nick || g.login, kind: 'airdef' };
  const s = siteAcc(); return s && legacySite() ? { id: s.id, login: s.login, nick: s.login, kind: 'site' } : null;
}
// сервер ответил 403 need_game: у аккаунта сайта нет прогресса игры — играть только с аккаунтом игры
export function siteNoProgress() { const s = siteAcc(); if (s && !gameAcc()) stStore({ progress: false, transferred: false }); }

// ── запросы ──
export async function callFn(fn, body) {
  if (RMOCK) return mockFn(fn, body);
  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) throw Object.assign(new Error(tr('Нет связи с сайтом')), { status: 0 });
  const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
  let res; try { res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify(body) }); }
  catch (_) { throw Object.assign(new Error(tr('Нет связи с сайтом')), { status: 0, offline: typeof navigator !== 'undefined' && navigator.onLine === false }); } // у ненайденной функции Supabase ответ без CORS — браузер даёт ту же ошибку, что и при обрыве
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(d.error || tr('Ошибка сервера')), { status: res.status, code: d.code || '' }); // code — машинный код ответа airdef-account (login_taken, nick_taken, nick_site, already_used…)
  return d;
}
const acct = (action, body) => callFn('airdef-account', { action, ...body });
export const accountApi = {
  register: (login, password, nick) => acct('register', { login, password, nick }).then((d) => d.account),
  login: (login, password) => acct('login', { login, password }).then((d) => d.account),
  rename: (id, password, nick) => acct('rename', { id, password, nick }).then((d) => d.account),
  transfer: (id, password, site_login, site_password) => acct('transfer', { id, password, site_login, site_password }),
  // перенос в один шаг (у игрока нет аккаунта игры): сервер сам создаёт аккаунт игры и переносит прогресс; b: { site_login, site_password, password?, login?, nick? }
  migrate: (b) => acct('migrate', b),
};
// есть ли у аккаунта сайта прогресс игры, который ещё не перенесён: { progress, transferred } — из кэша; нет кэша для этого аккаунта сайта —
// запрос (promise; после ошибки — не чаще раза в минуту), его итог ложится в кэш и, если что-то поменялось, оповещает подписчиков
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
export const rating = (playerId) => callFn('get-airdef-rating', playerId ? { player_id: playerId } : {});

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
      const s = siteAcc(); if (s && String(b.nick).toLowerCase() === s.login.toLowerCase()) throw mockErr(409, 'Этот ник — логин аккаунта сайта. Если он ваш — перенесите прогресс, ник останется за вами', 'nick_site');
      return { account: mockAcc(b.login, b.nick) };
    }
    if (b.action === 'migrate') { // site_password 'wrong' — 401; site_login 'used' — already_used; логин 'busy' — занят; ник 'busy' — занят; пароль сайта 'short' без своего пароля — password_needed
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
    if (b.action === 'transfer') { if (b.site_password === 'wrong') throw mockErr(401, 'Неверный логин или пароль сайта'); MOCK.transferred = true; const g = gameAcc(); return { moved: { progress: true, runs: 12, online: 5 }, account: mockAcc(g ? g.login : 'player', g && g.nick) }; }
    if (b.action === 'site_status') return { progress: RMOCK !== 'newsite', transferred: MOCK.transferred }; // ?rmock=newsite — новичок с аккаунтом сайта
    throw mockErr(400, 'Неизвестное действие');
  }
  if (fn === 'get-airdef-rating') return mockRating(b.player_id);
  if (fn === 'airdef-shop') return mockShop(b);
  throw mockErr(404, 'Not found');
}
// магазин (shop-ui.js): 340 кристаллов; ?shop=token — окраска на выбор, owned — обе куплены и «Инферно» надета, poor — не хватает кристаллов
const SHOP0 = { token: { crystals: 60, camos: [], picks: 1, worn: {} }, owned: { crystals: 190, camos: ['e_f15e:inferno', 'e_mig31:dragon'], picks: 0, worn: { e_f15e: 'inferno' } },
  poor: { crystals: 120, camos: [], picks: 0, worn: {} } };
let MSHOP = null;
function mockShop(b) {
  if (!MSHOP) { let st = ''; try { st = new URLSearchParams(location.search).get('shop') || ''; } catch (_) { /* нет адреса */ } MSHOP = JSON.parse(JSON.stringify(SHOP0[st] || { crystals: 340, camos: [], picks: 0, worn: {} })); }
  const W = MSHOP, PRICE = 150; // как CAMO_PRICE (arsenal.js)
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
  const day = 86400000, t0 = Date.parse('2026-10-25T00:00:00+03:00'), t1 = Date.parse('2027-01-01T00:00:00+03:00') /* сезон 1 — до 01.01.2027, sql/026 */, now = Date.now();
  const ago = (d, h, m) => new Date(now - d * day - h * 3600000 - m * 60000).toISOString();
  const g = gameAcc(), nick = g ? g.nick || g.login : 'xFORTUNAx';
  const top = MOCK_TOP.map(([n, p], i) => ({ place: i + 1, nick: n, points: p, n: 7 }));
  top.push({ place: 37, nick, points: 3940, n: 5 }); // «вы» — 37-е место; остальные ниже
  for (let i = 0; i < 12; i++) top.push({ place: 38 + i, nick: ['Кедр', 'Rook', 'Ветер', 'Bravo_4', 'Лайка', 'Orbit', 'Гюрза', 'Sparrow', 'Ратник', 'Echo_2', 'Витязь', 'Nimbus'][i], points: 3930 - i * 90, n: 4 });
  const base = { season: 1, current: 1, live: true, starts_at: new Date(t0).toISOString(), ends_at: new Date(t1).toISOString(), next: null, total: 214, top };
  if (RMOCK === 'break') Object.assign(base, { current: 2, live: false, ends_at: ago(2, 0, 0), next: { season: 2, starts_at: new Date(now + 5 * day).toISOString() } }); // ?rmock=break — межсезонье
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

if (siteAcc()) siteStatus(); // при старте: статуса для этого аккаунта сайта нет — спросить (в кэше есть — ничего не делает); в конце файла: заглушка использует const ниже
