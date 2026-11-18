// Копии обращений в Telegram у поддержки - стереть, когда игрок удалил аккаунт (Mark 2026-11-18: «через бота настрой удаление через 30 дней»;
// Политика конфиденциальности обещает - не позже 30 дней). Номера сообщений бота по обращениям игрока (support_tg) сначала встают в очередь
// support_tg_purge (sql/036) - она переживает удаление аккаунта и сбой Telegram; потом бот стирает их сразу и повторяет неудачные при следующих
// вызовах airdef-support.
// Telegram удаляет сообщения бота только моложе 48 часов: старше - бот заменяет текст на «удалено», фото - на пустую серую картинку.
// Сообщения, которые бот не может ни удалить, ни изменить (ответы самой поддержки старше 48 часов), через 30 дней выходят из очереди.
// deno-lint-ignore no-explicit-any
type Db = any;
const TG = () => Deno.env.get("TG_SUPPORT_TOKEN") || "";
const ADMIN = () => Number(Deno.env.get("SUPPORT_ADMIN_ID") || 0);
const GONE = "🗑 Удалено: игрок удалил аккаунт";
const KEEP_DAYS = 30;
// серая картинка 160×90 вместо фото игрока
const BLANK = "iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAAAAAAarQKOAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAcElEQVR4nO3OMQ0AIADAMEiwg397SODoAceqoHOPv63XgZuCqqAqqAqqgqqgKqgKqoKqoCqoCqqCqqAqqAqqgqqgKqgKqoKqoCqoCqqCqqAqqAqqgqqgKqgKqoKqoCqoCqqCqqAqqAqqgqqgKqgKqgPCDAGT2oMkygAAAABJRU5ErkJggg==";

// ответ Telegram: { ok, description } - в журнал только имя метода (адрес с токеном не печатаем)
async function call(method: string, body: BodyInit, json: boolean): Promise<{ ok: boolean; description?: string }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TG()}/${method}`, { method: "POST", ...(json ? { headers: { "Content-Type": "application/json" } } : {}), body, signal: AbortSignal.timeout(6000) });
    return await r.json().catch(() => ({ ok: false, description: "bad json" }));
  } catch (_) { return { ok: false, description: "нет связи" }; }
}
const j = (method: string, p: Record<string, unknown>) => call(method, JSON.stringify(p), true);
// уже нет такого сообщения или нечего менять - для очереди это успех
const settled = (d: { ok: boolean; description?: string }) => d.ok || /message to (delete|edit) not found|message is not modified|MESSAGE_ID_INVALID/i.test(d.description || "");

// одно сообщение: удалить → заменить текст → заменить фото. true - больше ничего не видно
export async function purgeOne(msgId: number): Promise<boolean> {
  const chat_id = ADMIN();
  if (settled(await j("deleteMessage", { chat_id, message_id: msgId }))) return true;
  if (settled(await j("editMessageText", { chat_id, message_id: msgId, text: GONE }))) { await j("editMessageReplyMarkup", { chat_id, message_id: msgId, reply_markup: { inline_keyboard: [] } }); return true; }
  const f = new FormData();
  f.append("chat_id", String(chat_id)); f.append("message_id", String(msgId));
  f.append("media", JSON.stringify({ type: "photo", media: "attach://blank", caption: GONE }));
  f.append("blank", new Blob([Uint8Array.from(atob(BLANK), (c) => c.charCodeAt(0))], { type: "image/png" }), "deleted.png");
  return settled(await call("editMessageMedia", f, false));
}

// до удаления аккаунта: все сообщения бота по обращениям игрока - в очередь (одним запросом)
export async function queuePlayerTg(db: Db, playerId: string): Promise<number> {
  const { data: tickets, error: e1 } = await db.from("support_tickets").select("id").eq("player_id", playerId);
  if (e1) throw e1;
  const ids = (tickets || []).map((t: { id: number }) => t.id);
  if (!ids.length) return 0;
  const { data: msgs, error: e2 } = await db.from("support_tg").select("tg_msg_id").in("ticket_id", ids);
  if (e2) throw e2;
  const rows = (msgs || []).map((m: { tg_msg_id: number }) => ({ tg_msg_id: m.tg_msg_id }));
  if (!rows.length) return 0;
  const { error: e3 } = await db.from("support_tg_purge").upsert(rows, { onConflict: "tg_msg_id", ignoreDuplicates: true });
  if (e3) throw e3;
  return rows.length;
}

// разобрать очередь: стёртое - из очереди; не вышло - попытка +1; старше 30 дней - из очереди (в журнал)
export async function drainTg(db: Db, max = 20): Promise<void> {
  if (!TG() || !ADMIN()) return;
  const { data, error } = await db.from("support_tg_purge").select("tg_msg_id, tries, created_at").order("tries").order("created_at").limit(max);
  if (error) { console.error("tg purge read", error.message); return; }
  for (const r of data || []) {
    if (await purgeOne(Number(r.tg_msg_id))) { await db.from("support_tg_purge").delete().eq("tg_msg_id", r.tg_msg_id); continue; }
    if (Date.now() - Date.parse(r.created_at) > KEEP_DAYS * 864e5) { console.error("tg purge: не стёрто за 30 дней", r.tg_msg_id); await db.from("support_tg_purge").delete().eq("tg_msg_id", r.tg_msg_id); continue; }
    await db.from("support_tg_purge").update({ tries: (Number(r.tries) || 0) + 1 }).eq("tg_msg_id", r.tg_msg_id);
  }
}
