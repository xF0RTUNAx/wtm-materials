// app.js — рендер: форма входа/регистрации либо дашборд фарм-команд.
const root = document.getElementById("root");

function fmtNum(n) {
  return Number(n ?? 0).toLocaleString("ru-RU");
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

function renderAuth(mode = "login") {
  root.innerHTML = `
    <div class="auth-card">
      <div class="tabs">
        <button class="tab ${mode === "login" ? "active" : ""}" data-mode="login">Вход</button>
        <button class="tab ${mode === "register" ? "active" : ""}" data-mode="register">Регистрация</button>
      </div>
      <form id="auth-form" class="auth-form">
        <input name="login" placeholder="Логин" autocomplete="username" required minlength="3" maxlength="32" />
        <input name="password" type="password" placeholder="Пароль" autocomplete="${mode === "login" ? "current-password" : "new-password"}" required minlength="6" />
        <button type="submit" class="btn-primary">${mode === "login" ? "Войти" : "Создать аккаунт"}</button>
        <div id="auth-error" class="error-text"></div>
      </form>
    </div>
  `;
  root.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => renderAuth(btn.dataset.mode));
  });
  document.getElementById("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const errEl = document.getElementById("auth-error");
    errEl.textContent = "";
    try {
      await submitAuth(mode, fd.get("login").trim(), fd.get("password"));
      renderDashboard();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

let currentState = null;

async function renderDashboard(flash) {
  const player = getCurrentPlayer();
  if (!player) return renderAuth();

  root.innerHTML = `<div class="loading">Загрузка...</div>`;
  try {
    currentState = await getPlayerState(player.id);
  } catch (err) {
    root.innerHTML = `<div class="error-text">${err.message}</div>`;
    return;
  }

  const e = currentState.economy;
  root.innerHTML = `
    <div class="topbar">
      <div class="brand">👤 ${player.login}</div>
      <button id="logout-btn" class="btn-ghost">Выйти</button>
    </div>

    <div class="stats-grid">
      <div class="stat"><div class="stat-label">Монеты</div><div class="stat-value">🪙 ${fmtNum(e.loot_points)}</div></div>
      <div class="stat"><div class="stat-label">Ключи</div><div class="stat-value">🔑 ${fmtNum(e.keys_current)}</div></div>
      <div class="stat"><div class="stat-label">Детали</div><div class="stat-value">🔩 ${fmtNum(e.details)}</div></div>
      <div class="stat"><div class="stat-label">Ту-4</div><div class="stat-value">✈️ ${fmtNum(e.tu4_points)}</div></div>
      <div class="stat"><div class="stat-label">Фаербол</div><div class="stat-value">🔥 ${fmtNum(e.fireball_kills)}</div></div>
      <div class="stat"><div class="stat-label">Радиофугас</div><div class="stat-value">💥 ${fmtNum(e.radiofugas_kills)}</div></div>
    </div>

    <div class="actions-grid">
      <button class="action-card" data-action="loot">
        <div class="action-title">Собрать лут</div>
        <div class="action-sub">/gimmetheloot</div>
      </button>
      <button class="action-card" data-action="fireball">
        <div class="action-title">Фаербол</div>
        <div class="action-sub">/fireball</div>
      </button>
      <button class="action-card" data-action="radiofugas">
        <div class="action-title">Радиофугас</div>
        <div class="action-sub">/radiofugas</div>
      </button>
      <button class="action-card" data-action="meladze">
        <div class="action-title">Меладзе</div>
        <div class="action-sub">/meladze</div>
      </button>
    </div>

    <div id="action-result" class="result-box" hidden></div>

    <details class="migrate-box">
      <summary>Перенести прогресс из Telegram</summary>
      <form id="migrate-form">
        <input name="code" placeholder="XXXX-XXXX" maxlength="9" required />
        <button type="submit" class="btn-secondary">Перенести</button>
      </form>
      <div id="migrate-result" class="result-box" hidden></div>
    </details>
  `;

  if (flash) {
    const box = document.getElementById("action-result");
    box.hidden = false;
    box.className = `result-box result-${flash.ok ? "ok" : "err"}`;
    box.textContent = flash.text;
  }

  document.getElementById("logout-btn").addEventListener("click", logout);
  root.querySelectorAll(".action-card").forEach((btn) => {
    btn.addEventListener("click", () => runAction(btn.dataset.action));
  });
  document.getElementById("migrate-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const code = new FormData(ev.target).get("code").trim().toUpperCase();
    const box = document.getElementById("migrate-result");
    box.hidden = false;
    try {
      const res = await claimMigrationCode(player.id, code);
      const text = `Перенесено: ${fmtNum(res.transferred.loot_points)} монет, ${fmtNum(res.transferred.keys_current)} ключей, ${fmtNum(res.transferred.details)} деталей, ${res.transferred.items_count} предметов.`;
      renderDashboard({ ok: true, text });
    } catch (err) {
      box.className = "result-box result-err";
      box.textContent = err.message;
    }
  });
}

const ACTION_FNS = {
  loot: farmLoot,
  fireball: farmFireball,
  radiofugas: farmRadiofugas,
  meladze: farmMeladze,
};

async function runAction(action) {
  const player = getCurrentPlayer();
  const box = document.getElementById("action-result");
  box.hidden = false;
  box.className = "result-box";
  box.textContent = "...";
  try {
    const res = await ACTION_FNS[action](player.id);
    renderDashboard({ ok: true, text: describeResult(action, res) });
  } catch (err) {
    box.className = "result-box result-err";
    box.textContent = err.seconds_left
      ? `${err.message} — осталось ${fmtDuration(err.seconds_left)}`
      : err.message;
  }
}

function describeResult(action, res) {
  if (action === "loot") return `+${fmtNum(res.loot_gained)} монет${res.bonus_keys ? `, +${res.bonus_keys} ключ` : ""}`;
  if (action === "fireball") return `+${res.kills_gained} фрагов фаербола${res.bonus_keys ? `, +${res.bonus_keys} ключа, +${res.bonus_details} деталь` : ""}`;
  if (action === "radiofugas") return `+${res.kills_gained} фрагов радиофугаса${res.bonus_keys ? `, +${res.bonus_keys} ключа, +${res.bonus_details} деталь` : ""}`;
  if (action === "meladze") return `+${fmtNum(res.coins_gained)} монет${res.bonus_keys ? `, +${res.bonus_keys} ключ` : ""}${res.bonus_details ? `, +${res.bonus_details} деталь` : ""}`;
  return "Готово";
}

(getCurrentPlayer() ? renderDashboard() : renderAuth());
