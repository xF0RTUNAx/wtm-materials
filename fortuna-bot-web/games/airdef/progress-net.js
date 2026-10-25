// Прокачка на клиенте: состояние игрока с сервера (функция airdef-progress), действия (исследовать / купить / цель), номер
// одиночного боя и его итог (airdef-solo), строки награды на экране итогов. Тратит и начисляет только сервер — здесь
// только запросы и показ. Без входа (нет аккаунта игры fortuna_airdef_acc; аккаунт сайта fortuna_web_player считается, только если у него уже есть прогресс игры —
// account.js legacySite) — как у новичка: в «Реализме» только стартовый набор, опыт не копится; «Аркада» и обучение открыты целиком (AIRDEF_PROGRESSION.md §5).
import { NODE, newProgress, owned, loadoutMissing, samOk, strikeOk, strikeId, RANK_NAME } from './progress.js?v=20261025b';
import { LOADOUTS } from './arsenal.js?v=20261025b';
import { ico } from './icons.js?v=20261025b';
import { tr, trIf, LANG } from './i18n.js?v=20261025b';
import { activeAcc, isMock, siteNoProgress } from './account.js?v=20261025b';

const TEST = new URLSearchParams(location.search).get('pgtest'); // ?pgtest=1 — тестовый прогресс в памяти (без сервера)
export function account() { return activeAcc(); } // аккаунт игры, иначе «старый» аккаунт сайта с прогрессом (account.js)
const LOCAL = () => !!TEST || isMock((account() || {}).id); // ?pgtest=1 и заглушка рейтинга ?rmock=1 (аккаунт rmock-…): прогресс в памяти, без сервера
const n2 = (v) => Math.round(v).toLocaleString(LANG === 'en' ? 'en-US' : 'ru-RU');
// сообщение «нельзя» — с сервера (функции Supabase) или из progress.js (причины покупки): на выбранном языке; фразы с подстановкой — по образцу
const WHY = [[/^Ранг (\S+) закрыт — нужен паритет в ранге (\S+)$/, (a) => tr('Ранг {0} закрыт — нужен паритет в ранге {1}', a)], [/^Сначала исследуйте (.+)$/, (a) => tr('Сначала исследуйте {0}', a)],
  [/^Не хватает опыта: (\d+)$/, (a) => tr('Не хватает опыта: {0}', a)], [/^Не хватает серебра: (\d+)$/, (a) => tr('Не хватает серебра: {0}', a)]];
export function trMsg(m) {
  if (LANG !== 'en' || typeof m !== 'string') return m;
  const s = trIf(m); if (s !== m) return s;
  for (const [re, f] of WHY) { const x = re.exec(m); if (x) return f(x.slice(1).map(trIf)); }
  const p = /^Паритет: сначала купите единицу ранга (\S+) за (\S+?)(?: — например, (.+))?$/.exec(m);
  if (p) return tr('Паритет: сначала купите единицу ранга {0} за {1}{2}', [p[1], trIf(p[2]), p[3] ? tr(' — например, {0}', [trIf(p[3])]) : '']);
  return m;
}
// строка награды из progress.js (battleReward): «Время в бою (N мин)» и «После N за день» — с числом
export function trLine(t) {
  if (LANG !== 'en') return t;
  const a = /^Время в бою \((\d+) мин\)$/.exec(t); if (a) return tr('Время в бою ({0} мин)', [a[1]]);
  const b = /^После (\d+) за день$/.exec(t); if (b) return tr('После {0} за день', [b[1]]);
  return trIf(t);
}
export const XP = (v) => `${ico('xp')}${n2(v)}`, SV = (v) => `${ico('silver')}${n2(v)}`;

export function createProgress(C) {
  const G = { P: null, info: null, err: '', busy: false, run: null, guest: false, listeners: [] };
  const changed = () => { for (const f of G.listeners) try { f(); } catch (e) { console.warn('progress', e); } };
  async function call(fn, body) {
    if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) throw new Error(tr('Нет связи с сайтом'));
    const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
    const res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify(body), keepalive: true }); // keepalive — итог боя дойдёт, даже если страницу сразу перезагрузили (после потери графики)
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(d.need_game ? tr('Создайте аккаунт игры') : d.error || tr('Ошибка сервера')), { status: res.status, need_game: !!d.need_game });
    return d;
  }
  // сервер: 403 need_game — у аккаунта сайта нет прогресса игры, играть можно только с аккаунтом игры. Клиент считал его «старым» — записать в кэш
  // «прогресса нет»: account.js оповестит, и игра обновится как гость (кнопки входа вместо сырой ошибки)
  const needGame = (e) => { if (!e || !e.need_game) return false; const a = account(); if (a && a.kind === 'site') siteNoProgress(); return true; };
  const set = (v) => { G.guest = false; G.P = { xp: v.xp, silver: v.silver, res: v.res || [], own: v.own || [], goal: v.goal || {} }; G.info = v; G.err = ''; changed(); };

  // ── тестовый режим (без сервера): правила те же, состояние — в памяти ──
  async function local(action, id, branch) {
    const M = await import('./progress.js?v=20261025b');
    if (!G.P) G.P = { ...newProgress(), xp: 20000, silver: 20000 };
    const r = action === 'research' ? M.research(G.P, id) : action === 'buy' ? M.buy(G.P, id) : (G.P.goal[branch] = id, { ok: true });
    if (!r.ok) throw new Error(r.why);
    changed(); return r;
  }

  const api = {
    get P() { return G.P; }, get info() { return G.info; }, get err() { return G.err; }, get busy() { return G.busy; }, get guest() { return G.guest; },
    account: () => (TEST ? { id: 'test', login: tr('тест') } : account()),
    on(f) { G.listeners.push(f); },
    // прогресс известен (с сервера или гостевой стартовый); пока не ответил — замков нет
    ready: () => !!G.P,
    async refresh() {
      if (LOCAL()) { const lid = (account() || {}).id || ''; if (!G.P || G.guest || G.lid !== lid) { G.P = null; G.lid = lid; await local('goal', null, 'air'); } G.guest = false; return G.P; }
      const acc = account(); if (!acc) { G.P = newProgress(); G.guest = true; G.err = ''; changed(); return G.P; } // гость: стартовый набор
      try { const d = await call('airdef-progress', { player_id: acc.id, action: 'state' }); set(d.progress); }
      catch (e) { if (needGame(e) && !account()) return G.P; G.err = e.message; changed(); }
      return G.P;
    },
    // исследовать / купить / цель ветки (id: null — снять)
    async act(action, id, branch) {
      if (G.busy) return { ok: false, why: tr('Подождите…') };
      G.busy = true; changed();
      try {
        if (LOCAL()) { await local(action, id, branch); return { ok: true }; }
        const acc = account(); if (!acc) return { ok: false, why: tr('Войдите в аккаунт игры') };
        const d = await call('airdef-progress', { player_id: acc.id, action, id, branch }); set(d.progress); return { ok: true };
      } catch (e) { needGame(e); return { ok: false, why: e.message }; }
      finally { G.busy = false; changed(); }
    },

    // ── «Реализм»: что доступно ──
    loadoutMissing: (L) => (G.P ? loadoutMissing(G.P, L) : []),
    loadoutOk: (L) => !G.P || loadoutMissing(G.P, L).length === 0,
    samOk: (key) => !G.P || !NODE['pvo:' + key] || samOk(G.P, key),
    strikeOk: (item) => !G.P || !NODE[strikeId(item)] || strikeOk(G.P, item),
    // подпись «нужно: КАБ-500Л (Вооружение, II)»
    needText: (nodes) => tr('нужно: ') + nodes.map((n) => `${trIf(n.short)} (${{ air: tr('Авиация'), wpn: tr('Вооружение'), pvo: tr('ПВО'), strike: tr('Волна') }[n.branch]}, ${RANK_NAME[n.rank]})`).join(', '),

    // ── одиночный бой: номер перед боем, итог после ──
    async runStart(game, mode, era) {
      G.run = null;
      const acc = account(); if (!acc || LOCAL() || !['air', 'defense', 'multi'].includes(game)) return;
      const run = { game, mode, era, id: null, p: null };
      G.run = run;
      run.p = call('airdef-solo', { player_id: acc.id, action: 'start', game, mode, era }).then((d) => { run.id = d.run_id; }).catch((e) => { run.err = e.message; run.need = !!e.need_game; needGame(e); });
    },
    // итог боя: ev — что сделано, used — узлы, на которых играли. Показывает строки награды в итогах (#endNote)
    async runClaim(ev, used) {
      const run = G.run; G.run = null;
      if (C.diff && C.setup && ev) C.diff.result(C.setup.game === 'multi' && C.setup.mrole === 'atk' ? 'multi_atk' : C.setup.game, !!ev.win); // скрытая подстройка сложности
      const el = () => document.getElementById('endNote');
      // свой блок — между метками (повторный показ заменяет его, остальной текст итогов не трогаем)
      const show = (h) => { const e = el(); if (e) e.innerHTML = `<!--pg--><div class="pgRes">${h}</div><!--/pg-->` + String(e.innerHTML || '').replace(/<!--pg-->[\s\S]*?<!--\/pg-->/, ''); };
      const login = (k) => ` <button data-accopen="${k}">${tr('Войти или создать аккаунт')}</button>`; // открывает окно аккаунта (account-ui.js)
      if (!account() && !TEST) { show('<span class="dim">' + (run && run.need ? tr('Создайте аккаунт игры — без него опыт и серебро не копятся.') : tr('Опыт и серебро копятся, когда вы вошли в аккаунт игры.')) + '</span>' + login('reg')); return; }
      if (!run) return;
      show('<span class="dim">' + tr('Начисляем опыт…') + '</span>');
      try {
        await run.p; if (!run.id) throw new Error(run.err || tr('Бой не зарегистрирован'));
        const d = await call('airdef-solo', { player_id: account().id, action: 'claim', run_id: run.id, ev, used });
        set(d.progress);
        show(api.rewardHtml(d));
        if (C.endScr) C.endScr.reward(d); // «Разбор»: опыт и серебро справа вверху
      } catch (e) { needGame(e); show(e.need_game ? '<span class="dim">' + tr('Создайте аккаунт игры — без него опыт и серебро не копятся.') + '</span>' + login('reg') : '<span class="dim">' + tr('Опыт не начислен: {0}', [trMsg(e.message)]) + '</span>'); }
    },
    // строки «за что сколько» и множители (одиночный и онлайн — одинаково)
    rewardHtml(d) {
      if (!d || !d.xp) return '<span class="dim">' + tr('За этот бой опыта нет.') + '</span>';
      const lines = (d.lines || []).map(([t, v]) => `<span>${trLine(t)}</span><b>+${n2(v)}</b>`).join('');
      const mult = (d.mult || []).map(([t, k]) => `<span>${trLine(t)}</span><b>×${String(k).replace('.', LANG === 'en' ? '.' : ',')}</b>`).join('');
      const auto = (d.auto || []).map((id) => NODE[id] ? trIf(NODE[id].short) : id);
      return `<div class="pgSum"><span class="xp">${XP(d.xp)}</span><span class="sv">${SV(d.silver)}</span></div><div class="pgLines">${lines}${mult}</div>`
        + (d.real === false && d.real_asked ? '<div class="dim">' + tr('«Реализм» на некупленной технике — засчитано как «Аркада».') + '</div>' : '')
        + (auto.length ? '<div class="pgAuto">' + tr('Исследовано: <b>{0}</b> — купить в «Исследованиях».', [auto.join(', ')]) + '</div>' : '');
    },
    // узлы, на которых играли: самолёт и оружие подвески / комплексы / удары
    usedLoadout: (era, i) => { const L = LOADOUTS[era] && LOADOUTS[era][i]; return L ? [(L.heli ? 'heli:' : 'air:') + L.plane, ...L.items.map(([k]) => 'wpn:' + k)] : []; },
    usedSams: (keys) => [...new Set(keys)].map((k) => 'pvo:' + k).filter((id) => NODE[id]),
    usedStrikes: (items) => [...new Set(items)].map((k) => strikeId(k)).filter((id) => NODE[id]),
    owned: (id) => !!G.P && owned(G.P, id),
  };
  return api;
}
