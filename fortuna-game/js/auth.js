// ============================================================
//  auth.js — вход через Telegram и сессия игрока
//  Поток: игрок жмёт кнопку Telegram → Telegram отдаёт данные
//  с подписью → отправляем их в Edge Function (она проверяет
//  подпись токеном бота и создаёт игрока при первом входе) →
//  сохраняем данные игрока локально для текущей сессии.
// ============================================================

// Ключ, под которым храним игрока в браузере на время сессии
const SESSION_KEY = "fortuna_player";

// --- Получить текущего игрока из сессии (или null) ---
function getCurrentPlayer() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

// --- Сохранить игрока в сессию ---
function saveSession(player) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(player));
}

// --- Выйти ---
function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

// --- Эта функция вызывается Telegram-виджетом после успешного входа ---
// Telegram сам зовёт window.onTelegramAuth(user) с данными игрока.
async function onTelegramAuth(tgUser) {
  const statusEl = document.getElementById("auth-status");
  if (statusEl) statusEl.textContent = "Проверяем вход…";

  try {
    // Отправляем данные Telegram в Edge Function на проверку подписи.
    const res = await fetch(CONFIG.AUTH_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // anon-ключ нужен Supabase как «ключ проекта» (публичный):
        Authorization: "Bearer " + CONFIG.SUPABASE_ANON_KEY,
        apikey: CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(tgUser),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || "Вход не удался");
    }

    // Вход подтверждён сервером. Сохраняем игрока в сессию.
    const player = {
      telegram_id: tgUser.id,
      username: tgUser.username || null,
      full_name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" "),
      avatar_url: tgUser.photo_url || null,
    };
    saveSession(player);

    // Перерисовываем экран — показываем профиль.
    if (typeof renderApp === "function") renderApp();
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = "Не получилось войти: " + err.message;
    }
    console.error("Telegram auth error:", err);
  }
}

// Telegram-виджет ищет функцию в глобальной области — пробрасываем.
window.onTelegramAuth = onTelegramAuth;
