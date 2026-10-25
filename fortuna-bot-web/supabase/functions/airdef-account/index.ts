// airdef-account — свои аккаунты «Воздушного превосходства» (Mark 2026-10-25): логин и пароль игры, ник для рейтинга, перенос прогресса
// игры с аккаунта сайта (sql/022: players.kind = 'airdef', логин 'ad:<логин>' — вход сайта такие строки не видит; airdef_accounts, airdef_transfer).
// Аккаунт сайта в игре по-прежнему работает, но без рейтинга; мини-игры сайта остаются на нём.
//   { action: 'register', login, password, nick }         → { account: { id, login, nick } }
//   { action: 'login', login, password }                  → { account }
//   { action: 'transfer', id, password, site_login, site_password } → { moved } (данные игры с аккаунта сайта; каждый — один раз)
//   { action: 'rename', id, password, nick }              → { account } (раз в сезон)
//   { action: 'site_status', site_id }                    → { progress, transferred } — показывать ли «Перенести прогресс»
// Перебор паролей: 10 неудач подряд по ключу 'login:<логин игры>' (для пароля сайта — 'site:<логин сайта>') — отказ 429 на 15 минут;
// удачный вход сбрасывает (sql/022: airdef_auth_fail, airdef_auth_fail_hit).
// Пароль хешируется только здесь (_shared/password.ts, как auth-password) и наружу не уходит.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { hashPassword, verifyPassword } from "../_shared/password.ts";

const LOGIN_RE = /^[a-zA-Z0-9_]{3,24}$/;
const NICK_RE = /^[\p{L}\p{N}_\- ]{3,16}$/u;
const SITE_LOGIN_RE = /^[a-zA-Z0-9_]{3,32}$/; // как в auth-password
const cleanNick = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const ERR: Record<string, string> = {
  already_used: "С этого аккаунта сайта прогресс уже перенесён",
  already_done: "В этот аккаунт игры прогресс уже переносили",
  not_site: "Это не аккаунт сайта",
  not_airdef: "Это не аккаунт игры",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const db = supabaseAdmin();
    // защита от перебора паролей: ключ — 'login:<логин игры>' / 'site:<логин сайта>'; 10 неудач подряд — отказ на 15 минут
    const tooMany = () => jsonResponse({ error: "Слишком много попыток, подождите 15 минут" }, 429);
    const isLocked = async (key: string) => {
      const { data, error } = await db.from("airdef_auth_fail").select("until").eq("key", key).maybeSingle();
      if (error) throw error;
      return !!data?.until && Date.parse(data.until) > Date.now();
    };
    const failHit = async (key: string) => { // true — эта неудача заперла ключ
      const r = await db.rpc("airdef_auth_fail_hit", { p_key: key });
      if (r.error) { console.error("airdef-account auth_fail_hit", r.error); return false; }
      return !!r.data;
    };
    const failClear = async (key: string) => { const r = await db.from("airdef_auth_fail").delete().eq("key", key); if (r.error) console.error("airdef-account auth_fail_clear", r.error); };
    // проверка пароля под защитой от перебора: "ok" | "bad" | "locked"
    const guarded = async (key: string, verify: () => Promise<boolean>): Promise<"ok" | "bad" | "locked"> => {
      if (await isLocked(key)) return "locked";
      if (await verify()) { await failClear(key); return "ok"; }
      return (await failHit(key)) ? "locked" : "bad";
    };
    // аккаунт игры по id и паролю (перенос, смена ника): { me } | { err } — готовый ответ
    const own = async (id: unknown, password: unknown, bad: string): Promise<{ me?: { id: string; login: string }; err?: Response }> => {
      const fail = { err: jsonResponse({ error: bad }, 401) };
      if (typeof id !== "string" || id.length < 8 || id.length > 64 || typeof password !== "string") return fail;
      const { data } = await db.from("players").select("id, login, password_hash, kind").eq("id", id).maybeSingle();
      if (!data || data.kind !== "airdef") return fail;
      const st = await guarded("login:" + String(data.login).replace(/^ad:/, "").toLowerCase(), () => verifyPassword(password, data.password_hash));
      return st === "ok" ? { me: data } : st === "locked" ? { err: tooMany() } : fail;
    };
    // ник совпадает (без учёта регистра) с логином игрока сайта — занят (чтобы не подписываться чужим логином)
    const nickIsSiteLogin = async (nick: string) => {
      const { data } = await db.from("players").select("id").eq("kind", "site").ilike("login", nick.replace(/[%_\\]/g, "\\$&")).limit(1);
      return !!data && data.length > 0;
    };
    const season = async () => { const s = await db.rpc("airdef_season_at", { ts: new Date().toISOString() }); return Number(s.data) || 0; };
    const view = async (id: string, login: string) => {
      const { data } = await db.from("airdef_accounts").select("nick, from_player").eq("player_id", id).maybeSingle();
      return { id, login: login.replace(/^ad:/, ""), nick: data?.nick ?? "", transferred: !!data?.from_player };
    };

    if (action === "register") {
      const { login, password } = body, nick = cleanNick(body.nick);
      if (typeof login !== "string" || !LOGIN_RE.test(login)) return jsonResponse({ error: "Логин: 3–24 символа — латиница, цифры, подчёркивание" }, 400);
      if (typeof password !== "string" || password.length < 6 || password.length > 128) return jsonResponse({ error: "Пароль: минимум 6 символов" }, 400);
      if (!NICK_RE.test(nick)) return jsonResponse({ error: "Ник: 3–16 символов — буквы, цифры, пробел, _ и -" }, 400);
      const key = "ad:" + login.toLowerCase();
      const taken = await db.from("players").select("id").eq("login", key).maybeSingle();
      if (taken.data) return jsonResponse({ error: "Этот логин уже занят" }, 409);
      if (await nickIsSiteLogin(nick)) return jsonResponse({ error: "Этот ник занят" }, 409);
      const nickTaken = await db.from("airdef_accounts").select("player_id").ilike("nick", nick.replace(/[%_\\]/g, "\\$&")).maybeSingle();
      if (nickTaken.data) return jsonResponse({ error: "Этот ник уже занят" }, 409);
      const password_hash = await hashPassword(password);
      const { data: p, error } = await db.from("players").insert({ login: key, password_hash, kind: "airdef", full_name: nick }).select("id, login").single();
      if (error) { if ((error as { code?: string }).code === "23505") return jsonResponse({ error: "Этот логин уже занят" }, 409); throw error; }
      const a = await db.from("airdef_accounts").insert({ player_id: p.id, nick, nick_season: 0 }); // 0 — новичок один раз правит ник в текущем сезоне
      if (a.error) {
        await db.from("players").delete().eq("id", p.id); // ник заняли одновременно — не оставлять аккаунт без ника
        if ((a.error as { code?: string }).code === "23505") return jsonResponse({ error: "Этот ник уже занят" }, 409);
        throw a.error;
      }
      return jsonResponse({ account: await view(p.id, p.login) });
    }

    if (action === "login") {
      const { login, password } = body;
      if (typeof login !== "string" || !LOGIN_RE.test(login) || typeof password !== "string") return jsonResponse({ error: "Неверный логин или пароль" }, 401);
      const { data: p, error } = await db.from("players").select("id, login, password_hash, kind").eq("login", "ad:" + login.toLowerCase()).maybeSingle();
      if (error) throw error;
      const st = await guarded("login:" + login.toLowerCase(), async () => !!p && p.kind === "airdef" && (await verifyPassword(password, p.password_hash)));
      if (st === "locked") return tooMany();
      if (st === "bad" || !p) return jsonResponse({ error: "Неверный логин или пароль" }, 401);
      await db.from("players").update({ last_seen: new Date().toISOString() }).eq("id", p.id);
      return jsonResponse({ account: await view(p.id, p.login) });
    }

    if (action === "transfer") {
      const o = await own(body.id, body.password, "Неверный пароль аккаунта игры");
      if (!o.me) return o.err!;
      const me = o.me;
      const { site_login, site_password } = body;
      if (typeof site_login !== "string" || !SITE_LOGIN_RE.test(site_login) || typeof site_password !== "string") return jsonResponse({ error: "Неверный логин или пароль сайта" }, 401);
      const { data: site } = await db.from("players").select("id, password_hash, kind").eq("login", site_login).maybeSingle();
      const st = await guarded("site:" + site_login.toLowerCase(), async () => !!site && site.kind === "site" && (await verifyPassword(site_password, site.password_hash)));
      if (st === "locked") return tooMany();
      if (st === "bad" || !site) return jsonResponse({ error: "Неверный логин или пароль сайта" }, 401);
      const t = await db.rpc("airdef_transfer", { p_from: site.id, p_to: me.id });
      if (t.error) {
        const code = Object.keys(ERR).find((k) => String(t.error?.message || "").includes(k));
        if (code) return jsonResponse({ error: ERR[code] }, 409);
        throw t.error;
      }
      return jsonResponse({ moved: t.data, account: await view(me.id, me.login) });
    }

    if (action === "rename") {
      const o = await own(body.id, body.password, "Неверный пароль");
      if (!o.me) return o.err!;
      const me = o.me;
      const nick = cleanNick(body.nick);
      if (!NICK_RE.test(nick)) return jsonResponse({ error: "Ник: 3–16 символов — буквы, цифры, пробел, _ и -" }, 400);
      if (await nickIsSiteLogin(nick)) return jsonResponse({ error: "Этот ник занят" }, 409);
      const s = await season(), cur = await db.from("airdef_accounts").select("nick, nick_season").eq("player_id", me.id).maybeSingle();
      if (cur.data && cur.data.nick_season === s && cur.data.nick.toLowerCase() !== nick.toLowerCase()) return jsonResponse({ error: "Ник меняется раз в сезон" }, 409);
      const up = await db.from("airdef_accounts").update({ nick, nick_season: s }).eq("player_id", me.id);
      if (up.error) { if ((up.error as { code?: string }).code === "23505") return jsonResponse({ error: "Этот ник уже занят" }, 409); throw up.error; }
      await db.from("players").update({ full_name: nick }).eq("id", me.id);
      return jsonResponse({ account: await view(me.id, me.login) });
    }

    if (action === "site_status") {
      const id = body.site_id;
      if (typeof id !== "string" || id.length < 8 || id.length > 64) return jsonResponse({ progress: false, transferred: false });
      const [p, r, t] = await Promise.all([
        db.from("airdef_progress").select("player_id").eq("player_id", id).maybeSingle(),
        db.from("airdef_mp_results").select("match_id", { count: "exact", head: true }).eq("player_id", id),
        db.from("airdef_accounts").select("player_id").eq("from_player", id).maybeSingle(),
      ]);
      return jsonResponse({ progress: !!p.data || (r.count ?? 0) > 0, transferred: !!t.data });
    }

    return jsonResponse({ error: "Неизвестное действие" }, 400);
  } catch (e) {
    console.error("airdef-account", e);
    return jsonResponse({ error: "Внутренняя ошибка сервера" }, 500);
  }
});
