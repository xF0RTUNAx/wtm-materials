// Прокачка «Воздушного превосходства» на сервере: состояние игрока (опыт, серебро, исследованное, купленное, цели),
// действия (исследовать / купить / цель ветки) и начисление за бой. Правила — те же, что у игры: _shared/airdef/progress.js
// (копия games/airdef/progress.js, tools/airdef-headless/sync-shared.js). Тратить и начислять может только сервер.
// Сохранение — с номером версии строки (airdef_progress_save): два одновременных запроса не задвоят опыт и не уйдут в минус.
import {
  NODE, BRANCHES, newProgress, research, buy, canResearch, owned, battleReward, SOLO_DAY,
} from "./airdef/progress.js";

export type Progress = { xp: number; silver: number; res: string[]; own: string[]; goal: Record<string, string> };
export type Row = {
  player_id: string; xp: number; silver: number; res: string[]; own: string[]; goal: Record<string, string>;
  first_win_day: string | null; solo_day: string | null; solo_xp: number; version: number;
};
export type Extra = { first_win_day: string | null; solo_day: string | null; solo_xp: number };
// deno-lint-ignore no-explicit-any
type DB = any;

const BRANCH_IDS = new Set(BRANCHES.map((b: { id: string }) => b.id));
const clampInt = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

// строка таблицы → состояние (неизвестные узлы — например, удалённые из игры — отбрасываются)
export function toProgress(row: Partial<Row> | null): Progress {
  const P = newProgress() as Progress;
  if (!row) return P;
  P.xp = Math.max(0, Number(row.xp) || 0); P.silver = Math.max(0, Number(row.silver) || 0);
  P.res = (row.res ?? []).filter((id) => NODE[id]); P.own = (row.own ?? []).filter((id) => NODE[id]);
  for (const [b, id] of Object.entries(row.goal ?? {})) if (BRANCH_IDS.has(b) && NODE[id] && NODE[id].branch === b) P.goal[b] = id;
  return P;
}
export const extraOf = (row: Partial<Row> | null): Extra => ({ first_win_day: row?.first_win_day ?? null, solo_day: row?.solo_day ?? null, solo_xp: Number(row?.solo_xp ?? 0) });

// действия игрока: research / buy / goal (branch + id; id пустой — снять цель)
export function act(P: Progress, action: string, id: unknown, branch: unknown): { ok: boolean; why?: string } {
  if (action === "research" || action === "buy") {
    if (typeof id !== "string" || !NODE[id]) return { ok: false, why: "Нет такой единицы" };
    const r = action === "research" ? research(P, id) : buy(P, id);
    if (r.ok && action === "research") for (const b in P.goal) if (P.goal[b] === id) delete P.goal[b]; // цель достигнута
    return r;
  }
  if (action === "goal") {
    if (typeof branch !== "string" || !BRANCH_IDS.has(branch)) return { ok: false, why: "Нет такой ветки" };
    if (id === null || id === "" || id === undefined) { delete P.goal[branch]; return { ok: true }; }
    if (typeof id !== "string" || !NODE[id] || NODE[id].branch !== branch) return { ok: false, why: "Нет такой единицы" };
    if (owned(P, id) || P.res.includes(id) || NODE[id].start) return { ok: false, why: "Уже исследовано" };
    P.goal[branch] = id; return { ok: true };
  }
  return { ok: false, why: "Неизвестное действие" };
}

// итог боя от браузера — только в разумных пределах (сколько чего за бой вообще бывает)
export type BattleEvents = { targets?: number[]; sams?: number; samsLong?: number; downs?: number; kills?: number; waves?: number[]; mwObj?: number; mwSam?: number; mwInt?: number; back?: boolean; win?: boolean; min?: number };
export function cleanEvents(ev: unknown, minutes: number): BattleEvents {
  const e = (ev && typeof ev === "object" ? ev : {}) as Record<string, unknown>;
  const arr = (v: unknown, n: number, lo: number, hi: number) => (Array.isArray(v) ? v.slice(0, n).map((x) => Math.max(lo, Math.min(hi, Number(x) || 0))) : []);
  return {
    targets: arr(e.targets, 30, 0, 2), sams: clampInt(e.sams, 0, 30), samsLong: clampInt(e.samsLong, 0, 10), downs: clampInt(e.downs, 0, 80),
    kills: clampInt(e.kills, 0, 400), waves: arr(e.waves, 12, 0, 12).map(Math.floor), mwObj: clampInt(e.mwObj, 0, 300), mwSam: clampInt(e.mwSam, 0, 40),
    mwInt: clampInt(e.mwInt, 0, 400), back: e.back === true, win: e.win === true, min: Math.max(0, Math.min(minutes, 180)),
  };
}

// начисление за бой: опыт и серебро, множители (Реализм, первая победа дня), пределы одиночной игры; цели веток,
// на которые теперь хватает опыта, исследуются сами. used — узлы, на которых играли (в «Реализме» все должны быть куплены,
// иначе — как в «Аркаде»: без множителя). Возвращает новое состояние и строки для экрана итогов.
export function credit(P: Progress, x: Extra, ev: BattleEvents, o: { real: boolean; online: boolean; today: string; used?: unknown; training?: boolean }) {
  const used = Array.isArray(o.used) ? o.used.filter((id): id is string => typeof id === "string" && !!NODE[id]).slice(0, 40) : [];
  const realOk = o.real && used.every((id) => owned(P, id));
  const firstWin = x.first_win_day !== o.today;
  const soloToday = x.solo_day === o.today ? x.solo_xp : 0;
  const r = battleReward(ev, { training: o.training, real: realOk, arcade: !realOk, firstWin, online: o.online, dayXp: soloToday }); // solo_xp — опыт за день по всем боям (дневной предел — и для онлайна)
  P.xp += r.xp; P.silver += r.silver;
  const nx: Extra = { ...x };
  if (firstWin && ev.win && r.xp > 0) nx.first_win_day = o.today;
  nx.solo_day = o.today; nx.solo_xp = soloToday + r.xp;
  const auto: string[] = [];
  for (const b of Object.keys(P.goal)) { const id = P.goal[b]; if (canResearch(P, id).ok) { research(P, id); auto.push(id); delete P.goal[b]; } }
  return { reward: r, P, extra: nx, auto, realOk, realAsked: o.real, soloLeft: Math.max(0, SOLO_DAY - (nx.solo_day === o.today ? nx.solo_xp : 0)) };
}

// ── база ──
export async function load(db: DB, player_id: string): Promise<{ row: Row | null; exists: boolean }> {
  const r = await db.from("airdef_progress").select("*").eq("player_id", player_id).maybeSingle();
  if (r.error) throw r.error;
  if (r.data) return { row: r.data as Row, exists: true };
  const p = await db.from("players").select("id").eq("id", player_id).maybeSingle();
  if (p.error) throw p.error;
  return { row: null, exists: !!p.data };
}
async function save(db: DB, player_id: string, version: number, P: Progress, x: Extra): Promise<number> {
  const r = await db.rpc("airdef_progress_save", {
    p_player_id: player_id, p_version: version, p_xp: Math.round(P.xp), p_silver: Math.round(P.silver), p_res: P.res, p_own: P.own, p_goal: P.goal,
    p_first_win_day: x.first_win_day, p_solo_day: x.solo_day, p_solo_xp: Math.round(x.solo_xp),
  });
  if (r.error) throw r.error;
  return Number(r.data);
}
// прочитать → изменить → сохранить, если строку никто не изменил между делом (иначе — заново, до 5 раз)
export async function mutate<T extends { ok: boolean }>(db: DB, player_id: string, fn: (P: Progress, x: Extra) => T & { extra?: Extra }):
  Promise<T & { P?: Progress; version?: number; notFound?: boolean }> {
  for (let i = 0; i < 5; i++) {
    const { row, exists } = await load(db, player_id);
    if (!exists) return { ok: false, notFound: true } as T & { notFound: boolean };
    const P = toProgress(row), x = extraOf(row), out = fn(P, x);
    if (!out.ok) return out;
    const v = await save(db, player_id, row ? row.version : 0, P, out.extra ?? x);
    if (v >= 0) return { ...out, P, version: v };
  }
  throw new Error("airdef_progress: не удалось сохранить (конфликт версий)");
}
// состояние для клиента
export const view = (P: Progress, x: Extra, today: string) => ({
  xp: P.xp, silver: P.silver, res: P.res, own: P.own, goal: P.goal,
  first_win_today: x.first_win_day === today, solo_xp_today: x.solo_day === today ? x.solo_xp : 0, solo_day_cap: SOLO_DAY,
});
