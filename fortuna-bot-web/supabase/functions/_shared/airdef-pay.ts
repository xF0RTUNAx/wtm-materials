// Покупки «Воздушного превосходства» за Telegram Stars (Mark 2026-11-19): счёт, проверка перед списанием, начисление, возврат.
// Каталог и цены - arsenal.js PAY (копия _shared/airdef/arsenal.js); деньги и сроки меняет только SQL (sql/037_airdef_premium_pay.sql).
// Бот - TG_PAY_TOKEN, если вписан (отдельный платёжный бот со своим вебхуком), иначе бот поддержки (TG_SUPPORT_TOKEN, вебхук airdef-support).
// Безопасность: цену берёт сервер (не игра); в счёте - только номер заказа; Telegram перед списанием спрашивает бота (pre_checkout_query),
// начисление - по successful_payment с проверкой суммы и валюты, повтор того же платежа не начисляет (charge id - unique). Данных карт мы не видим.
import { PAY } from "./airdef/arsenal.js";

// deno-lint-ignore no-explicit-any
type Db = any;
export const PAY_TOKEN = () => Deno.env.get("TG_PAY_TOKEN") || Deno.env.get("TG_SUPPORT_TOKEN") || "";
const ADMIN = () => Number(Deno.env.get("SUPPORT_ADMIN_ID") || 0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SITE = "https://fortunawtm.com/fortuna-bot-web/games/legal/";
const MAIL = "support@airsuperiorityonline.com";

// deno-lint-ignore no-explicit-any
export async function payTg(method: string, payload: Record<string, unknown>): Promise<any> {
  const t = PAY_TOKEN(); if (!t) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(6000) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) console.error("pay tg", method, r.status, String(d.description || "").slice(0, 200));
    return d.ok ? d.result : null;
  } catch (_) { console.error("pay tg", method, "нет связи"); return null; }
}

// ── тексты счёта и ответов (язык игры / Telegram) ──
type L = "ru" | "uk" | "en" | "de" | "es" | "fr";
const lng = (l: unknown): L => (["ru", "uk", "en", "de", "es", "fr"].includes(String(l)) ? String(l) as L : "en");
const T = {
  prem: { ru: "Премиум на {n}", uk: "Преміум на {n}", en: "Premium for {n}", de: "Premium für {n}", es: "Premium por {n}", fr: "Premium pour {n}" },
  gems: { ru: "{n} кристаллов", uk: "{n} кристалів", en: "{n} crystals", de: "{n} Kristalle", es: "{n} cristales", fr: "{n} cristaux" },
  premD: {
    ru: "×1,75 к серебру и опыту за бой, +1 кристалл за каждый день входа, ещё по 1 бесплатной замене заданий. Срок идёт с момента покупки.",
    uk: "×1,75 до срібла й досвіду за бій, +1 кристал за кожен день входу, ще по 1 безплатній заміні завдань. Строк іде з моменту покупки.",
    en: "×1.75 silver and XP per battle, +1 crystal for every day you log in, 1 extra free task swap. The time starts at purchase.",
    de: "×1,75 Silber und EP pro Gefecht, +1 Kristall für jeden Tag mit Login, je 1 zusätzlicher kostenloser Auftragstausch. Die Laufzeit beginnt mit dem Kauf.",
    es: "×1,75 de plata y experiencia por batalla, +1 cristal por cada día que entres y 1 cambio de misión gratis más. El plazo empieza con la compra.",
    fr: "×1,75 d'argent et d'expérience par bataille, +1 cristal par jour de connexion et 1 changement de mission gratuit en plus. La durée commence à l'achat.",
  },
  gemsD: {
    ru: "Кристаллы для магазина Air Superiority: окраски и аватарки. Начисляются сразу после оплаты.",
    uk: "Кристали для крамниці Air Superiority: камуфляжі та аватарки. Нараховуються одразу після оплати.",
    en: "Crystals for the Air Superiority shop: camouflages and avatars. Credited right after payment.",
    de: "Kristalle für den Air-Superiority-Shop: Tarnungen und Avatare. Werden direkt nach der Zahlung gutgeschrieben.",
    es: "Cristales para la tienda de Air Superiority: camuflajes y avatares. Se acreditan justo después del pago.",
    fr: "Cristaux pour la boutique Air Superiority : camouflages et avatars. Crédités dès le paiement.",
  },
  thanks: {
    ru: "Спасибо! Покупка зачислена: {w}. Вернитесь в игру - всё уже на месте.",
    uk: "Дякуємо! Покупку зараховано: {w}. Поверніться в гру - усе вже на місці.",
    en: "Thank you! Your purchase is credited: {w}. Head back to the game - it's all there.",
    de: "Danke! Dein Kauf ist gutgeschrieben: {w}. Zurück ins Spiel - alles ist schon da.",
    es: "¡Gracias! Tu compra ya está acreditada: {w}. Vuelve al juego, ya lo tienes todo.",
    fr: "Merci ! Votre achat est crédité : {w}. Revenez dans le jeu, tout y est déjà.",
  },
  paysupport: {
    ru: "Вопросы по покупкам: напишите из игры (Профиль → Поддержка, тема «Покупки») или на {mail}. Укажите дату покупки и ник. Условия покупок и возвратов: {terms}",
    uk: "Питання щодо покупок: напишіть із гри (Профіль → Підтримка, тема «Покупки») або на {mail}. Вкажіть дату покупки й нік. Умови покупок і повернень: {terms}",
    en: "Questions about purchases: write to us from the game (Profile → Support, topic \"Purchases\") or at {mail}. Include the purchase date and your nickname. Purchase and refund terms: {terms}",
    de: "Fragen zu Käufen: schreib uns aus dem Spiel (Profil → Support, Thema „Käufe“) oder an {mail}. Gib das Kaufdatum und deinen Nicknamen an. Kauf- und Erstattungsbedingungen: {terms}",
    es: "Dudas sobre compras: escríbenos desde el juego (Perfil → Soporte, tema «Compras») o a {mail}. Indica la fecha de compra y tu apodo. Condiciones de compra y reembolso: {terms}",
    fr: "Questions sur les achats : écrivez-nous depuis le jeu (Profil → Support, sujet « Achats ») ou à {mail}. Indiquez la date d'achat et votre pseudo. Conditions d'achat et de remboursement : {terms}",
  },
  terms: { ru: "Правила пользования и условия покупок: {terms}", uk: "Правила користування та умови покупок: {terms}", en: "Terms of Use and Purchase Terms: {terms}", de: "Nutzungs- und Kaufbedingungen: {terms}", es: "Términos de uso y condiciones de compra: {terms}", fr: "Conditions d'utilisation et de vente : {terms}" },
  bad: {
    ru: "Этот счёт уже недействителен. Откройте магазин в игре и нажмите «Купить» ещё раз.",
    uk: "Цей рахунок уже недійсний. Відкрийте крамницю в грі й натисніть «Купити» ще раз.",
    en: "This invoice is no longer valid. Open the shop in the game and tap \"Buy\" again.",
    de: "Diese Rechnung ist nicht mehr gültig. Öffne den Shop im Spiel und tippe erneut auf „Kaufen“.",
    es: "Esta factura ya no es válida. Abre la tienda en el juego y vuelve a pulsar «Comprar».",
    fr: "Cette facture n'est plus valable. Ouvrez la boutique dans le jeu et appuyez de nouveau sur « Acheter ».",
  },
} as const;
const DAYS: Record<L, (n: number) => string> = {
  ru: (n) => (n === 1 ? "1 день" : n === 7 ? "7 дней" : `${n} дней`), uk: (n) => (n === 1 ? "1 день" : `${n} днів`),
  en: (n) => (n === 1 ? "1 day" : `${n} days`), de: (n) => (n === 1 ? "1 Tag" : `${n} Tage`), es: (n) => (n === 1 ? "1 día" : `${n} días`), fr: (n) => (n === 1 ? "1 jour" : `${n} jours`),
};
const fmt = (s: string, o: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(o[k] ?? ""));
type Sku = { prem?: number; gems?: number; stars: number; usd: number };
export const skuOf = (k: unknown): Sku | null => (typeof k === "string" && Object.hasOwn(PAY, k) ? (PAY as Record<string, Sku>)[k] : null);
const what = (s: Sku, l: L) => (s.prem ? fmt(T.prem[l], { n: DAYS[l](s.prem) }) : fmt(T.gems[l], { n: s.gems! }));

// ── счёт для игры: заказ в базе → ссылка Telegram (t.me/$…). Ответ { link, order } | { error, code } ──
export async function makeInvoice(db: Db, player: string, sku: string, lang: unknown): Promise<{ link?: string; order?: string; code?: string }> {
  const s = skuOf(sku); if (!s) return { code: "bad_sku" };
  if (!PAY_TOKEN()) return { code: "off" };
  const o = await db.rpc("airdef_order_new", { p_player: player, p_sku: sku, p_stars: s.stars, p_days: s.prem || 0, p_gems: s.gems || 0 });
  if (o.error) throw o.error;
  if (o.data?.error) return { code: o.data.error };
  const l = lng(lang), title = what(s, l);
  const link = await payTg("createInvoiceLink", {
    title, description: s.prem ? T.premD[l] : T.gemsD[l], payload: o.data.id, currency: "XTR", prices: [{ label: title, amount: s.stars }],
  });
  if (!link) return { code: "tg" };
  return { link, order: o.data.id };
}
// состояние заказа (игра ждёт оплату): new | paid | refunded; чужой заказ - как несуществующий
export async function orderState(db: Db, player: string, id: unknown): Promise<string | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const r = await db.from("airdef_orders").select("status").eq("id", id).eq("player_id", player).maybeSingle();
  if (r.error) throw r.error;
  return r.data?.status ?? null;
}

// ── обновления Telegram: true - обновление про оплату, обработано (вызывающий больше ничего не делает) ──
// deno-lint-ignore no-explicit-any
export async function payUpdate(db: Db, u: any): Promise<boolean> {
  const q = u?.pre_checkout_query;
  if (q) { // перед списанием: ответить за 10 с, иначе Telegram отменит оплату
    const l = lng(String(q.from?.language_code || "").slice(0, 2));
    let good = false;
    if (q.currency === "XTR" && UUID.test(String(q.invoice_payload || ""))) {
      const c = await db.rpc("airdef_pay_check", { p_order: q.invoice_payload, p_stars: Number(q.total_amount) });
      good = !c.error && c.data === "ok";
      if (!good) console.error("pay check", c.error?.message || c.data);
    }
    await payTg("answerPreCheckoutQuery", good ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: T.bad[l] });
    return true;
  }
  const m = u?.message;
  if (!m) return false;
  const l = lng(String(m.from?.language_code || "").slice(0, 2));
  const sp = m.successful_payment;
  if (sp) {
    if (sp.currency !== "XTR" || !UUID.test(String(sp.invoice_payload || ""))) { await alarm(`Оплата с непонятным счётом: ${sp.currency} ${sp.total_amount}, charge ${sp.telegram_payment_charge_id}`); return true; }
    const r = await db.rpc("airdef_pay_credit", { p_order: sp.invoice_payload, p_charge: String(sp.telegram_payment_charge_id), p_stars: Number(sp.total_amount), p_tg: Number(m.from?.id) || null });
    if (r.error) throw r.error; // 500 → Telegram повторит обновление позже; повтор не задвоит (charge id)
    const d = r.data || {};
    if (d.error) { await alarm(`⚠ Оплата не зачислена (${d.error}): ${sp.total_amount} ⭐, charge ${sp.telegram_payment_charge_id}. Вернуть: /refund ${sp.telegram_payment_charge_id}`); return true; }
    if (d.ok) {
      const s = skuOf(d.sku);
      await payTg("sendMessage", { chat_id: m.chat.id, text: fmt(T.thanks[l], { w: s ? what(s, l) : d.sku }) });
      await alarm(`⭐ Покупка: ${s ? what(s, "ru") : d.sku} - ${sp.total_amount} ⭐`);
    }
    return true;
  }
  const rp = m.refunded_payment; // возврат (сделанный ботом или Telegram): снять, что ещё не потрачено; второй раз - not_paid, без вреда
  if (rp) {
    const r = await db.rpc("airdef_pay_refund", { p_charge: String(rp.telegram_payment_charge_id) });
    if (r.error) throw r.error;
    if (r.data?.ok) await alarm(`↩ Возврат: ${rp.total_amount} ⭐ (снято кристаллов: ${r.data.gems})`);
    return true;
  }
  const txt = typeof m.text === "string" ? m.text.trim() : "";
  if (/^\/paysupport(@\w+)?$/.test(txt)) { await payTg("sendMessage", { chat_id: m.chat.id, text: fmt(T.paysupport[l], { mail: MAIL, terms: `${SITE}terms.html?lang=${l}` }), link_preview_options: { is_disabled: true } }); return true; }
  if (/^\/terms(@\w+)?$/.test(txt)) { await payTg("sendMessage", { chat_id: m.chat.id, text: fmt(T.terms[l], { terms: `${SITE}terms.html?lang=${l}` }), link_preview_options: { is_disabled: true } }); return true; }
  const rf = txt.match(/^\/refund\s+(\S{1,200})$/);
  if (rf && ADMIN() && m.from?.id === ADMIN()) { await refundCmd(db, rf[1]); return true; }
  return false;
}
// /refund <charge id> - только Mark: звёзды назад плательщику, покупка снимается
async function refundCmd(db: Db, charge: string) {
  const { data: o } = await db.from("airdef_orders").select("tg_user, stars, sku, status").eq("charge_id", charge).maybeSingle();
  if (!o) { await alarm("Платёж не найден: " + charge); return; }
  if (o.status !== "paid") { await alarm(`Этот платёж уже ${o.status === "refunded" ? "возвращён" : "не оплачен"}.`); return; }
  const ok = await payTg("refundStarPayment", { user_id: Number(o.tg_user), telegram_payment_charge_id: charge });
  if (!ok) { await alarm("Telegram не принял возврат (подробности - в журнале функции)."); return; }
  const r = await db.rpc("airdef_pay_refund", { p_charge: charge });
  await alarm(r.data?.ok ? `↩ Возвращено ${o.stars} ⭐ (${o.sku}); снято кристаллов: ${r.data.gems}` : `Звёзды возвращены, но в базе: ${r.error?.message || r.data?.error}`);
}
const alarm = async (text: string) => { if (ADMIN()) await payTg("sendMessage", { chat_id: ADMIN(), text }); };
