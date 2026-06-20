// auth-password — регистрация и вход по логину/паролю.
// Пароль НИКОГДА не хранится открыто: храним только соль + хеш (PBKDF2).
// Фронтенд пароль не проверяет — вся проверка здесь, на сервере.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Хеширование пароля (PBKDF2, соль на каждого игрока) ---
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return bufToHex(bits);
}

// формат хранения: pbkdf2$<saltHex>$<hashHex>
async function makeStored(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bufToHex(salt.buffer);
  const hash = await hashPassword(password, saltHex);
  return `pbkdf2$${saltHex}$${hash}`;
}

async function verifyStored(password: string, stored: string): Promise<boolean> {
  const parts = (stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
  const calc = await hashPassword(password, parts[1]);
  // сравнение постоянного времени
  if (calc.length !== parts[2].length) return false;
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ parts[2].charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json();
    const action = body.action;                 // "register" | "login"
    const login = String(body.login || "").trim();
    const password = String(body.password || "");

    // --- базовая валидация ---
    if (!login || !password) {
      return json({ error: "Введите логин и пароль" }, 400);
    }
    if (login.length < 3 || login.length > 20) {
      return json({ error: "Логин: от 3 до 20 символов" }, 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(login)) {
      return json({ error: "Логин: только латиница, цифры и _" }, 400);
    }
    if (password.length < 6) {
      return json({ error: "Пароль: минимум 6 символов" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "register") {
      // логин занят?
      const { data: exists } = await supabase
        .from("players").select("id").ilike("login", login).maybeSingle();
      if (exists) return json({ error: "Такой логин уже занят" }, 409);

      const stored = await makeStored(password);
      const { data: np, error: pErr } = await supabase
        .from("players")
        .insert({ login, password_hash: stored, full_name: login })
        .select("id, login").single();
      if (pErr) throw pErr;

      await supabase.from("bases").insert({ player_id: np.id });
      return json({ ok: true, player: { id: np.id, login: np.login } });
    }

    if (action === "login") {
      const { data: pl } = await supabase
        .from("players").select("id, login, password_hash").ilike("login", login).maybeSingle();
      if (!pl || !pl.password_hash) return json({ error: "Неверный логин или пароль" }, 401);

      const ok = await verifyStored(password, pl.password_hash);
      if (!ok) return json({ error: "Неверный логин или пароль" }, 401);

      await supabase.from("players").update({ last_online: new Date().toISOString() }).eq("id", pl.id);
      return json({ ok: true, player: { id: pl.id, login: pl.login } });
    }

    return json({ error: "Неизвестное действие" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
