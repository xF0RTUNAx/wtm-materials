// airdef-support - поддержка игроков «Воздушного превосходства» (Mark 2026-11-18). Две двери:
// 1) Игра (только аккаунт игры, только по ключу сессии { sess } - _shared/airdef-session.ts):
//   { action: 'list' }                                     → { tickets: [...], unread, limits }
//   { action: 'thread', id }                               → { ticket, messages } (снимает «непрочитано»)
//   { action: 'create', topic, body, meta, files: [{name,size,type}] } → { id, msg_id, uploads: [{ url, method, headers }] }
//   { action: 'reply', id, body, files }                   → { msg_id, uploads }
//   { action: 'sent', id, msg_id }                         → { ok } - файлы загружены: сообщение видно, уведомление в Telegram
//   { action: 'cancel', id, msg_id }                       → { ok } - «Не отправлять»: черновик с незагруженными файлами удаляется
//   { action: 'close', id }                                → { ok }
//   Файлы грузятся браузером прямо в Cloudflare R2 по подписанной ссылке (_shared/support-files.ts, tools/airdef-support-worker).
//   Лимиты (обращений и сообщений в сутки, МБ в сутки, открытых) проверяет и вставляет sql support_add под замком игрока (sql/034).
// 2) Telegram (заголовок X-Telegram-Bot-Api-Secret-Token = HMAC от токена бота): бот поддержки. Посторонним - подсказка на их языке,
//   ничего не сохраняется; только SUPPORT_ADMIN_ID: ответ (reply) на сообщение бота об обращении - ответ игроку; кнопки «Ответить», «Закрыть», «Игрок».
//   Вебхук бот ставит себе сам при первом запросе (support_state 'webhook'). Уведомления - у каждого сообщения флаг notified; несланные досылаются.
// Секреты: TG_SUPPORT_TOKEN, SUPPORT_ADMIN_ID (Mark вписывает сам в панели Supabase), SUPPORT_FILE_KEY, SUPPORT_FILES_URL.
// Текст игрока нигде не идёт как разметка: в Telegram - без parse_mode, в игре - textContent. Таблицы - sql/033_support.sql, sql/034_support_fixes.sql.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { sessionPlayer } from "../_shared/airdef-session.ts";
import { MAX_FILE, TYPES, filesReady, signedUrl } from "../_shared/support-files.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
const TOPICS: Record<string, string> = { bug: "Ошибка", account: "Аккаунт и прогресс", purchase: "Покупки", player: "Жалоба на игрока", idea: "Идея" };
const LIM = { maxFiles: 3, maxFileMB: 15, maxText: 2000, ticketsDay: 5, msgsDay: 40, mbDay: 60, open: 5 };
const DL_TTL = 7 * 86400;
const enc = new TextEncoder();
const bad = (m = "Проверьте текст и файлы") => jsonResponse({ error: m }, 400);
const limit = (m: string) => jsonResponse({ error: m, code: "limit" }, 429);
const notFound = () => jsonResponse({ error: "Обращение не найдено" }, 404);
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g;
const clean = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\r\n?/g, "\n").replace(CTRL, "").replace(/[–—]/g, "-").trim().slice(0, n) : "");
const fmtMB = (b: number) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " МБ" : Math.max(1, Math.round(b / 1024)) + " КБ");
const toId = (v: unknown) => { const n = typeof v === "string" && /^\d{1,15}$/.test(v) ? Number(v) : v; return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : 0; };
const now = () => new Date().toISOString();
// работа после ответа игроку (уведомления в Telegram): игрок не ждёт Telegram
// deno-lint-ignore no-explicit-any
const later = (p: Promise<unknown>) => { const ER = (globalThis as any).EdgeRuntime; const q = p.catch((e) => console.error("later", e instanceof Error ? e.message : e)); if (ER?.waitUntil) ER.waitUntil(q); };

// ── Telegram ──
const TG = () => Deno.env.get("TG_SUPPORT_TOKEN") || "";
const ADMIN = () => Number(Deno.env.get("SUPPORT_ADMIN_ID") || 0);
async function hookSecret(): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(TG()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("airdef-support-webhook")));
  return Array.from(h.slice(0, 24), (b) => b.toString(16).padStart(2, "0")).join("");
}
// вызов Telegram: 6 с на ответ; в журнал - только имя метода (в тексте ошибки fetch был бы адрес с токеном бота)
// deno-lint-ignore no-explicit-any
async function tg(method: string, payload: Record<string, unknown>): Promise<any> {
  if (!TG()) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG()}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(6000) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) console.error("tg", method, r.status, String(d.description || "").slice(0, 200));
    return d.ok ? d.result : null;
  } catch (_) { console.error("tg", method, "нет связи"); return null; }
}
let hookOk = false;
async function sha(s: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))), (b) => b.toString(16).padStart(2, "0")).join(""); }
async function ensureWebhook(db: Db) {
  if (hookOk || !TG()) return;
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/airdef-support`, sec = await hookSecret();
  const want = (await sha(url + "|" + sec)).slice(0, 16);
  const { data } = await db.from("support_state").select("v").eq("k", "webhook").maybeSingle();
  if (data?.v === want) { hookOk = true; return; }
  const ok = await tg("setWebhook", { url, secret_token: sec, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
  if (ok) { await db.from("support_state").upsert({ k: "webhook", v: want, updated_at: now() }); hookOk = true; }
}
const KB = (id: number) => ({ inline_keyboard: [[{ text: "✉ Ответить", callback_data: `r:${id}` }, { text: "✓ Закрыть", callback_data: `c:${id}` }, { text: "👤 Игрок", callback_data: `p:${id}` }]] });
async function mapMsg(db: Db, msgId: number | undefined, ticketId: number) { if (msgId) await db.from("support_tg").upsert({ tg_msg_id: msgId, ticket_id: ticketId }); }

// сведения об игре и устройстве - только известные поля, строки обрезаны (их шлёт support-ui.js collect())
// deno-lint-ignore no-explicit-any
function cleanMeta(m0: any): Record<string, unknown> {
  const m = m0 && typeof m0 === "object" ? m0 : {}, out: Record<string, unknown> = {}, s = (v: unknown, n = 40) => clean(String(v ?? ""), n);
  for (const k of ["ver", "ua", "lang", "gfx", "fps", "dpr", "state", "mode", "map", "side", "team", "room"]) if (m[k] != null && m[k] !== "") out[k] = s(m[k], k === "ua" ? 200 : 40);
  if (Array.isArray(m.scr) && m.scr.length === 2) out.scr = m.scr.map((x: unknown) => Math.max(0, Math.min(20000, Math.round(Number(x) || 0))));
  if (Array.isArray(m.errs)) out.errs = m.errs.slice(-15).map((e: unknown) => s(e, 200).replace(/[A-Za-z0-9_\-]{24,}/g, "…"));
  return out;
}
// deno-lint-ignore no-explicit-any
function metaLines(m: any): string {
  if (!m || typeof m !== "object") return "";
  const a = [m.ver ? "версия " + m.ver : "", m.ua || "", m.gfx ? "графика " + m.gfx : "", m.fps ? "предел к/с " + m.fps : "", Array.isArray(m.scr) ? `экран ${m.scr[0]}×${m.scr[1]}${m.dpr ? " ×" + m.dpr : ""}` : ""].filter(Boolean).join(" · ");
  const b = [m.state ? "сейчас: " + m.state : "", m.mode, m.map, m.side, m.team ? "команда " + m.team : "", m.room ? "комната " + m.room : ""].filter(Boolean).join(" · ");
  const errs = Array.isArray(m.errs) && m.errs.length ? "Ошибки страницы:\n" + m.errs.slice(-5).map((e: string) => "• " + e).join("\n") : "Ошибок страницы нет";
  return [a, b, errs].filter(Boolean).join("\n");
}
async function fileLines(files: { key: string; name: string; size: number; type: string }[]) {
  const out: string[] = [];
  for (const f of files) out.push(`${f.type.startsWith("video/") ? "🎬" : "🖼"} ${f.name} · ${fmtMB(f.size)} - ${await signedUrl("get", f.key, DL_TTL)}`);
  return out.length ? "📎 Файлы (ссылки - 7 дней):\n" + out.join("\n") : "";
}
// уведомление о сообщении игрока (первое - с данными об устройстве); картинки - отдельно ответом на него. Флаг notified - у сообщения.
async function notify(db: Db, msgId: number): Promise<boolean> {
  if (!TG() || !ADMIN()) return false;
  const { data: m } = await db.from("support_messages").select("id, ticket_id, body, files, notified").eq("id", msgId).maybeSingle();
  if (!m || m.notified) return !!m;
  const { data: t } = await db.from("support_tickets").select("id, player_id, topic, lang, meta").eq("id", m.ticket_id).maybeSingle();
  if (!t) return false;
  // «захват»: уведомляет тот, кто первым поставил флаг (sent и досылка одновременно - без двойного сообщения)
  const claim = await db.from("support_messages").update({ notified: true }).eq("id", msgId).eq("notified", false).select("id");
  if (!claim.data?.length) return true;
  const { data: acc } = await db.from("airdef_accounts").select("nick").eq("player_id", t.player_id).maybeSingle();
  const { count } = await db.from("support_messages").select("id", { count: "exact", head: true }).eq("ticket_id", t.id).eq("author", "player").lt("id", msgId);
  const first = !count, nick = acc?.nick || "без ника";
  const head = first ? `🆕 Обращение № ${t.id} · ${TOPICS[t.topic] || t.topic}\n${nick} · язык: ${t.lang || "?"}` : `💬 № ${t.id} · ${nick} ответил`;
  const text = [head, m.body, filesReady() ? await fileLines(m.files || []) : "", first ? metaLines(t.meta) : ""].filter(Boolean).join("\n\n").slice(0, 4000);
  const sent = await tg("sendMessage", { chat_id: ADMIN(), text, reply_markup: KB(t.id), link_preview_options: { is_disabled: true } });
  if (!sent) { await db.from("support_messages").update({ notified: false }).eq("id", msgId); return false; } // не дошло - досылка потом
  await mapMsg(db, sent.message_id, t.id);
  for (const f of (m.files || []).filter((x: { type: string }) => x.type.startsWith("image/"))) {
    const ph = await tg("sendPhoto", { chat_id: ADMIN(), photo: await signedUrl("get", f.key, 3600), reply_parameters: { message_id: sent.message_id, allow_sending_without_reply: true } });
    if (ph) await mapMsg(db, ph.message_id, t.id);
  }
  return true;
}
// несланные уведомления (бот был не настроен или Telegram не ответил) - по порядку
async function flush(db: Db, max = 10) {
  if (!TG() || !ADMIN()) return;
  const { data } = await db.from("support_messages").select("id").eq("author", "player").eq("sent", true).eq("notified", false).order("id").limit(max);
  for (const m of data || []) if (!(await notify(db, m.id))) break; // Telegram не отвечает - не долбить
}

// ответ всем, кроме поддержки: здесь писать некуда - только из игры
const GUEST: Record<string, string> = {
  ru: "Это служебный бот поддержки Air Superiority - сообщения здесь не принимаются.\nНапишите нам из игры: Профиль → Поддержка (нужен аккаунт игры). Ответ придёт туда же.",
  uk: "Це службовий бот підтримки Air Superiority - повідомлення тут не приймаються.\nНапишіть нам із гри: Профіль → Підтримка (потрібен акаунт гри). Відповідь прийде туди ж.",
  en: "This is the Air Superiority support desk bot - it doesn't accept messages here.\nContact us from the game: Profile → Support (a game account is required). The reply will appear there.",
  de: "Das ist der Support-Bot von Air Superiority - hier werden keine Nachrichten angenommen.\nSchreib uns im Spiel: Profil → Support (Spielkonto nötig). Die Antwort kommt dort an.",
  es: "Este es el bot de soporte de Air Superiority: aquí no se aceptan mensajes.\nEscríbenos desde el juego: Perfil → Soporte (se necesita cuenta de juego). La respuesta llegará allí.",
  fr: "Ceci est le bot de support d'Air Superiority : les messages ne sont pas acceptés ici.\nÉcrivez-nous depuis le jeu : Profil → Support (compte de jeu requis). La réponse arrivera là-bas.",
};
// deno-lint-ignore no-explicit-any
async function onTelegram(db: Db, u: any): Promise<Response> {
  const ok = () => new Response("ok");
  const admin = ADMIN();
  if (u.callback_query) {
    const q = u.callback_query, from = q.from?.id;
    if (!admin || from !== admin) { await tg("answerCallbackQuery", { callback_query_id: q.id }); return ok(); }
    const [k, idS] = String(q.data || "").split(":"), id = toId(idS);
    const { data: t } = id ? await db.from("support_tickets").select("id, player_id, status, created_at").eq("id", id).maybeSingle() : { data: null };
    if (!t) { await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Обращение не найдено (аккаунт удалён?)" }); return ok(); }
    if (k === "r") {
      await tg("answerCallbackQuery", { callback_query_id: q.id });
      const m = await tg("sendMessage", { chat_id: admin, text: `Ответ на № ${id} - напишите его ответом на это сообщение:`, reply_markup: { force_reply: true, input_field_placeholder: `Ответ на № ${id}` } });
      await mapMsg(db, m?.message_id, id);
    } else if (k === "c") {
      const ch = await db.from("support_tickets").update({ status: "closed", updated_at: now() }).eq("id", id).neq("status", "closed").select("id");
      await tg("answerCallbackQuery", { callback_query_id: q.id, text: ch.data?.length ? `№ ${id} закрыто` : `№ ${id} уже закрыто` });
      if (ch.data?.length) await tg("sendMessage", { chat_id: admin, text: `✓ № ${id} закрыто` });
    } else if (k === "p") {
      const { data: acc } = await db.from("airdef_accounts").select("nick, created_at").eq("player_id", t.player_id).maybeSingle();
      const { count } = await db.from("support_tickets").select("id", { count: "exact", head: true }).eq("player_id", t.player_id).neq("status", "draft");
      await tg("answerCallbackQuery", { callback_query_id: q.id });
      await tg("sendMessage", { chat_id: admin, text: `👤 ${acc?.nick || "без ника"}\nАккаунт игры с ${String(acc?.created_at || "").slice(0, 10)}\nОбращений всего: ${count ?? "?"}\nID: ${t.player_id}` });
    } else await tg("answerCallbackQuery", { callback_query_id: q.id });
    return ok();
  }
  const m = u.message;
  if (!m || !m.chat || m.chat.type !== "private") return ok();
  const from = m.from?.id;
  if (!admin || from !== admin) { // не поддержка: бот ничего не принимает и не пересылает - одна подсказка на языке человека, ничего не сохраняется
    const isStart = typeof m.text === "string" && m.text.startsWith("/start");
    if (!admin && isStart) { await tg("sendMessage", { chat_id: m.chat.id, text: `Ваш Telegram ID: ${from}` }); return ok(); } // настройка: пока SUPPORT_ADMIN_ID не вписан
    const lc = String(m.from?.language_code || "").slice(0, 2);
    await tg("sendMessage", { chat_id: m.chat.id, text: GUEST[lc] || GUEST.en });
    return ok();
  }
  if (typeof m.text === "string" && m.text.startsWith("/start")) {
    await tg("sendMessage", { chat_id: admin, text: "Вы - поддержка Air Superiority. Обращения игроков приходят сюда; чтобы ответить - ответьте на сообщение бота или нажмите «Ответить»." });
    await flush(db, 20);
    return ok();
  }
  const rid = m.reply_to_message?.message_id;
  if (!rid) { await tg("sendMessage", { chat_id: admin, text: "Чтобы ответить игроку - ответьте (Reply) на сообщение бота об обращении или нажмите «Ответить»." }); return ok(); }
  const { data: map } = await db.from("support_tg").select("ticket_id").eq("tg_msg_id", rid).maybeSingle();
  if (!map) { await tg("sendMessage", { chat_id: admin, text: "Не понял, к какому обращению ответ: ответьте на сообщение бота об обращении." }); return ok(); }
  if (m.photo || m.video || m.document || m.animation || m.voice || m.sticker || typeof m.text !== "string") { await tg("sendMessage", { chat_id: admin, text: "Ответ игроку - только текстом (картинки и файлы в игру не уходят)." }); return ok(); }
  const body = clean(m.text, 4000);
  if (!body) return ok();
  if (body.length > LIM.maxText) { await tg("sendMessage", { chat_id: admin, text: `Слишком длинно: ${body.length} знаков, можно до ${LIM.maxText}. Разбейте на два ответа.` }); return ok(); }
  const id = map.ticket_id;
  // повтор того же обновления от Telegram (наш прошлый ответ ему не дошёл) - сообщение уже учтено
  const own = await db.from("support_tg").insert({ tg_msg_id: m.message_id, ticket_id: id });
  if (own.error) return ok();
  const ins = await db.from("support_messages").insert({ ticket_id: id, author: "support", body, sent: true, notified: true });
  if (ins.error) { await db.from("support_tg").delete().eq("tg_msg_id", m.message_id); throw ins.error; }
  await db.from("support_tickets").update({ status: "answered", unread_player: true, updated_at: now() }).eq("id", id);
  await tg("sendMessage", { chat_id: admin, text: `✓ Ответ доставлен в игру (№ ${id})`, reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true } });
  return ok();
}

// ── игра ──
// deno-lint-ignore no-explicit-any
function checkFiles(files: any): { name: string; size: number; type: string }[] | null {
  if (files == null) return [];
  if (!Array.isArray(files) || files.length > LIM.maxFiles) return null;
  const out = [];
  for (const f of files) {
    if (!f || typeof f !== "object" || !TYPES[f.type] || !Number.isInteger(f.size) || f.size <= 0 || f.size > MAX_FILE) return null;
    out.push({ name: clean(f.name, 60).replace(/[^\p{L}\p{N}._ -]/gu, "_") || "file", size: f.size, type: f.type });
  }
  return out;
}
// сообщение готово (файлы загружены): видно в переписке, обращение ждёт ответа (закрытое не открывается), уведомление - после ответа игроку
async function finish(db: Db, ticketId: number, msgId: number) {
  const done = await db.from("support_messages").update({ sent: true }).eq("id", msgId).eq("sent", false).select("id");
  if (!done.data?.length) return; // уже отмечено (повтор sent)
  await db.from("support_tickets").update({ status: "new", updated_at: now() }).eq("id", ticketId).neq("status", "closed");
  later(notify(db, msgId).then((ok) => (ok ? flush(db, 5) : undefined)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = supabaseAdmin();
  try {
    const tgSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (tgSecret !== null) { // запрос от Telegram
      if (!TG() || tgSecret !== (await hookSecret())) return new Response("forbidden", { status: 403 });
      return await onTelegram(db, await req.json().catch(() => ({})));
    }
    await ensureWebhook(db).catch((e) => console.error("webhook", e instanceof Error ? e.message : e)); // вебхук бота - при первом же запросе после выкладки
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const who = await sessionPlayer(db, body);
    if (who.err) return who.err;
    if (who.kind !== "airdef") return jsonResponse({ error: "Поддержка - только с аккаунтом игры", code: "need_game_account" }, 403);
    const pid = who.id!;
    const own = async (v: unknown) => {
      const id = toId(v); if (!id) return null;
      const { data } = await db.from("support_tickets").select("id, topic, title, status, created_at, updated_at, unread_player").eq("id", id).eq("player_id", pid).maybeSingle();
      return data;
    };

    if (action === "list") {
      const { data, error } = await db.from("support_tickets").select("id, topic, title, status, unread_player, created_at, updated_at").eq("player_id", pid).neq("status", "draft").order("updated_at", { ascending: false }).limit(50);
      if (error) throw error;
      const ids = (data || []).map((t: { id: number }) => t.id), nf: Record<number, number> = {};
      if (ids.length) { const { data: ms } = await db.from("support_messages").select("ticket_id, files").in("ticket_id", ids).eq("sent", true); for (const m of ms || []) nf[m.ticket_id] = (nf[m.ticket_id] || 0) + (m.files || []).length; }
      const tickets = (data || []).map((t: { id: number; unread_player: boolean }) => ({ ...t, unread: t.unread_player, unread_player: undefined, files: nf[t.id] || 0 }));
      return jsonResponse({ tickets, unread: tickets.filter((t: { unread: boolean }) => t.unread).length, limits: { maxFiles: LIM.maxFiles, maxFileMB: LIM.maxFileMB, maxText: LIM.maxText } });
    }
    if (action === "thread") {
      const t = await own(body.id); if (!t || t.status === "draft") return notFound();
      const { data: ms, error } = await db.from("support_messages").select("id, author, body, files, created_at").eq("ticket_id", t.id).eq("sent", true).order("id");
      if (error) throw error;
      if (t.unread_player) await db.from("support_tickets").update({ unread_player: false }).eq("id", t.id);
      const messages = (ms || []).map((m: { files: { name: string; size: number; type: string }[] }) => ({ ...m, files: (m.files || []).map((f) => ({ name: f.name, size: f.size, type: f.type })) }));
      return jsonResponse({ ticket: { id: t.id, topic: t.topic, title: t.title, status: t.status, created_at: t.created_at }, messages });
    }
    if (action === "create" || action === "reply") {
      const text = clean(body.body, LIM.maxText), files = checkFiles(body.files);
      if (!text || files === null) return bad();
      if (files.length && !filesReady()) return jsonResponse({ error: "Файлы сейчас не принимаются - отправьте без них" }, 503);
      if (action === "create" && !TOPICS[body.topic]) return bad();
      const ticketArg = action === "create" ? null : toId(body.id);
      if (action === "reply" && !ticketArg) return notFound();
      const bytes = files.reduce((a, f) => a + f.size, 0);
      const r = await db.rpc("support_add", { p_player: pid, p_ticket: ticketArg, p_topic: action === "create" ? body.topic : null, p_title: clean(text.split("\n")[0], 60), p_lang: clean(body.meta?.lang, 5) || null, p_meta: action === "create" ? cleanMeta(body.meta) : null, p_body: text, p_bytes: bytes, p_max_tickets: LIM.ticketsDay, p_max_open: LIM.open, p_max_msgs: LIM.msgsDay, p_max_bytes: LIM.mbDay * 1048576 });
      if (r.error) throw r.error;
      const e = r.data?.err;
      if (e === "msgs") return limit("Слишком много сообщений за сутки - попробуйте завтра");
      if (e === "bytes") return limit(`Больше ${LIM.mbDay} МБ файлов за сутки нельзя - попробуйте завтра`);
      if (e === "tickets") return limit("Не больше 5 обращений за сутки - попробуйте завтра");
      if (e === "open") return limit("Открыто уже 5 обращений - дождитесь ответа или закройте старые");
      if (e === "closed") return jsonResponse({ error: "Обращение закрыто - создайте новое" }, 409);
      if (e || !r.data?.msg) return notFound();
      const ticketId = Number(r.data.ticket), msgId = Number(r.data.msg);
      const keyed = files.map((f, i) => ({ ...f, key: `p/${pid}/${ticketId}/${msgId}-${i}-${crypto.randomUUID().slice(0, 8)}.${TYPES[f.type]}` }));
      if (keyed.length) { const u = await db.from("support_messages").update({ files: keyed }).eq("id", msgId); if (u.error) throw u.error; }
      const uploads = [];
      for (const f of keyed) uploads.push({ url: await signedUrl("put", f.key, 3600, f.size, f.type), method: "PUT", headers: { "Content-Type": f.type } });
      if (!keyed.length) await finish(db, ticketId, msgId);
      return jsonResponse(action === "create" ? { id: ticketId, msg_id: msgId, uploads } : { msg_id: msgId, uploads });
    }
    if (action === "sent" || action === "cancel") {
      const t = await own(body.id), msgId = toId(body.msg_id);
      if (!t || !msgId) return notFound();
      const { data: m } = await db.from("support_messages").select("id, sent").eq("id", msgId).eq("ticket_id", t.id).eq("author", "player").maybeSingle();
      if (!m) return notFound();
      if (action === "sent") { if (!m.sent) await finish(db, t.id, m.id); return jsonResponse({ ok: true }); }
      if (!m.sent) { // «Не отправлять»: незагруженное сообщение (и черновик обращения) - прочь, лимит не съедается
        await db.from("support_messages").delete().eq("id", m.id).eq("sent", false);
        if (t.status === "draft") await db.from("support_tickets").delete().eq("id", t.id).eq("status", "draft");
      }
      return jsonResponse({ ok: true });
    }
    if (action === "close") {
      const t = await own(body.id); if (!t || t.status === "draft") return notFound();
      const ch = await db.from("support_tickets").update({ status: "closed", updated_at: now() }).eq("id", t.id).neq("status", "closed").select("id");
      if (ch.data?.length) later(tg("sendMessage", { chat_id: ADMIN(), text: `№ ${t.id} игрок закрыл сам` }).then(() => undefined));
      return jsonResponse({ ok: true });
    }
    return bad("Неизвестное действие");
  } catch (e) {
    console.error("airdef-support", e instanceof Error ? e.message : e);
    return jsonResponse({ error: "Ошибка сервера" }, 500);
  }
});
