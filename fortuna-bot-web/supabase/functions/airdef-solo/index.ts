// airdef-solo — опыт и серебро за одиночный бой «Воздушного превосходства» (вылет, «Оборона», «Мульти-волна»; обучение — без наград).
//   { player_id, action: 'start', game: 'air'|'defense'|'multi', mode: 'arcade'|'real', era } → { run_id }
//   { player_id, action: 'claim', run_id, ev, used }  → { xp, silver, lines, mult, auto, progress, … }
//     ev — что сделано за бой (цели, комплексы, сбитые, волны…), used — узлы, на которых играли (самолёт, оружие, комплексы,
//     удары): в «Реализме» все должны быть куплены, иначе бой засчитывается как «Аркада».
// Браузеру верим только в разумных пределах: длительность боя меряет сервер (от start до claim), события — с пределами,
// итог — не больше предела на минуту и на бой, после SOLO_DAY опыта за сутки — вдвое меньше (battleReward в progress.js).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { mskToday } from "../_shared/msk.ts";
import { cleanEvents, credit, mutate, view, type Extra } from "../_shared/airdef-progress.ts";

const GAMES = new Set(["air", "defense", "multi"]), MODES = new Set(["arcade", "real"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const { player_id, action } = body;
    if (typeof player_id !== "string" || player_id.length < 8 || player_id.length > 64) return jsonResponse({ error: "Некорректные параметры" }, 400);
    const db = supabaseAdmin();

    if (action === "start") {
      const { game, mode } = body, era = Math.max(1, Math.min(4, Math.floor(Number(body.era) || 1)));
      if (!GAMES.has(game) || !MODES.has(mode)) return jsonResponse({ error: "Некорректные параметры" }, 400);
      const ins = await db.from("airdef_runs").insert({ player_id, game, mode, era }).select("id").single();
      if (ins.error) {
        if (ins.error.code === "23503") return jsonResponse({ error: "Игрок не найден — войдите на сайте" }, 404);
        throw ins.error;
      }
      return jsonResponse({ run_id: ins.data.id });
    }

    if (action === "claim") {
      const { run_id } = body;
      if (typeof run_id !== "string") return jsonResponse({ error: "Некорректные параметры" }, 400);
      const c = await db.rpc("airdef_run_claim", { p_run: run_id, p_player_id: player_id });
      if (c.error) throw c.error;
      const run = (c.data ?? [])[0];
      if (!run) return jsonResponse({ error: "Бой уже засчитан или устарел" }, 409);
      const today = mskToday(), ev = cleanEvents(body.ev, run.seconds / 60);
      let res: ReturnType<typeof credit> | null = null, x1: Extra | null = null;
      try {
        const out = await mutate(db, player_id, (P, x) => {
          res = credit(P, x, ev, { real: run.mode === "real", online: false, today, used: body.used });
          x1 = res.extra; return { ok: true, extra: res.extra };
        });
        if (out.notFound) return jsonResponse({ error: "Игрок не найден — войдите на сайте" }, 404);
        await db.from("airdef_runs").update({ xp: res!.reward.xp }).eq("id", run_id);
        const r = res!;
        return jsonResponse({
          xp: r.reward.xp, silver: r.reward.silver, lines: r.reward.lines, mult: r.reward.mult, auto: r.auto, real: r.realOk, real_asked: r.realAsked,
          minutes: Math.round(ev.min! * 10) / 10, solo_left: r.soloLeft, progress: view(out.P!, x1!, today),
        });
      } catch (e) {
        await db.rpc("airdef_run_unclaim", { p_run: run_id }); // опыт не сохранился — бой можно засчитать повторно
        throw e;
      }
    }
    return jsonResponse({ error: "Неизвестное действие" }, 400);
  } catch (e) {
    console.error("airdef-solo", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
