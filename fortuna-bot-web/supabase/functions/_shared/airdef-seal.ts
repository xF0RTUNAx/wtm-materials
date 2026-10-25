// Запечатанный список из итога боя «Воздушного превосходства» (поле ope): id соперников-людей. Печатает игровой сервер
// (game-server/server.js → seal): AES-GCM, ключ = SHA-256("airdef-op:" + MP_SECRET), значение = base64url(iv[12] | шифртекст).
// Клиент итог читает, но id чужих аккаунтов в нём не видит. Испорченное, пустое или чужое значение — как будто соперников-людей нет.
const enc = new TextEncoder();
const b64uDecode = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

export async function unseal(value: unknown, secret: string): Promise<string[]> {
  try {
    if (typeof value !== "string" || !value || value.length > 4096 || !secret) return [];
    const raw = b64uDecode(value);
    if (raw.length <= 12 + 16) return [];
    const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode("airdef-op:" + secret)), { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
    const arr = JSON.parse(new TextDecoder().decode(plain));
    return Array.isArray(arr) ? arr.filter((x: unknown): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
