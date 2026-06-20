// ============================================================
//  auth.js — вход и регистрация по логину/паролю.
//  Пароль проверяется ТОЛЬКО на сервере (Edge Function auth-password).
//  В хранилище держим лишь id и логин игрока — пароль НЕ сохраняем.
//  «Запомнить меня»: localStorage (переживает закрытие браузера),
//  иначе sessionStorage (только до закрытия вкладки).
// ============================================================

const SESSION_KEY = "fortuna_player";

// Игрок может лежать в любом из двух хранилищ — проверяем оба.
function getCurrentPlayer() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function saveSession(player, remember) {
  const data = JSON.stringify(player);
  // Сначала чистим оба, чтобы не было рассинхрона.
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
  if (remember) {
    localStorage.setItem(SESSION_KEY, data);   // запомнить надолго
  } else {
    sessionStorage.setItem(SESSION_KEY, data); // до закрытия вкладки
  }
}

function logout() {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
  location.reload();
}

// action: "register" | "login"; remember: boolean
async function submitAuth(action, login, password, remember) {
  const anonKey = String(CONFIG.SUPABASE_ANON_KEY).replace(/[^\x21-\x7E]/g, "");
  const res = await fetch(CONFIG.AUTH_PASSWORD_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + anonKey,
      apikey: anonKey,
    },
    body: JSON.stringify({ action, login, password }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error || "Не удалось войти");
  }
  saveSession({
    id: data.player.id,
    login: data.player.login,
    full_name: data.player.login,
  }, remember);
  if (typeof renderApp === "function") renderApp();
}
