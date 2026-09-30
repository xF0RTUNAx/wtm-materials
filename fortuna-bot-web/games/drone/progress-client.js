// Прогресс игрока «Симулятора Летки» на сайте: детали, билеты, открытые ракеты, вылеты на награду, итоги онлайн-боёв,
// операция «Истребительная угроза». Всё — через edge-функции Supabase (drone-state, drone-shop, drone-start, drone-claim);
// правила наград — supabase/functions/_shared/drone.ts, цены ракет — sim/progress.js.
// Без аккаунта сайта (игра открыта отдельно или тестовый ник) прогресса нет: награды не выдаются, ракеты не закрыты.
/* global CONFIG */
import { lockedIn } from './sim/progress.js?v=20260930f';

function account(testName) {
  if (testName) return null;
  try { const p = JSON.parse(localStorage.getItem('fortuna_web_player') || 'null'); return p && p.id && p.login ? p : null; } catch (_) { return null; }
}

export function createProgress({ testName, onChange = () => {} }) {
  const acc = account(testName);
  const enabled = !!acc && typeof CONFIG !== 'undefined' && !!CONFIG.SUPABASE_URL;
  const PR = { enabled, state: null, owned: new Set(), run: null, err: '' };

  async function call(fn, body) {
    const key = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, '');
    const res = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${fn}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, apikey: key }, body: JSON.stringify({ player_id: acc.id, ...body }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Нет связи с сайтом');
    return d;
  }

  // состояние с сайта (детали, билеты, ракеты, операция); ошибки не мешают играть
  PR.refresh = async () => {
    if (!enabled) return;
    try { PR.state = await call('drone-state', {}); PR.owned = new Set(PR.state.owned); PR.err = ''; } catch (e) { PR.err = e.message; }
    onChange();
  };
  // ракета закрыта для режима (без аккаунта — ничего не закрыто)
  PR.locked = (mode, key) => enabled && !!PR.state && lockedIn(mode, key, PR.owned);
  PR.price = (key) => (PR.state && PR.state.prices[key]) || 0;
  PR.buy = async (key, name) => {
    const d = await call('drone-shop', { missile: key, name });
    PR.owned.add(key); if (PR.state) PR.state.details = d.details;
    onChange();
    return d;
  };
  // начало вылета (Аркада/Реализм): с билетом, если просили и он есть; без билета — только очки операции
  PR.startRun = async (mode, ranked) => {
    PR.run = null;
    if (!enabled || (mode !== 'arcade' && mode !== 'real')) return null;
    try {
      const r = await call('drone-start', { mode, ranked: !!ranked });
      PR.run = { ...r, mode };
      if (PR.state && r.ranked) PR.state.tickets_left = Math.max(0, r.tickets_left);
      onChange();
      return PR.run;
    } catch (e) { PR.err = e.message; return null; }
  };
  // итог вылета: награда (если был билет) и очки в операцию; второй раз за вылет не вызывается
  PR.claimRun = async (kills, boss) => {
    const run = PR.run; PR.run = null;
    if (!run) return null;
    const d = await call('drone-claim', { run_id: run.run_id, kills, boss: !!boss });
    PR.refresh();
    return d;
  };
  PR.claimOnline = async (token) => {
    if (!enabled) return null;
    const d = await call('drone-claim', { token });
    PR.refresh();
    return d;
  };
  return PR;
}

// «+6 деталей, +1 ключ, +1 билет · +24 очка в операцию «…»» — текст итога для экрана результатов
export function rewardText(d) {
  if (!d) return '';
  const parts = [];
  if (d.details) parts.push(`+${d.details} ${plural(d.details, 'деталь', 'детали', 'деталей')}`);
  const keys = (d.keys || 0) + (d.ticket === 'key' ? 1 : 0);
  if (keys) parts.push(`+${keys} ${plural(keys, 'ключ', 'ключа', 'ключей')}`);
  if (d.ticket === 'ticket') parts.push('+1 билет');
  let s = parts.length ? 'Награда: ' + parts.join(', ') : '';
  if (d.points) s += `${s ? ' · ' : ''}+${d.points} ${plural(d.points, 'очко', 'очка', 'очков')} в операцию «${d.operation && d.operation.name || 'Истребительная угроза'}»`;
  if (d.operation && d.operation.step_after > d.operation.step_before) s += ` · пройден шаг ${d.operation.step_after} из ${d.operation.steps}!`;
  return s;
}
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}
