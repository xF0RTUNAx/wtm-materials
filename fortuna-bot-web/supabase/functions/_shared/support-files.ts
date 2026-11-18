// Файлы поддержки (Mark 2026-11-18): лежат в Cloudflare R2 (хранилище airdef-support) за Worker'ом tools/airdef-support-worker.
// Функции Supabase файлы не передают - только подписывают короткоживущие ссылки: PUT (загрузка из браузера), GET (скачать - тебе
// в Telegram), DEL (удалить всё игрока при удалении аккаунта). Подпись - HMAC-SHA256 общим секретом SUPPORT_FILE_KEY (он же - секрет
// Worker'а), адрес Worker'а - SUPPORT_FILES_URL. Строка подписи: op \n key \n exp \n size \n type (у get/del size и type пустые).
const enc = new TextEncoder();
export const MAX_FILE = 15 * 1024 * 1024;
export const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

function b64url(u: Uint8Array): string { return btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function sign(secret: string, s: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(s))));
}
export function filesReady(): boolean { return !!(Deno.env.get("SUPPORT_FILE_KEY") && Deno.env.get("SUPPORT_FILES_URL")); }

export async function signedUrl(op: "put" | "get" | "del", key: string, ttlSec: number, size = 0, type = ""): Promise<string> {
  const secret = Deno.env.get("SUPPORT_FILE_KEY"), base = (Deno.env.get("SUPPORT_FILES_URL") || "").replace(/\/+$/, "");
  if (!secret || !base) throw new Error("support files not configured");
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = await sign(secret, [op, key, exp, op === "put" ? size : "", op === "put" ? type : ""].join("\n"));
  const q = new URLSearchParams({ op, exp: String(exp), sig, ...(op === "put" ? { size: String(size), type } : {}) });
  return `${base}/f/${key.split("/").map(encodeURIComponent).join("/")}?${q}`;
}

// удалить все файлы игрока (удаление аккаунта): ошибка не мешает удалению аккаунта, R2 всё равно чистит файлы через 60 дней
export async function dropPlayerFiles(playerId: string): Promise<void> {
  if (!filesReady()) return;
  try { const r = await fetch(await signedUrl("del", `p/${playerId}/`, 300), { method: "DELETE" }); if (!r.ok) console.error("support files del", r.status); }
  catch (e) { console.error("support files del", e); }
}
