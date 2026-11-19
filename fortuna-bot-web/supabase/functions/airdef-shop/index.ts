// airdef-shop - магазин окрасок «Воздушного превосходства» (shop-ui.js, Mark 2026-10-26 - «Витрина»; этап 2 - покупка, 2026-10-27). Кристаллы
// начисляются за сезон рейтинга (sql/024 - молча), окраски «на выбор» (picks) - за 1-е место. Только аккаунт игры (kind = airdef).
//   { player_id, action: 'state' }                → { season, wallet: { crystals, camos, picks, worn } }
//   { player_id, action: 'buy',  key }            → { season, wallet } - за CAMO_PRICE кристаллов (sql/028 airdef_shop_buy)
//   { player_id, action: 'pick', key }            → { season, wallet } - окраска на выбор
//   { player_id, action: 'wear', key }            → { season, wallet } - надеть свою ('самолёт:окраска'); key: null + plane - снять с самолёта
// Аватарки (Mark 2026-11-04) - те же действия и те же поля кошелька: ключ 'ava:a02', цена AVA_PRICE, каталог avaCatalog; снять - plane: 'ava'.
// Покупки за Telegram Stars (sql/037, _shared/airdef-pay.ts; каталог arsenal.js PAY):
//   { action: 'invoice', key: 'prem_7d' | 'gems_100' …, lang } → { link, order } - ссылка на счёт Telegram (в мини-приложении - openInvoice)
//   { action: 'order', order }                               → { status: 'new' | 'paid' | 'refunded', wallet } - игра ждёт зачисления
// Отдельный платёжный бот (TG_PAY_TOKEN): его вебхук - эта же функция (заголовок X-Telegram-Bot-Api-Secret-Token); иначе платежи ведёт бот поддержки.
// В магазине - окраски, вышедшие к сезону (arsenal.js camosOut; в межсезонье - следующего сезона, они уже на витрине). Списание - в SQL.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { avaCatalog, AVA_PRICE, camosOut, CAMO_PRICE } from "../_shared/airdef/arsenal.js";
import { sessionPlayer } from "../_shared/airdef-session.ts";
import { makeInvoice, orderState, payTg, payUpdate, PAY_TOKEN, separatePayBot } from "../_shared/airdef-pay.ts";

// отдельный платёжный бот: секрет вебхука - HMAC от его токена; вебхук ставится при первом запросе игры (pay_state в support_state)
const enc = new TextEncoder();
async function paySecret(): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(PAY_TOKEN()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("airdef-pay-webhook"))).slice(0, 24), (b) => b.toString(16).padStart(2, "0")).join("");
}
let payHook = false;
// deno-lint-ignore no-explicit-any
async function ensurePayHook(db: any) {
  if (payHook || !separatePayBot()) return; // платежи ведёт бот поддержки - его вебхук ставит airdef-support
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/airdef-shop`, sec = await paySecret();
  const want = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(url + "|" + sec))).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
  const { data } = await db.from("support_state").select("v").eq("k", "pay_webhook").maybeSingle();
  if (data?.v === want) { payHook = true; return; }
  if (await payTg("setWebhook", { url, secret_token: sec, allowed_updates: ["message", "pre_checkout_query"] })) {
    await db.from("support_state").upsert({ k: "pay_webhook", v: want, updated_at: new Date().toISOString() }); payHook = true;
  }
}
const PAY_WHY: Record<string, string> = { consent: "Отметьте согласие: премиум начнёт действовать сразу после оплаты", bad_sku: "Такого товара нет", off: "Покупки пока выключены", too_many: "Слишком много неоплаченных счетов - подождите час", tg: "Telegram не выдал счёт - попробуйте ещё раз" };

const WHY: Record<string, string> = {
  not_sold: "Этой окраски сейчас нет в магазине",
  owned: "Эта окраска уже ваша",
  no_crystals: "Не хватает кристаллов",
  no_pick: "Окраски на выбор нет",
  not_owned: "Сначала купите эту окраску",
};
const WHY_AVA: Record<string, string> = { ...WHY, not_sold: "Этой аватарки сейчас нет в магазине", owned: "Эта аватарка уже ваша", not_owned: "Сначала купите эту аватарку" };
const CAMO_RE = /^[a-z0-9_]{1,24}:[a-z0-9_]{1,24}$/, PLANE_RE = /^[a-z0-9_]{1,24}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = supabaseAdmin();
    const hook = req.headers.get("x-telegram-bot-api-secret-token");
    if (hook !== null) { // отдельный платёжный бот (TG_PAY_TOKEN)
      if (!separatePayBot() || hook !== (await paySecret())) return new Response("forbidden", { status: 403 });
      await payUpdate(db, await req.json().catch(() => ({})));
      return new Response("ok");
    }
    await ensurePayHook(db).catch((e) => console.error("pay webhook", e instanceof Error ? e.message : e));
    const body = await req.json().catch(() => ({})), { action, key, plane } = body;
    const who = await sessionPlayer(db, body); if (who.err) return who.err; // кристаллы - только аккаунт игры, по ключу сессии
    const player_id = who.id!;
    const { data: pl, error } = await db.from("players").select("kind").eq("id", player_id).maybeSingle();
    if (error) throw error;
    if (!pl) return jsonResponse({ error: "Игрок не найден - войдите в аккаунт игры", code: "not_found" }, 404);
    if (pl.kind !== "airdef") return jsonResponse({ error: "Кристаллы и окраски - только у аккаунта игры", code: "need_game" }, 403);
    const ts = new Date().toISOString();
    const [at, lv] = await Promise.all([db.rpc("airdef_season_at", { ts }), db.rpc("airdef_season_live", { ts })]);
    // сезон окрасок: идущий; в межсезонье (sql/027) - следующий (его окраски уже в магазине)
    const season = Number(lv.data) || Number(at.data) || 1;
    if (action === "state" || action === undefined) {
      const w = await db.rpc("airdef_wallet_view", { p_player: player_id });
      if (w.error) throw w.error;
      return jsonResponse({ season, wallet: w.data });
    }
    if (action === "invoice") {
      const r = await makeInvoice(db, player_id, key, body.lang, body.consent === true);
      if (!r.link) return jsonResponse({ error: PAY_WHY[r.code || ""] || "Нельзя", code: r.code }, r.code === "bad_sku" ? 400 : 409);
      return jsonResponse({ link: r.link, order: r.order });
    }
    if (action === "order") {
      const st = await orderState(db, player_id, body.order);
      if (!st) return jsonResponse({ error: "Заказ не найден" }, 404);
      const w = await db.rpc("airdef_wallet_view", { p_player: player_id });
      if (w.error) throw w.error;
      return jsonResponse({ status: st, season, wallet: w.data });
    }
    const camo = typeof key === "string" && CAMO_RE.test(key) ? key : null;
    let r;
    if (action === "buy" || action === "pick") {
      if (!camo) return jsonResponse({ error: "Некорректные параметры" }, 400);
      const ava = camo.startsWith("ava:");
      r = action === "buy"
        ? await db.rpc("airdef_shop_buy", { p_player: player_id, p_camo: camo, p_price: ava ? AVA_PRICE : CAMO_PRICE, p_catalog: ava ? avaCatalog() : camosOut(season) })
        : await db.rpc("airdef_shop_pick", { p_player: player_id, p_camo: camo, p_catalog: camosOut(season) });
    } else if (action === "wear") {
      const pn = camo ? camo.split(":")[0] : typeof plane === "string" && PLANE_RE.test(plane) ? plane : null;
      if (!pn) return jsonResponse({ error: "Некорректные параметры" }, 400);
      r = await db.rpc("airdef_shop_wear", { p_player: player_id, p_plane: pn, p_skin: camo ? camo.split(":")[1] : null });
    } else return jsonResponse({ error: "Неизвестное действие" }, 400);
    if (r.error) throw r.error;
    const d = r.data as { wallet?: unknown; error?: string };
    const why = camo?.startsWith("ava:") ? WHY_AVA : WHY;
    if (d.error) return jsonResponse({ error: why[d.error] || "Нельзя", code: d.error }, 409);
    return jsonResponse({ season, wallet: d.wallet });
  } catch (e) {
    console.error("airdef-shop", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
