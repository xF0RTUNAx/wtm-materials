// auth.js — вход/регистрация, сессия только в localStorage (как fortuna-game/js/auth.js).
const SESSION_KEY = "fortuna_web_player";

function getCurrentPlayer() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveSession(player) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(player));
}

function logout() {
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

async function submitAuth(action, login, password) {
  const data = await callEdgeFunction(CONFIG.AUTH_URL, { action, login, password });
  saveSession(data.player);
  return data.player;
}
