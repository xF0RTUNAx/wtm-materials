// Прокачка на клиенте: состояние игрока с сервера (функция airdef-progress), действия (исследовать / купить / цель), номер
// одиночного боя и его итог (airdef-solo), строки награды на экране итогов. Тратит и начисляет только сервер — здесь
// только запросы и показ. Без входа на сайте (нет fortuna_web_player) — как у новичка: в «Реализме» только стартовый набор,
// опыт не копится; «Аркада» и обучение открыты целиком (AIRDEF_PROGRESSION.md §5).
import { NODE, newProgress, owned, loadoutMissing, samOk, strikeOk, strikeId, RANK_NAME } from './progress.js?v=20261022k';
import { LOADOUTS } from './arsenal.js?v=20261022k';
import { ico } from './icons.js?v=20261022k';

const TEST = new URLSearchParams(location.search).get('pgtest'); // ?pgtest=1 — тестовый прогресс в памяти (без сервера)
export function account() {
  try { const p = JSON.parse(localStorage.getItem('fortuna_web_player') || 'null'); return p && p.id && p.login ? p : null; } catch (_) { return null; }
}
const n2 = (v) => Math.round(v).toLocaleString('ru-RU');
export const XP = (v) => `${ico('xp')}${n2(v)}`, SV = (v) => `${ico('silver')}${n2(v)}`;

export function createProgress(C) {
  const G = { P: null, info: null, err: '', busy: false, run: null, guest: false, listeners: [] };
  const changed = () => { for (const f of G.listeners) try { f(); } catch (e) { console.warn('progress', e); } };
  async function call(fn, body) {
    if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL) throw new Error('Нет связи с сайтом');
    const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
    const res = await fetch(CONFIG.SUPABASE_URL + '/functions/v1/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(d.error || 'Ошибка сервера'), { status: res.status });
    return d;
  }
  const set = (v) => { G.guest = false; G.P = { xp: v.xp, silver: v.silver, res: v.res || [], own: v.own || [], goal: v.goal || {} }; G.info = v; G.err = ''; changed(); };

  // ── тестовый режим (без сервера): правила те же, состояние — в памяти ──
  async function local(action, id, branch) {
    const M = await import('./progress.js?v=20261022k');
    if (!G.P) G.P = { ...newProgress(), xp: 20000, silver: 20000 };
    const r = action === 'research' ? M.research(G.P, id) : action === 'buy' ? M.buy(G.P, id) : (G.P.goal[branch] = id, { ok: true });
    if (!r.ok) throw new Error(r.why);
    changed(); return r;
  }

  const api = {
    get P() { return G.P; }, get info() { return G.info; }, get err() { return G.err; }, get busy() { return G.busy; }, get guest() { return G.guest; },
    account: () => (TEST ? { id: 'test', login: 'тест' } : account()),
    on(f) { G.listeners.push(f); },
    // прогресс известен (с сервера или гостевой стартовый); пока не ответил — замков нет
    ready: () => !!G.P,
    async refresh() {
      if (TEST) { if (!G.P) await local('goal', null, 'air'); return G.P; }
      const acc = account(); if (!acc) { G.P = newProgress(); G.guest = true; G.err = ''; changed(); return G.P; } // гость: стартовый набор
      try { const d = await call('airdef-progress', { player_id: acc.id, action: 'state' }); set(d.progress); }
      catch (e) { G.err = e.message; changed(); }
      return G.P;
    },
    // исследовать / купить / цель ветки (id: null — снять)
    async act(action, id, branch) {
      if (G.busy) return { ok: false, why: 'Подождите…' };
      G.busy = true; changed();
      try {
        if (TEST) { await local(action, id, branch); return { ok: true }; }
        const acc = account(); if (!acc) return { ok: false, why: 'Войдите на сайте' };
        const d = await call('airdef-progress', { player_id: acc.id, action, id, branch }); set(d.progress); return { ok: true };
      } catch (e) { return { ok: false, why: e.message }; }
      finally { G.busy = false; changed(); }
    },

    // ── «Реализм»: что доступно ──
    loadoutMissing: (L) => (G.P ? loadoutMissing(G.P, L) : []),
    loadoutOk: (L) => !G.P || loadoutMissing(G.P, L).length === 0,
    samOk: (key) => !G.P || !NODE['pvo:' + key] || samOk(G.P, key),
    strikeOk: (item) => !G.P || !NODE[strikeId(item)] || strikeOk(G.P, item),
    // подпись «нужно: КАБ-500Л (Вооружение, II)»
    needText: (nodes) => 'нужно: ' + nodes.map((n) => `${n.short} (${{ air: 'Авиация', wpn: 'Вооружение', pvo: 'ПВО', strike: 'Волна' }[n.branch]}, ${RANK_NAME[n.rank]})`).join(', '),

    // ── одиночный бой: номер перед боем, итог после ──
    async runStart(game, mode, era) {
      G.run = null;
      const acc = account(); if (!acc || TEST || !['air', 'defense', 'multi'].includes(game)) return;
      const run = { game, mode, era, id: null, p: null };
      G.run = run;
      run.p = call('airdef-solo', { player_id: acc.id, action: 'start', game, mode, era }).then((d) => { run.id = d.run_id; }).catch((e) => { run.err = e.message; });
    },
    // итог боя: ev — что сделано, used — узлы, на которых играли. Показывает строки награды в итогах (#endNote)
    async runClaim(ev, used) {
      const run = G.run; G.run = null;
      if (C.diff && C.setup && ev) C.diff.result(C.setup.game === 'multi' && C.setup.mrole === 'atk' ? 'multi_atk' : C.setup.game, !!ev.win); // скрытая подстройка сложности
      const el = () => document.getElementById('endNote');
      // свой блок — между метками (повторный показ заменяет его, остальной текст итогов не трогаем)
      const show = (h) => { const e = el(); if (e) e.innerHTML = `<!--pg--><div class="pgRes">${h}</div><!--/pg-->` + String(e.innerHTML || '').replace(/<!--pg-->[\s\S]*?<!--\/pg-->/, ''); };
      if (!account() && !TEST) { show('<span class="dim">Опыт и серебро копятся, когда вы вошли на сайте.</span>'); return; }
      if (!run) return;
      show('<span class="dim">Начисляем опыт…</span>');
      try {
        await run.p; if (!run.id) throw new Error(run.err || 'Бой не зарегистрирован');
        const d = await call('airdef-solo', { player_id: account().id, action: 'claim', run_id: run.id, ev, used });
        set(d.progress);
        show(api.rewardHtml(d));
      } catch (e) { show(`<span class="dim">Опыт не начислен: ${e.message}</span>`); }
    },
    // строки «за что сколько» и множители (одиночный и онлайн — одинаково)
    rewardHtml(d) {
      if (!d || !d.xp) return '<span class="dim">За этот бой опыта нет.</span>';
      const lines = (d.lines || []).map(([t, v]) => `<span>${t}</span><b>+${n2(v)}</b>`).join('');
      const mult = (d.mult || []).map(([t, k]) => `<span>${t}</span><b>×${String(k).replace('.', ',')}</b>`).join('');
      const auto = (d.auto || []).map((id) => NODE[id] ? NODE[id].short : id);
      return `<div class="pgSum"><span class="xp">${XP(d.xp)}</span><span class="sv">${SV(d.silver)}</span></div><div class="pgLines">${lines}${mult}</div>`
        + (d.real === false && d.real_asked ? '<div class="dim">«Реализм» на некупленной технике — засчитано как «Аркада».</div>' : '')
        + (auto.length ? `<div class="pgAuto">Исследовано: <b>${auto.join(', ')}</b> — купить в «Исследованиях».</div>` : '');
    },
    // узлы, на которых играли: самолёт и оружие подвески / комплексы / удары
    usedLoadout: (era, i) => { const L = LOADOUTS[era] && LOADOUTS[era][i]; return L ? ['air:' + L.plane, ...L.items.map(([k]) => 'wpn:' + k)] : []; },
    usedSams: (keys) => [...new Set(keys)].map((k) => 'pvo:' + k).filter((id) => NODE[id]),
    usedStrikes: (items) => [...new Set(items)].map((k) => strikeId(k)).filter((id) => NODE[id]),
    owned: (id) => !!G.P && owned(G.P, id),
  };
  return api;
}
