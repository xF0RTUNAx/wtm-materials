// Ключ сессии аккаунта игры (Mark 2026-11-17, аудит: номер игрока утекал через публичную ленту сайта - он больше не ключ).
// Аккаунт игры (players.kind = 'airdef') - только по ключу { sess }; аккаунт сайта (старые игроки сайта, «Летка») - как раньше по player_id:
// функции сайта и так доверяют номеру, их переделка - отдельно, на стороне сайта. Таблица - sql/032_airdef_sessions.sql.
import { jsonResponse } from "./cors.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
const enc = new TextEncoder();
const DAY = 864e5, TTL = 90 * DAY, MAX_DEVICES = 10;
export const SESSION_ERR = { error: "Войдите в аккаунт игры заново", code: "session" };

export async function sha256hex(s: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

// новый ключ: сам ключ - клиенту, в базу - хеш; старые устройства сверх MAX_DEVICES - прочь
export async function newSession(db: Db, playerId: string): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const ins = await db.from("airdef_sessions").insert({ token_hash: await sha256hex(token), player_id: playerId });
  if (ins.error) throw ins.error;
  const old = await db.from("airdef_sessions").select("token_hash").eq("player_id", playerId).order("last_used", { ascending: false }).range(MAX_DEVICES, MAX_DEVICES + 200);
  if (old.data?.length) await db.from("airdef_sessions").delete().in("token_hash", old.data.map((r: { token_hash: string }) => r.token_hash));
  return token;
}

export async function dropSession(db: Db, token: unknown): Promise<void> {
  if (typeof token === "string" && token.length >= 20 && token.length <= 200) await db.from("airdef_sessions").delete().eq("token_hash", await sha256hex(token));
}

// игрок запроса: { id, kind } или { err } - готовый ответ. strict: false - для чтения (рейтинг): без ключа и с чужим номером - просто «нет игрока»
export async function sessionPlayer(db: Db, body: Record<string, unknown> | null | undefined, strict = true): Promise<{ id?: string; kind?: string; err?: Response }> {
  const sess = body?.sess;
  if (typeof sess === "string" && sess.length >= 20 && sess.length <= 200) {
    const hash = await sha256hex(sess);
    const { data, error } = await db.from("airdef_sessions").select("player_id, expires_at, last_used").eq("token_hash", hash).maybeSingle();
    if (error) throw error;
    if (!data || Date.parse(data.expires_at) < Date.now()) return strict ? { err: jsonResponse(SESSION_ERR, 401) } : {};
    if (Date.now() - Date.parse(data.last_used) > 3600e3) { // продление - не чаще раза в час
      const now = Date.now();
      await db.from("airdef_sessions").update({ last_used: new Date(now).toISOString(), expires_at: new Date(now + TTL).toISOString() }).eq("token_hash", hash);
    }
    return { id: data.player_id, kind: "airdef" };
  }
  const id = body?.player_id;
  if (typeof id !== "string" || id.length < 8 || id.length > 64) return strict ? { err: jsonResponse({ error: "Некорректные параметры" }, 400) } : {};
  const { data: p, error } = await db.from("players").select("kind").eq("id", id).maybeSingle();
  if (error) throw error;
  if (p && p.kind === "airdef") return strict ? { err: jsonResponse(SESSION_ERR, 401) } : {}; // аккаунт игры по одному номеру - нельзя
  return { id, kind: p?.kind };
}
