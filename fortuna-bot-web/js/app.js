// app.js — рендер: форма входа/регистрации либо дашборд с вкладками (Фарм/Магазин/Контейнеры).
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

// ── Живые таймеры — любой элемент с data-until="<ms-timestamp>" тикает сам,
// без перезагрузки и повторных кликов (обновляется раз в секунду глобальным таймером). ──
function liveCountdown(seconds, sizePx = 13) {
  const until = Date.now() + Math.max(0, seconds) * 1000;
  return `<span class="live-cd" data-until="${until}">${icon("stopwatch", sizePx)}<span class="cd-text">${fmtDuration(seconds)}</span></span>`;
}

setInterval(() => {
  document.querySelectorAll(".live-cd").forEach((el) => {
    const left = Math.round((Number(el.dataset.until) - Date.now()) / 1000);
    const textEl = el.querySelector(".cd-text");
    if (!textEl) return;
    textEl.textContent = left > 0 ? fmtDuration(left) : "готово";
  });
}, 1000);

// В свободном тексте (результаты действий) PNG-иконки (img/token.png, img/parts.png)
// и inline-SVG по-разному считают vertical-align относительно baseline строки — в упор
// смешанные с текстом они "улетают" друг от друга по вертикали. Оборачиваем каждую пару
// иконка+значение в inline-flex, чтобы выравнивание не зависело от базовой линии текста.
function iconVal(name, sizePx, valueHTML) {
  return `<span class="icon-val">${icon(name, sizePx)}<span>${valueHTML}</span></span>`;
}

function renderAuth(mode = "login") {
  document.getElementById("hero-title").textContent = "Добро пожаловать в мини-игры сообщества xFORTUNAx";
  root.innerHTML = `
    <div class="auth-promo">
      <img src="media/oplot.jpg" alt="" />
      <div class="auth-promo-text">Вступай или продолжай соревнование между участниками чата сообщества с новыми механиками!</div>
    </div>
    <div class="auth-card">
      <div class="tabs">
        <button class="tab ${mode === "login" ? "active" : ""}" data-mode="login">Вход</button>
        <button class="tab ${mode === "register" ? "active" : ""}" data-mode="register">Регистрация</button>
      </div>
      <form id="auth-form" class="auth-form">
        <input name="login" placeholder="Никнейм" autocomplete="username" required minlength="3" maxlength="32" />
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

const NAV_TABS = [
  { id: "farm", icon: "minerals", label: "Фарм" },
  { id: "shop", icon: "banknote", label: "Магазин" },
  { id: "containers", icon: "openChest", label: "Кейсы" },
  { id: "equipment", icon: "anvilImpact", label: "Оборудование" },
  { id: "raid", icon: "crossedSwords", label: "Рейд" },
  { id: "minigame", icon: "jigsawPiece", label: "Игра" },
  { id: "feed", icon: "wireframeGlobe", label: "Онлайн" },
];

let currentState = null;
let currentTab = "farm";
let catalog = null; // {itemsBySlug, equipmentBySlug, shopItems[], legendaryItems[], equipmentItems[]}

async function loadCatalog() {
  if (catalog) return catalog;
  const [items, equipment] = await Promise.all([
    fetchTable("shop_items", "select=*&order=price.asc"),
    fetchTable("equipment_items", "select=*&order=price_details.asc"),
  ]);
  catalog = {
    itemsBySlug: Object.fromEntries(items.map((i) => [i.slug, i])),
    equipmentBySlug: Object.fromEntries(equipment.map((i) => [i.slug, i])),
    shopItems: items.filter((i) => i.category === "shop"),
    legendaryItems: items.filter((i) => i.category === "legendary"),
    equipmentItems: equipment,
  };
  return catalog;
}

function itemName(slug) {
  return catalog?.itemsBySlug[slug]?.name ?? slug;
}

async function renderDashboard(flash) {
  const player = getCurrentPlayer();
  if (!player) return renderAuth();

  root.innerHTML = `<div class="loading">Загрузка...</div>`;
  try {
    [currentState] = await Promise.all([getPlayerState(player.id), loadCatalog()]);
  } catch (err) {
    root.innerHTML = `<div class="error-text">${err.message}</div>`;
    return;
  }

  document.getElementById("hero-title").textContent = `Привет, ${player.login}!`;

  const e = currentState.economy;
  root.innerHTML = `
    <div class="topbar">
      <div class="topbar-group">
        <button id="info-btn" class="icon-btn" aria-label="Краткое руководство">${icon("info", 18)}</button>
        <a href="https://t.me/xfortunaxhelp" target="_blank" rel="noopener" class="icon-btn" aria-label="Техподдержка">${icon("chatBubble", 18)}</a>
      </div>
      <button id="my-profile-btn" class="btn-ghost">Мой профиль</button>
      <button id="logout-btn" class="btn-ghost">Выйти</button>
    </div>

    <div class="stats-grid">
      <div class="stat"><div class="stat-label">Монеты</div><div class="stat-value">${icon("coin")} ${fmtNum(e.loot_points)}</div></div>
      <div class="stat"><div class="stat-label">Ключи</div><div class="stat-value">${icon("carKey")} ${fmtNum(e.keys_current)}</div></div>
      <div class="stat"><div class="stat-label">Детали</div><div class="stat-value">${icon("detail")} ${fmtNum(e.details)}</div></div>
      <div class="stat"><div class="stat-label">Ту-4</div><div class="stat-value">${icon("commercialAirplane")} ${fmtNum(e.tu4_points)}</div></div>
      <div class="stat"><div class="stat-label">Фаербол</div><div class="stat-value">${icon("jetFighter")} ${fmtNum(e.fireball_kills)}</div></div>
      <div class="stat"><div class="stat-label">Радиофугас</div><div class="stat-value">${icon("fragmentedMeteor")} ${fmtNum(e.radiofugas_kills)}</div></div>
    </div>

    <div id="tab-content"></div>

    <details class="migrate-box">
      <summary>${icon("share", 15)} Перенести прогресс из Telegram</summary>
      <form id="migrate-form">
        <input name="code" placeholder="XXXX-XXXX" maxlength="9" required />
        <button type="submit" class="btn-secondary">Перенести</button>
      </form>
      <div id="migrate-result" class="result-box" hidden></div>
    </details>

    <nav class="game-nav">
      ${NAV_TABS.map(
        (t) => `<button class="nav-tab ${currentTab === t.id ? "active" : ""}" data-tab="${t.id}">${icon(t.icon, 19)}<div class="nav-label">${t.label}</div></button>`,
      ).join("")}
    </nav>
  `;

  root.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  renderTabContent(flash);

  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("my-profile-btn").addEventListener("click", () => openPlayerProfile(player.login));
  document.getElementById("info-btn").addEventListener("click", openInfoModal);
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

function renderTabContent(flash) {
  const mount = document.getElementById("tab-content");
  if (currentTab === "farm") renderFarmTab(mount, flash);
  else if (currentTab === "shop") renderShopTab(mount, flash);
  else if (currentTab === "containers") renderContainersTab(mount, flash);
  else if (currentTab === "equipment") renderEquipmentTab(mount, flash);
  else if (currentTab === "raid") renderRaidTab(mount, flash);
  else if (currentTab === "minigame") renderMinigameTab(mount, flash);
  else if (currentTab === "feed") renderFeedTab(mount);
}

// Переключение вкладки нижней навигации — только локальный рендер, без повторного
// getPlayerState: баланс/предметы не меняются от простого клика по вкладке, а полный
// renderDashboard() на каждый клик означал лишний сетевой запрос и вспышку "Загрузка..."
// на ровном месте. Экономика (getPlayerState) перезапрашивается только после действий,
// которые её реально меняют — там renderDashboard() вызывается явно.
function switchTab(tabId) {
  currentTab = tabId;
  root.querySelectorAll(".nav-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  renderTabContent();
}

// ── Мини-игра ──
const SYMBOL_EMOJI = {
  skull: "💀", coin1: "🪙", coin2: "💰", coin3: "💵", coin4: "💎", coin5: "🏆", seven: "7️⃣",
  key: "🔑", fireball: "🔥", radiofugas: "💥", tu4: "✈️", clover: "🍀", joker: "🃏",
};
const SYMBOL_NAME = {
  skull: "Череп", coin1: "Монетка", coin2: "Мешок монет", coin3: "Пачка денег",
  coin4: "Бриллиант", coin5: "Кубок", seven: "Семёрка",
  key: "Ключ", fireball: "Фаербол", radiofugas: "Радиофугас", tu4: "Ту-4",
  clover: "Клевер", joker: "Джокер",
};
const SYMBOL_VALUE = {
  skull: "ничего", coin1: "400 монет", coin2: "900 монет", coin3: "1 500 монет",
  coin4: "2 600 монет", coin5: "4 400 монет", seven: "7 777 монет (3+ — джекпот)",
  key: "+1 ключ за копию", fireball: "10–20 фаербола за копию", radiofugas: "3–8 радиофугаса за копию",
  tu4: "150–350 Ту-4 за копию", clover: "×1.5 к монетам спина за копию",
  joker: "превращается в самый ценный из выпавших символов",
};
const SYMBOL_WEIGHT = {
  skull: 20, coin1: 14, coin2: 12, coin3: 10, coin4: 8, coin5: 5, seven: 2,
  key: 6, fireball: 6, radiofugas: 6, tu4: 6, clover: 4, joker: 1,
};
const MINIGAME_COSTS = { 1: 7777, 2: 17777, 3: 27777 };
const JACKPOT_777_DISPLAY = 77777;
const ANTI_JACKPOT_DISPLAY = 66666;

function secondsUntilUtcReset() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return Math.max(0, Math.round((next - now.getTime()) / 1000));
}

function renderMinigameTab(mount, flash) {
  const today = new Date().toISOString().slice(0, 10);
  const e = currentState.economy;
  const attemptsUsed = e.spin_day === today ? e.spin_count : 0;
  const nextAttempt = attemptsUsed + 1;
  const hasDiscount = currentState.items.includes("fortuna_set");
  const canSpin = nextAttempt <= 3;
  const cost = canSpin ? (hasDiscount ? Math.floor(MINIGAME_COSTS[nextAttempt] * 0.9) : MINIGAME_COSTS[nextAttempt]) : 0;

  mount.innerHTML = `
    <div id="minigame-result" class="result-box" hidden></div>
    <div class="container-card">
      <div class="container-card-name">${icon("puzzle")} Попытка ${Math.min(nextAttempt, 3)} из 3</div>
      <div class="container-card-price">${
        canSpin
          ? `Цена: ${iconVal("coin", 14, fmtNum(cost))}`
          : `Попытки закончились — обновление через ${liveCountdown(secondsUntilUtcReset())}`
      }</div>
      <div class="container-buy-row">
        ${canSpin ? `<button id="spin-btn" class="btn-secondary btn-sm">Крутить</button>` : ""}
        <button id="paytable-btn" class="btn-ghost btn-sm">Таблица наград</button>
      </div>
    </div>
  `;
  if (flash) showResult("minigame-result", flash.ok, flash.text);

  document.getElementById("paytable-btn").addEventListener("click", openPaytableModal);

  const btn = document.getElementById("spin-btn");
  if (btn) btn.addEventListener("click", async () => {
    const player = getCurrentPlayer();
    showResult("minigame-result", null, "Крутим...");
    try {
      const res = await minigameSpin(player.id);
      await renderDashboard();
      showMediaResult({ title: "Мини-игра Фортуны", mediaSrc: "media/fortuna_minigame.mp4", resultHTML: describeSpinResult(res) });
    } catch (err) {
      showResult("minigame-result", false, err.message);
    }
  });
}

function describeComboEntry(e) {
  const emoji = SYMBOL_EMOJI[e.key];
  const name = SYMBOL_NAME[e.key];
  const head = `${emoji} ${name} ×${e.count}`;
  if (e.key === "seven" && e.count >= 3) return `${head} → отправляется в джекпот ниже`;
  if (e.key === "skull" && e.count === 5) return `${head} → отправляется в анти-джекпот ниже`;
  if (e.coins) return `${head}: ${fmtNum(e.coins / e.count / e.comboMultiplier)} × ${e.count} × комбо ×${e.comboMultiplier} = +${fmtNum(e.coins)} монет`;
  if (e.keys) return `${head} → ${iconVal("carKey", 13, `+${e.keys}`)}`;
  if (e.resourceAmount || e.detailsFromThis) {
    const resIcon = { fireball_kills: "jetFighter", radiofugas_kills: "fragmentedMeteor", tu4_points: "commercialAirplane" }[e.resourceField];
    const bits = [];
    if (e.resourceAmount) bits.push(iconVal(resIcon, 13, `+${fmtNum(e.resourceAmount)}`));
    if (e.detailsFromThis) bits.push(iconVal("detail", 13, `+${e.detailsFromThis} (конвертация из части копий)`));
    return `${head} → ${bits.join(", ")}`;
  }
  if (e.key === "clover" && e.comboMultiplier) return `${head} → монеты спина ×${Number(e.comboMultiplier.toFixed(2))}`;
  return `${head} → ничего`;
}

function describeSpinResult(res) {
  const symbols = res.rolled.map((k) => SYMBOL_EMOJI[k]).join(" ");
  const lines = [symbols, ""];

  (res.joker_replacements || []).forEach((j) => {
    lines.push(`🃏 Джокер → стал ${SYMBOL_EMOJI[j.to]} ${SYMBOL_NAME[j.to]} (самый ценный из остальных выпавших)`);
  });

  res.breakdown.forEach((e) => lines.push(describeComboEntry(e)));

  if (res.jackpot) lines.push(`🎰 Джекпот (7️⃣×3+) → +${fmtNum(JACKPOT_777_DISPLAY)} монет`);
  if (res.anti_jackpot) lines.push(`💀 Анти-джекпот (💀×5) → +${fmtNum(ANTI_JACKPOT_DISPLAY)} монет`);
  if (res.attempt_multiplier > 1) lines.push(`Попытка №${res.attempt_number} → монеты спина ×${res.attempt_multiplier}`);

  lines.push("");
  const parts = [];
  if (res.coins_gained) parts.push(iconVal("coin", 14, `${res.coins_gained > 0 ? "+" : ""}${fmtNum(res.coins_gained)}`));
  if (res.keys_gained) parts.push(iconVal("carKey", 14, `+${res.keys_gained}`));
  if (res.details_gained) parts.push(iconVal("detail", 14, `+${res.details_gained}`));
  if (res.resources_gained.fireball_kills) parts.push(iconVal("jetFighter", 14, `+${res.resources_gained.fireball_kills}`));
  if (res.resources_gained.radiofugas_kills) parts.push(iconVal("fragmentedMeteor", 14, `+${res.resources_gained.radiofugas_kills}`));
  if (res.resources_gained.tu4_points) parts.push(iconVal("commercialAirplane", 14, `+${res.resources_gained.tu4_points}`));
  lines.push(`Итого: ${parts.join(", ") || "ничего"}`);

  if (res.item_drop === "new") lines.push(iconVal("award", 14, "Выпал Набор Фортуны!"));
  if (res.item_drop === "duplicate") lines.push(iconVal("award", 14, `Дубликат Набора Фортуны — +${fmtNum(ITEM_DUP_COMP_DISPLAY)} монет`));

  let text = lines.join("\n");
  if (res.big_win) text = "🎉 БОЛЬШОЙ ВЫИГРЫШ!\n" + text;
  return text;
}
const ITEM_DUP_COMP_DISPLAY = 50000;

// ── Рейд ──
const RAID_TYPE_LABEL = { normal: "Линс", hard: "Аполис", "13": "Тивашин13", ca: "ЦА" };

async function renderRaidTab(mount, flash) {
  mount.innerHTML = `<div class="loading">Загрузка...</div>`;
  let status;
  try {
    status = await getRaidStatus();
  } catch (err) {
    mount.innerHTML = `<div class="error-text">${err.message}</div>`;
    return;
  }

  const isAdmin = currentState.is_admin;
  const raid = status.raid;
  const active = raid && raid.status === "active";

  let adminHtml = "";
  if (isAdmin) {
    if (active) {
      adminHtml = `<button id="raid-stop-btn" class="btn-ghost" style="margin-bottom:12px">Остановить рейд (админ)</button>`;
    } else {
      adminHtml = `
        <div class="section-label">Запуск рейда (админ)</div>
        <div class="container-buy-row" style="margin-bottom:14px">
          ${Object.entries(RAID_TYPE_LABEL).map(([t, label]) => `<button class="btn-secondary btn-sm" data-start="${t}">${label}</button>`).join("")}
        </div>`;
    }
  }

  let bodyHtml;
  if (!active) {
    bodyHtml = `<div class="loading">${icon("fortress", 20)} Сейчас нет активного рейда${raid ? ` (последний — ${RAID_TYPE_LABEL[raid.rtype]}, ${raid.status})` : ""}</div>`;
  } else {
    const pct = Math.max(0, Math.min(100, Math.round((raid.hp / raid.max_hp) * 100)));
    bodyHtml = `
      <div class="raid-hero">
        <div class="raid-hero-title">${icon("fortress", 20)} ${RAID_TYPE_LABEL[raid.rtype]}</div>
        <div class="raid-hero-hp">HP: ${fmtNum(raid.hp)} / ${fmtNum(raid.max_hp)} (${pct}%)</div>
        <div class="raid-hero-track"><div class="raid-hero-fill" style="width:${pct}%"></div></div>
        <div class="raid-hero-row">
          <button id="raid-buy-btn" class="btn-secondary btn-sm">${icon("coin", 14)} Оружие (5000)</button>
          <button id="raid-attack-btn" class="btn-secondary btn-sm">${icon("sword", 14)} Атаковать</button>
        </div>
      </div>
      <div class="section-label">Топ урона</div>
      <div class="shop-list">
        ${status.top.length
          ? status.top.map((r, i) => `<div class="shop-row"><div class="shop-row-main">${i + 1}. ${r.login}</div><div class="shop-row-price">${fmtNum(r.damage)}</div></div>`).join("")
          : `<div class="shop-row">Пока никто не атаковал</div>`}
      </div>`;
  }

  mount.innerHTML = `<div id="raid-result" class="result-box" hidden></div>${adminHtml}${bodyHtml}`;
  if (flash) showResult("raid-result", flash.ok, flash.text);

  const buyBtn = document.getElementById("raid-buy-btn");
  if (buyBtn) buyBtn.addEventListener("click", async () => {
    const player = getCurrentPlayer();
    try {
      const res = await raidBuyWeapon(player.id);
      renderDashboard({ ok: true, text: `Оружие куплено за ${fmtNum(res.price_paid)} монет` });
    } catch (err) {
      showResult("raid-result", false, err.message);
    }
  });

  const attackBtn = document.getElementById("raid-attack-btn");
  if (attackBtn) attackBtn.addEventListener("click", async () => {
    const player = getCurrentPlayer();
    try {
      const res = await raidAttack(player.id);
      let text = `${icon("sword", 14)} Урон: ${fmtNum(res.damage_dealt)} (осталось ${fmtNum(res.new_hp)} HP)`;
      if (res.finished) text += ` — ${icon("award", 14)} БОСС ПОВЕРЖЕН!`;
      renderDashboard({ ok: true, text });
    } catch (err) {
      showResult(
        "raid-result",
        false,
        err.seconds_left ? `${err.message} — осталось ${liveCountdown(err.seconds_left)}` : err.message,
      );
    }
  });

  const stopBtn = document.getElementById("raid-stop-btn");
  if (stopBtn) stopBtn.addEventListener("click", async () => {
    const player = getCurrentPlayer();
    try {
      await raidStop(player.id);
      renderDashboard({ ok: true, text: "Рейд остановлен" });
    } catch (err) {
      showResult("raid-result", false, err.message);
    }
  });

  mount.querySelectorAll("[data-start]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const player = getCurrentPlayer();
      try {
        await raidStart(player.id, btn.dataset.start);
        renderDashboard({ ok: true, text: "Рейд запущен" });
      } catch (err) {
        showResult("raid-result", false, err.message);
      }
    });
  });
}

// ── Оборудование ──
function renderEquipmentTab(mount, flash) {
  const owned = new Set(currentState.equipment);
  const active = currentState.economy.active_equipment;

  const rows = catalog.equipmentItems
    .map((eq) => {
      const isOwned = owned.has(eq.slug);
      const isActive = active === eq.slug;
      let sideHtml;
      if (isActive) sideHtml = `<span class="badge-owned">активно</span>`;
      else if (isOwned) sideHtml = `<button class="btn-secondary btn-sm" data-equip="${eq.slug}">Активировать</button>`;
      else sideHtml = `<button class="btn-secondary btn-sm" data-craft="${eq.slug}">Скрафтить</button>`;
      return `
        <div class="shop-row">
          <div class="shop-row-main">
            <div class="shop-row-name">${eq.name}</div>
            <div class="shop-row-desc">${eq.description}${isOwned ? "" : ` · ${icon("detail", 13)} ${fmtNum(eq.price_details)}`}</div>
          </div>
          <div class="shop-row-side">${sideHtml}</div>
        </div>`;
    })
    .join("");

  mount.innerHTML = `
    <div id="equip-result" class="result-box" hidden></div>
    ${active ? "" : `<div class="section-label">Ничего не активно</div>`}
    <div class="shop-list">${rows}</div>
    ${active ? `<button id="unequip-btn" class="btn-ghost" style="margin-top:12px">Снять активное</button>` : ""}
  `;
  if (flash) showResult("equip-result", flash.ok, flash.text);

  mount.querySelectorAll("[data-craft]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const player = getCurrentPlayer();
      try {
        const res = await equipmentCraft(player.id, btn.dataset.craft);
        renderDashboard({ ok: true, text: `Скрафчено: ${res.crafted} за ${fmtNum(res.details_spent)} деталей` });
      } catch (err) {
        showResult("equip-result", false, err.message);
      }
    });
  });
  mount.querySelectorAll("[data-equip]").forEach((btn) => {
    btn.addEventListener("click", () => swapEquipment(btn.dataset.equip));
  });
  const unequipBtn = document.getElementById("unequip-btn");
  if (unequipBtn) unequipBtn.addEventListener("click", () => swapEquipment(null));
}

async function swapEquipment(slug) {
  const player = getCurrentPlayer();
  try {
    await equipmentEquip(player.id, slug);
    renderDashboard({ ok: true, text: slug ? "Активировано" : "Снято" });
  } catch (err) {
    showResult(
      "equip-result",
      false,
      err.seconds_left ? `${err.message} — осталось ${liveCountdown(err.seconds_left)}` : err.message,
    );
  }
}

// ── Фарм ──
const FARM_COOLDOWN_CFG = {
  loot: { base: 8 * 3600, reduced: 7 * 3600, reducer: "voydom_case", ts: "last_loot_farm" },
  fireball: { base: 24 * 3600, reduced: 18 * 3600, reducer: "junkers_bedding", ts: "last_fireball_farm" },
  radiofugas: { base: 24 * 3600, reduced: 18 * 3600, reducer: "junkers_bedding", ts: "last_radiofugas_farm" },
  meladze: { base: 24 * 3600, reduced: 12 * 3600, reducer: "urvv_fragment", ts: "last_meladze_farm", requires: "meladze_ticket" },
};

function farmSecondsLeft(action) {
  const cfg = FARM_COOLDOWN_CFG[action];
  const items = new Set(currentState.items);
  if (cfg.requires && !items.has(cfg.requires)) return null;
  const cdSeconds = items.has(cfg.reducer) ? cfg.reduced : cfg.base;
  const lastTs = currentState.economy[cfg.ts];
  if (!lastTs) return 0;
  const left = Math.ceil(cdSeconds - (Date.now() - new Date(lastTs).getTime()) / 1000);
  return Math.max(0, left);
}

function renderFarmTab(mount, flash) {
  const actionCdHTML = (action) => {
    const left = farmSecondsLeft(action);
    return left > 0 ? `<div class="action-cd">${liveCountdown(left, 11)}</div>` : "";
  };
  mount.innerHTML = `
    <div class="actions-grid">
      <button class="action-card" data-action="loot">
        <div class="action-title">${icon("coin")} Собрать лут</div><div class="action-sub">/gimmetheloot</div>${actionCdHTML("loot")}
      </button>
      <button class="action-card" data-action="fireball">
        <div class="action-title">${icon("jetFighter")} Фаербол</div><div class="action-sub">/fireball</div>${actionCdHTML("fireball")}
      </button>
      <button class="action-card" data-action="radiofugas">
        <div class="action-title">${icon("fragmentedMeteor")} Радиофугас</div><div class="action-sub">/radiofugas</div>${actionCdHTML("radiofugas")}
      </button>
      <button class="action-card" data-action="meladze">
        <div class="action-title">${icon("award")} Меладзе</div><div class="action-sub">/meladze</div>${actionCdHTML("meladze")}
      </button>
    </div>
    <div id="action-result" class="result-box" hidden></div>
  `;
  if (flash) showResult("action-result", flash.ok, flash.text);
  mount.querySelectorAll(".action-card").forEach((btn) => {
    btn.addEventListener("click", () => runAction(btn.dataset.action));
  });
}

const ACTION_FNS = { loot: farmLoot, fireball: farmFireball, radiofugas: farmRadiofugas, meladze: farmMeladze };
const ACTION_TITLE = { loot: "Собрать лут", fireball: "Фаербол", radiofugas: "Радиофугас", meladze: "Меладзе" };
const FARM_MEDIA = { loot: "media/farm.jpg", fireball: "media/fireball.jpg", radiofugas: "media/radiofugas.jpg", meladze: "media/meladze.jpg" };

async function runAction(action) {
  const player = getCurrentPlayer();
  showResult("action-result", null, "...");
  try {
    const res = await ACTION_FNS[action](player.id);
    await renderDashboard();
    showMediaResult({ title: ACTION_TITLE[action], mediaSrc: FARM_MEDIA[action], resultHTML: describeResult(action, res) });
  } catch (err) {
    showResult(
      "action-result",
      false,
      err.seconds_left ? `${err.message} — осталось ${liveCountdown(err.seconds_left)}` : err.message,
    );
  }
}

function describeResult(action, res) {
  const c = (n) => iconVal("coin", 14, `+${fmtNum(n)}`);
  const k = (n) => iconVal("carKey", 14, `+${n}`);
  const d = (n) => iconVal("detail", 14, `+${n}`);
  if (action === "loot") return `${c(res.loot_gained)}${res.bonus_keys ? `, ${k(res.bonus_keys)}` : ""}`;
  if (action === "fireball") return `${iconVal("jetFighter", 14, `+${res.kills_gained}`)}${res.bonus_keys ? `, ${k(res.bonus_keys)}, ${d(res.bonus_details)}` : ""}`;
  if (action === "radiofugas") return `${iconVal("fragmentedMeteor", 14, `+${res.kills_gained}`)}${res.bonus_keys ? `, ${k(res.bonus_keys)}, ${d(res.bonus_details)}` : ""}`;
  if (action === "meladze") return `${c(res.coins_gained)}${res.bonus_keys ? `, ${k(res.bonus_keys)}` : ""}${res.bonus_details ? `, ${d(res.bonus_details)}` : ""}`;
  return "Готово";
}

function showResult(id, ok, html) {
  const box = document.getElementById(id);
  box.hidden = false;
  box.className = ok === null ? "result-box" : `result-box result-${ok ? "ok" : "err"}`;
  box.innerHTML = html;
}

// ── Магазин ──
function renderShopTab(mount, flash) {
  const owned = new Set(currentState.items);
  const hasDiscount = owned.has("fortuna_set");

  const rows = catalog.shopItems
    .map((item) => {
      const isOwned = owned.has(item.slug);
      const price = hasDiscount ? Math.floor(item.price * 0.9) : item.price;
      const priceLabel = price === 0 ? "бесплатно" : `${fmtNum(price)}${hasDiscount ? ` <s>${fmtNum(item.price)}</s>` : ""}`;
      return `
        <div class="shop-row">
          <div class="shop-row-main">
            <div class="shop-row-name">${item.name}</div>
            <div class="shop-row-desc">${item.description}</div>
          </div>
          <div class="shop-row-side">
            <div class="shop-row-price">${icon("coin", 13)} ${priceLabel}</div>
            ${isOwned
              ? `<span class="badge-owned">есть</span>`
              : `<button class="btn-secondary btn-sm" data-buy="${item.slug}">Купить</button>`}
          </div>
        </div>`;
    })
    .join("");

  const legendaryOwned = catalog.legendaryItems.filter((i) => owned.has(i.slug));
  const legendaryBlock = legendaryOwned.length
    ? `<div class="section-label">Легендарные предметы</div>` +
      legendaryOwned.map((i) => `<div class="shop-row"><div class="shop-row-main"><div class="shop-row-name">${i.name}</div><div class="shop-row-desc">${i.description}</div></div><span class="badge-owned">есть</span></div>`).join("")
    : "";

  mount.innerHTML = `
    <div id="shop-result" class="result-box" hidden></div>
    <div class="shop-list">${rows}</div>
    ${legendaryBlock}
  `;
  if (flash) showResult("shop-result", flash.ok, flash.text);

  mount.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const player = getCurrentPlayer();
      try {
        const res = await shopBuy(player.id, btn.dataset.buy);
        let text = `Куплено: ${res.bought} за ${icon("coin", 14)} ${fmtNum(res.price_paid)}`;
        if (res.assigned_theme) {
          text += `. 🎨 Тебе выпал дизайн профиля «${PROFILE_THEME_NAMES[res.assigned_theme] ?? res.assigned_theme}»! Посмотри в «Мой профиль».`;
        }
        renderDashboard({ ok: true, text });
      } catch (err) {
        showResult("shop-result", false, err.message);
      }
    });
  });
}

// ── Контейнеры ──
const TIER_INFO = {
  1: { name: "Обычный", price: 1 },
  2: { name: "Продвинутый", price: 3 },
  3: { name: "Эпический", price: 5 },
  4: { name: "Легендарный", price: 10 },
};
const TIER_MEDIA = {
  1: "media/regular_case.mp4",
  2: "media/advanced_case.mp4",
  3: "media/epic_case.mp4",
  4: "media/legend_case.mp4",
};

function renderContainersTab(mount, flash) {
  const cards = Object.entries(TIER_INFO)
    .map(
      ([tier, info]) => `
      <div class="container-card">
        <button class="container-info-btn" data-info-tier="${tier}" aria-label="Содержимое">${icon("magnifyingGlass")}</button>
        <div class="container-card-name">${icon("chest512")} ${info.name}</div>
        <div class="container-card-price">${icon("carKey", 13)} ${info.price} / шт</div>
        <div class="container-buy-row">
          <button class="btn-secondary btn-sm" data-tier="${tier}" data-count="1">×1</button>
          <button class="btn-secondary btn-sm" data-tier="${tier}" data-count="5">×5</button>
          <button class="btn-secondary btn-sm" data-tier="${tier}" data-count="10">×10</button>
        </div>
      </div>`,
    )
    .join("");

  mount.innerHTML = `
    <div id="container-result" class="result-box" hidden></div>
    <div class="containers-grid">${cards}</div>
  `;
  if (flash) showResult("container-result", flash.ok, flash.text);

  mount.querySelectorAll("[data-tier]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const player = getCurrentPlayer();
      const tier = Number(btn.dataset.tier);
      showResult("container-result", null, "Открываем...");
      try {
        const res = await containerOpen(player.id, tier, Number(btn.dataset.count));
        await renderDashboard();
        showMediaResult({ title: TIER_INFO[tier].name, mediaSrc: TIER_MEDIA[tier], resultHTML: describeContainerResult(res) });
      } catch (err) {
        showResult("container-result", false, err.message);
      }
    });
  });

  mount.querySelectorAll("[data-info-tier]").forEach((btn) => {
    btn.addEventListener("click", () => openContainerInfoModal(Number(btn.dataset.infoTier)));
  });
}

// ── Содержимое контейнеров (таблицы дропа, 1:1 с rollContainer на бэкенде) ──
const CONTAINER_LOOT_TABLE = {
  1: {
    rows: [
      { chance: "60%", html: iconVal("coin", 14, "100–400") },
      { chance: "25%", html: iconVal("coin", 14, "400–800") },
      { chance: "10%", html: `${iconVal("jetFighter", 14, "2–5")} или ${iconVal("fragmentedMeteor", 14, "1–3")}` },
      { chance: "5%", html: iconVal("carKey", 14, "1") },
    ],
    extra: { chance: "0.5%", html: iconVal("award", 14, "Набор с красной краской и камуфляжами") },
    detail: { chance: "12%", html: iconVal("detail", 14, "1") },
  },
  2: {
    rows: [
      { chance: "45%", html: iconVal("coin", 14, "800–1 500") },
      { chance: "30%", html: iconVal("coin", 14, "1 500–3 000") },
      { chance: "15%", html: `${iconVal("jetFighter", 14, "2–5")} или ${iconVal("fragmentedMeteor", 14, "1–3")}` },
      { chance: "9%", html: iconVal("carKey", 14, "2") },
    ],
    extra: { chance: "1%", html: iconVal("award", 14, "Набор Максима с рипером и пукеко") },
    detail: { chance: "18%", html: iconVal("detail", 14, "1–2") },
  },
  3: {
    rows: [
      { chance: "35%", html: iconVal("coin", 14, "3 000–6 000") },
      { chance: "30%", html: iconVal("coin", 14, "6 000–10 000") },
      { chance: "15%", html: iconVal("commercialAirplane", 14, "100–300 (Ту-4)") },
      { chance: "13%", html: iconVal("carKey", 14, "3") },
      { chance: "5%", html: iconVal("coin", 14, "25 000") },
    ],
    extra: { chance: "2%", html: iconVal("award", 14, "Набор Олега с Су-11 и рыбой") },
    detail: { chance: "15%", html: iconVal("detail", 14, "2–3") },
  },
  4: {
    rows: [
      { chance: "25%", html: iconVal("coin", 14, "10 000–20 000") },
      { chance: "25%", html: iconVal("coin", 14, "25 000") },
      { chance: "20%", html: `${iconVal("jetFighter", 14, "15–25")} или ${iconVal("fragmentedMeteor", 14, "15–25")}` },
      { chance: "15%", html: iconVal("carKey", 14, "5") },
      { chance: "12%", html: iconVal("coin", 14, "40 000") },
    ],
    extra: { chance: "3%", html: iconVal("award", 14, "Набор Maksym'a с леопардом 2А5 и фиолетовым бобом") },
    detail: { chance: "18%", html: iconVal("detail", 14, "3–5") },
  },
};

function lootTableRow(chance, html) {
  return `<div class="loot-table-row"><div>${html}</div><div class="loot-table-chance">${chance}</div></div>`;
}

function openContainerInfoModal(tier) {
  const t = CONTAINER_LOOT_TABLE[tier];
  document.getElementById("container-info-modal-title").textContent = `Содержимое: ${TIER_INFO[tier].name}`;
  document.getElementById("container-info-modal-body").innerHTML = `
    ${t.rows.map((r) => lootTableRow(r.chance, r.html)).join("")}
    ${lootTableRow(t.extra.chance, t.extra.html)}
    <div class="profile-empty" style="margin-top:8px">Независимо от основного ролла — ещё ${t.detail.chance} на ${t.detail.html}.</div>
  `;
  document.getElementById("container-info-modal").hidden = false;
}

function closeContainerInfoModal() {
  document.getElementById("container-info-modal").hidden = true;
}

document.getElementById("container-info-modal-close").addEventListener("click", closeContainerInfoModal);
document.getElementById("container-info-modal").addEventListener("click", (e) => {
  if (e.target.id === "container-info-modal") closeContainerInfoModal();
});

function describeContainerResult(res) {
  const parts = [];
  if (res.totals.coins) parts.push(iconVal("coin", 14, fmtNum(res.totals.coins)));
  if (res.totals.tu4) parts.push(iconVal("commercialAirplane", 14, res.totals.tu4));
  if (res.totals.fireball) parts.push(iconVal("jetFighter", 14, res.totals.fireball));
  if (res.totals.radiofugas) parts.push(iconVal("fragmentedMeteor", 14, res.totals.radiofugas));
  if (res.totals.keys) parts.push(iconVal("carKey", 14, res.totals.keys));
  if (res.totals.details) parts.push(iconVal("detail", 14, res.totals.details));
  let text = "Получено: " + (parts.join(", ") || "ничего");
  if (res.new_items.length) {
    text += `. ${iconVal("award", 14, `Новый предмет: ${res.new_items.map(itemName).join(", ")}!`)}`;
  }
  return text;
}

// ── Лента событий ──
function playerLink(rawLogin) {
  return `<span class="player-link" data-login="${rawLogin}">${rawLogin}</span>`;
}

function describeFeedItem(row) {
  const d = row.detail;
  const login = d.login ? playerLink(d.login) : "кто-то";
  switch (row.event_type) {
    case "strong_man":
      return `💪 ${login} тронул сильный мужчина — +${fmtNum(d.amount)} очков Ту-4`;
    case "weak_man":
      if (d.protected) return `🛡 Слабый мужчина заходил к ${login}, но «Нестандартная мысль Линса» спасла`;
      if (d.transferred) return `😈 У ${login} сработало «ДЗ Дэвида» — слабый мужчина ударил по другому игроку`;
      if (d.no_effect) return `😐 Слабый мужчина заглянул к ${login}, но фрагов радиофугаса не нашлось`;
      return `💥 Слабый мужчина отнял ${d.amount} фраг(а) радиофугаса у ${login}`;
    case "anime_girl":
      if (d.transferred) return `👧 У ${login} сработал «10000-й бой от Андрея» — визит аниме девочки достался другому`;
      return `👧 Аниме девочка потрогала ${login} — статы ÷${d.divisor}`;
    case "auto_key":
      return `🔑 ${login} получил ключ и 1000 монет от бота`;
    case "horseshoe":
      return `🐴 У ${login} сработала Декаль подковы — +${fmtNum(d.amount)} монет`;
    case "farm": {
      const label = { loot: "собрал лут", fireball: "отфармил фаербол", radiofugas: "отфармил радиофугас", meladze: "сходил на концерт Меладзе" }[d.action] || "фармил";
      const parts = [];
      if (d.coins) parts.push(`+${fmtNum(d.coins)} монет`);
      if (d.kills) parts.push(`+${fmtNum(d.kills)} фрагов`);
      if (d.bonus_keys) parts.push(`+${d.bonus_keys} 🔑`);
      if (d.bonus_details) parts.push(`+${d.bonus_details} деталей`);
      return `🌾 ${login} ${label}: ${parts.join(", ") || "без добычи"}`;
    }
    case "shop_buy":
      return `🛒 ${login} купил «${d.item_name}» за ${fmtNum(d.price)} монет`;
    case "equipment":
      return `🛠 ${login} скрафтил «${d.item_name}» за ${fmtNum(d.details_spent)} деталей`;
    case "raid_action":
      if (d.action === "start") return `⚔️ Начался рейд: ${RAID_TYPE_LABEL[d.rtype] ?? d.rtype}`;
      if (d.action === "buy_weapon") return `🗡 ${login} купил оружие для рейда за ${fmtNum(d.price)} монет`;
      if (d.action === "attack") return `💢 ${login} атаковал в рейде «${RAID_TYPE_LABEL[d.rtype] ?? d.rtype}» на ${fmtNum(d.damage)} урона`;
      return `${login}: действие в рейде`;
    case "raid_finish": {
      const label = RAID_TYPE_LABEL[d.rtype] ?? d.rtype;
      if (d.result === "victory") return `🏆 Рейд «${label}» завершён победой! Награды получили ${d.rewards?.length ?? 0} участников`;
      if (d.result === "stopped") return `⏹ Рейд «${label}» остановлен администратором`;
      return `⌛ Рейд «${label}» завершён без победы — время вышло`;
    }
    case "minigame": {
      const parts = [];
      if (d.coins) parts.push(`${d.coins > 0 ? "+" : ""}${fmtNum(d.coins)} монет`);
      if (d.keys) parts.push(`+${d.keys} 🔑`);
      if (d.details) parts.push(`+${d.details} деталей`);
      let text = `🎰 ${login} сыграл в мини-игру: ${parts.join(", ") || "пусто"}`;
      if (d.item_drop === "new") text += " — выпал Набор Фортуны!";
      if (d.big_win) text += " 💥 Джекпот!";
      return text;
    }
    default:
      return `${login}: ${row.event_type}`;
  }
}

async function renderFeedTab(mount) {
  mount.innerHTML = `
    <div class="container-buy-row" style="margin-bottom:12px; justify-content:space-between">
      <button id="event-timers-btn" class="btn-ghost btn-sm">${icon("hazardSign", 15)} Таймеры до ивентов</button>
      <button id="top-btn" class="btn-ghost btn-sm">${icon("laurelCrown", 15)} Топ</button>
    </div>
    <div id="feed-list-mount"><div class="loading">Загрузка...</div></div>
  `;
  document.getElementById("event-timers-btn").addEventListener("click", openEventTimersModal);
  document.getElementById("top-btn").addEventListener("click", openTopModal);

  const listMount = document.getElementById("feed-list-mount");
  try {
    const rows = await fetchTable("activity_feed", "select=*&order=created_at.desc&limit=30");
    listMount.innerHTML = rows.length
      ? `<div class="feed-list">${rows
          .map(
            (r) =>
              `<div class="feed-row"><div class="feed-text">${describeFeedItem(r)}</div><div class="feed-time">${new Date(r.created_at).toLocaleString("ru-RU")}</div></div>`,
          )
          .join("")}</div>`
      : `<div class="loading">Пока событий не было</div>`;
    listMount.querySelectorAll(".player-link").forEach((el) => {
      el.addEventListener("click", () => openPlayerProfile(el.dataset.login));
    });
  } catch (err) {
    listMount.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

// ── Таймеры до периодических чат-ивентов (pg_cron, расписание "0 */N * * *" по UTC) ──
const CHAT_EVENTS = [
  { emoji: "💪", label: "Сильный мужчина", desc: "случайному активному игроку — очки на Ту-4", periodHours: 6 },
  { emoji: "💥", label: "Слабый мужчина", desc: "отнимает 1–3 фрага радиофугаса", periodHours: 10 },
  { emoji: "👧", label: "2Д аниме девочка", desc: "обнуляет половину статов", periodHours: 20 },
  { emoji: "🔑", label: "Авто-ключ", desc: "+1 ключ и 1000 монет", periodHours: 12 },
];

function secondsUntilNextCronHour(periodHours) {
  const matchHours = [];
  for (let h = 0; h < 24; h++) if (h % periodHours === 0) matchHours.push(h);
  const now = new Date();
  const nowSecOfDay = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
  for (const h of matchHours) {
    const tickSec = h * 3600;
    if (tickSec > nowSecOfDay) return tickSec - nowSecOfDay;
  }
  return 24 * 3600 - nowSecOfDay + matchHours[0] * 3600;
}

function openEventTimersModal() {
  const body = document.getElementById("event-timers-modal-body");
  body.innerHTML = `
    ${CHAT_EVENTS.map(
      (e) => `
      <div class="profile-row">
        <div class="profile-row-label"><span>${e.emoji}</span><span>${e.label}</span></div>
        <div class="profile-row-value" style="font-weight:500">${liveCountdown(secondsUntilNextCronHour(e.periodHours))}</div>
      </div>
      <div class="profile-empty" style="margin:-4px 0 8px">${e.desc}</div>
    `,
    ).join("")}
    <div class="profile-empty">Каждый ивент случайно достаётся активному участнику сайта (заходил за последние 14 дней).</div>
  `;
  document.getElementById("event-timers-modal").hidden = false;
}

function closeEventTimersModal() {
  document.getElementById("event-timers-modal").hidden = true;
}

document.getElementById("event-timers-modal-close").addEventListener("click", closeEventTimersModal);
document.getElementById("event-timers-modal").addEventListener("click", (e) => {
  if (e.target.id === "event-timers-modal") closeEventTimersModal();
});

// ── Топ игроков (фаербол / Ту-4 / радиофугасы / монеты Фортуны) ──
const TOP_BOARDS = [
  { key: "fireball", label: "Фаербол", icon: "jetFighter" },
  { key: "tu4", label: "Очки на Ту-4", icon: "commercialAirplane" },
  { key: "radiofugas", label: "Радиофугасы", icon: "fragmentedMeteor" },
  { key: "coins", label: "Монеты Фортуны", icon: "coin" },
];

function medal(i) {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
}

function renderTopBoard(label, iconName, rows) {
  return `
    <div class="profile-section-title">${icon(iconName, 16)} ${label}</div>
    ${
      rows.length
        ? rows
            .map(
              (r, i) => `
      <div class="profile-row">
        <div class="profile-row-label"><span>${medal(i)}</span><span>${r.login}</span></div>
        <div class="profile-row-value">${r.value}</div>
      </div>`,
            )
            .join("")
        : `<div class="profile-empty">Пока никого нет</div>`
    }
  `;
}

async function openTopModal() {
  const body = document.getElementById("top-modal-body");
  body.innerHTML = `<div class="loading">Загрузка...</div>`;
  document.getElementById("top-modal").hidden = false;
  try {
    const data = await getLeaderboards();
    body.innerHTML = TOP_BOARDS.map((b) => renderTopBoard(b.label, b.icon, data[b.key] ?? [])).join("");
  } catch (err) {
    body.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

function closeTopModal() {
  document.getElementById("top-modal").hidden = true;
}

document.getElementById("top-modal-close").addEventListener("click", closeTopModal);
document.getElementById("top-modal").addEventListener("click", (e) => {
  if (e.target.id === "top-modal") closeTopModal();
});

// ── Краткое руководство (модалка по кнопке-инфо в шапке) ──
const GUIDE_ITEMS = [
  { icon: "minerals", title: "Фарм", desc: "Раз в сутки собирай лут, фаербол, радиофугас и (если открыт) Меладзе — у каждого действия свой кулдаун." },
  { icon: "banknote", title: "Магазин", desc: "Постоянные бонусы к фарму покупаются один раз за монеты и действуют навсегда." },
  { icon: "openChest", title: "Кейсы", desc: "Открывай контейнеры за ключи — шанс на монеты, фраги и редкие предметы." },
  { icon: "anvilImpact", title: "Оборудование", desc: "Крафти за детали и держи активным один предмет — усиливает конкретное действие." },
  { icon: "crossedSwords", title: "Рейд", desc: "Покупай оружие и атакуй общего босса — награда делится между всеми участниками." },
  { icon: "jigsawPiece", title: "Игра", desc: "Испытай удачу в мини-игре Фортуны — комбо символов даёт монеты, фраги или детали." },
  { icon: "wireframeGlobe", title: "Онлайн", desc: "Живая лента событий — кто что нафармил, открыл или выиграл." },
];

function openInfoModal() {
  const body = document.getElementById("info-modal-body");
  if (!body.dataset.filled) {
    body.innerHTML = GUIDE_ITEMS.map(
      (g) => `<div class="guide-item">${icon(g.icon, 20)}<div><div class="guide-item-title">${g.title}</div><div class="guide-item-desc">${g.desc}</div></div></div>`,
    ).join("");
    body.dataset.filled = "1";
  }
  document.getElementById("info-modal").hidden = false;
}

function closeInfoModal() {
  document.getElementById("info-modal").hidden = true;
}

document.getElementById("info-modal-close").addEventListener("click", closeInfoModal);
document.getElementById("info-modal").addEventListener("click", (e) => {
  if (e.target.id === "info-modal") closeInfoModal();
});

// ── Таблица наград мини-игры ──
function openPaytableModal() {
  const body = document.getElementById("paytable-modal-body");
  if (!body.dataset.filled) {
    const symbolRows = Object.keys(SYMBOL_EMOJI)
      .map(
        (k) =>
          `<div class="profile-row"><div class="profile-row-label">${SYMBOL_EMOJI[k]}<span>${SYMBOL_NAME[k]} (${SYMBOL_WEIGHT[k]}%)</span></div><div class="profile-row-value" style="font-weight:500;text-align:right;max-width:55%">${SYMBOL_VALUE[k]}</div></div>`,
      )
      .join("");

    body.innerHTML = `
      <div class="profile-section-title">Символы (5 роллов за попытку)</div>
      ${symbolRows}

      <div class="profile-section-title">Комбо — монеты (🪙💰💵💎🏆7️⃣)</div>
      <div class="profile-cd-list">
        <div class="profile-cd-row"><span>2 копии</span><span>номинал × 2</span></div>
        <div class="profile-cd-row"><span>3 копии</span><span>номинал × 5</span></div>
        <div class="profile-cd-row"><span>4 копии</span><span>номинал × 12</span></div>
        <div class="profile-cd-row"><span>5 копий</span><span>номинал × 30 (большой выигрыш)</span></div>
      </div>

      <div class="profile-section-title">Комбо — ключи и ресурсы (🔑🔥💥✈️)</div>
      <div class="profile-cd-list">
        <div class="profile-cd-row"><span>2 копии</span><span>сумма × 2</span></div>
        <div class="profile-cd-row"><span>3 копии</span><span>сумма × 3</span></div>
        <div class="profile-cd-row"><span>4 копии</span><span>сумма × 4</span></div>
        <div class="profile-cd-row"><span>5 копий</span><span>сумма × 5 (большой выигрыш)</span></div>
      </div>

      <div class="profile-section-title">Джекпоты и бонусы</div>
      <div class="profile-cd-list">
        <div class="profile-cd-row"><span>7️⃣ × 3 и более</span><span>+${fmtNum(JACKPOT_777_DISPLAY)} монет</span></div>
        <div class="profile-cd-row"><span>💀 × 5</span><span>+${fmtNum(ANTI_JACKPOT_DISPLAY)} монет</span></div>
        <div class="profile-cd-row"><span>🍀 клевер</span><span>×1.5 к монетам спина за каждую копию (если есть монеты)</span></div>
        <div class="profile-cd-row"><span>Номер попытки за день</span><span>монеты спина × 1 / × 2 / × 3</span></div>
        <div class="profile-cd-row"><span>🔥/💥/✈️ — каждая копия</span><span>45% шанс уйти в детали вместо ресурса (✈️ → 2, 🔥/💥 → 1)</span></div>
        <div class="profile-cd-row"><span>🃏 джокер</span><span>${SYMBOL_VALUE.joker}</span></div>
        <div class="profile-cd-row"><span>После каждой попытки</span><span>0.5% шанс на Набор Фортуны (дубликат = +${fmtNum(ITEM_DUP_COMP_DISPLAY)} монет)</span></div>
      </div>

      <div class="profile-section-title">Стоимость попыток</div>
      <div class="profile-cd-list">
        <div class="profile-cd-row"><span>Попытка 1</span><span>${fmtNum(MINIGAME_COSTS[1])} монет</span></div>
        <div class="profile-cd-row"><span>Попытка 2</span><span>${fmtNum(MINIGAME_COSTS[2])} монет</span></div>
        <div class="profile-cd-row"><span>Попытка 3</span><span>${fmtNum(MINIGAME_COSTS[3])} монет</span></div>
      </div>
      <div class="profile-empty">Набор Фортуны из магазина даёт −10% на все три попытки.</div>
    `;
    body.dataset.filled = "1";
  }
  document.getElementById("paytable-modal").hidden = false;
}

function closePaytableModal() {
  document.getElementById("paytable-modal").hidden = true;
}

document.getElementById("paytable-modal-close").addEventListener("click", closePaytableModal);
document.getElementById("paytable-modal").addEventListener("click", (e) => {
  if (e.target.id === "paytable-modal") closePaytableModal();
});

// ── Дизайны профиля (VIP-косметика от "Игрушечная админка от Максима") ──
const PROFILE_THEME_NAMES = {
  "theme-harlequin": "Арлекин",
  "theme-serenity": "Безмятежность",
  "theme-aquarelle": "Акварель",
  "theme-nostalgia": "Ностальгия",
  "theme-hamster": "Верный друг",
  "theme-starry": "Звёздная тишина",
  "theme-billcipher": "Билл Сайфер",
};
const THEME_POINTS_HTML = `<div class="theme-points-wrapper">${"<i class=\"theme-point\"></i>".repeat(10)}</div>`;
const THEME_HAMSTER_HTML = `
  <div class="wheel-and-hamster theme-hamster-html">
    <div class="wheel"></div>
    <div class="hamster">
      <div class="hamster__body">
        <div class="hamster__head">
          <div class="hamster__ear"></div>
          <div class="hamster__eye"></div>
          <div class="hamster__nose"></div>
        </div>
        <div class="hamster__limb hamster__limb--fr"></div>
        <div class="hamster__limb hamster__limb--fl"></div>
        <div class="hamster__limb hamster__limb--br"></div>
        <div class="hamster__limb hamster__limb--bl"></div>
        <div class="hamster__tail"></div>
      </div>
    </div>
    <div class="spoke"></div>
  </div>
`;

function wrapProfileHead(theme, headHTML) {
  if (!theme) return headHTML;
  return `<div class="profile-theme-card ${theme}">${THEME_POINTS_HTML}${THEME_HAMSTER_HTML}${headHTML}</div>`;
}

// ── Профиль участника (клик по нику в ленте "Онлайн") ──
const AVATAR_OVERRIDES = { xFORTUNAx: "fortuna.webp" };

function avatarUrl(login) {
  if (AVATAR_OVERRIDES[login]) return `img/avatars/${AVATAR_OVERRIDES[login]}`;
  let hash = 0;
  for (let i = 0; i < login.length; i++) hash = (hash * 31 + login.charCodeAt(i)) >>> 0;
  return `img/avatars/ava_${(hash % 6) + 1}.jpg`;
}

const FARM_LABEL = { loot: "Лут", fireball: "Фаербол", radiofugas: "Радиофугас", meladze: "Меладзе" };

function profileRow(iconName, label, value) {
  return `<div class="profile-row"><div class="profile-row-label">${icon(iconName, 15)}<span>${label}</span></div><div class="profile-row-value">${value}</div></div>`;
}

function renderPlayerProfileHTML(p) {
  const e = p.economy;
  const cdList = ["loot", "fireball", "radiofugas", "meladze"]
    .map((key) => {
      const cd = p.cooldowns[key];
      let status;
      if (!cd.unlocked) status = "🔒 недоступно (нет билета)";
      else if (cd.available) status = "✅ доступен";
      else status = `⏳ осталось ${liveCountdown(cd.seconds_left)}`;
      if (cd.reduced_by) status += ` (КД ${cd.cd_hours} ч — ${cd.reduced_by})`;
      return `<div class="profile-cd-row"><span class="cd-name">${FARM_LABEL[key]}</span><span>${status}</span></div>`;
    })
    .join("");

  let raidSection = `<div class="profile-empty">Рейдов пока не проводилось</div>`;
  if (p.raid_stats) {
    const rs = p.raid_stats;
    const rows = [
      `Регулярность участия: ${Math.round(rs.participation_rate * 100)}% (${rs.participated}/${rs.total_raids})`,
      `Средняя доля урона: ${rs.avg_damage_share_pct.toFixed(1)}% HP за рейд`,
      `Частота атак: ${rs.attack_frequency.toFixed(2)} от максимума (всего ${rs.total_attacks} атак)`,
      rs.best_raid
        ? `Лучший рейд: ${fmtNum(rs.best_raid.damage)} урона (${rs.best_raid.hpSharePct.toFixed(1)}% HP), ${rs.best_raid.rank} место`
        : null,
      `Последний рейд: ${rs.last_raid.participated ? `${fmtNum(rs.last_raid.damage)} урона` : "пропущен"}`,
    ].filter(Boolean);
    raidSection = `<div class="profile-cd-list">${rows.map((r) => `<div class="profile-cd-row"><span>${r}</span></div>`).join("")}</div>`;
  }

  const activeRaidLine = p.active_raid
    ? `${icon("crossedSwords", 14)} Сейчас идёт: ${RAID_TYPE_LABEL[p.active_raid.rtype] ?? p.active_raid.rtype}`
    : `${icon("fortress", 14)} Активных рейдов сейчас нет.`;

  const legendaryHTML = p.legendary_items.length
    ? `<div class="profile-items-list">${p.legendary_items.map((i) => `<div>${icon("award", 13)} ${i.name}</div>`).join("")}</div>`
    : `<div class="profile-empty">—</div>`;
  const regularHTML = p.regular_items.length
    ? `<div class="profile-items-list">${p.regular_items.map((i) => `<div>- ${i.name}</div>`).join("")}</div>`
    : `<div class="profile-empty">Пока ничего нет</div>`;

  const isOnline = p.last_seen && Date.now() - new Date(p.last_seen).getTime() < 5 * 60 * 1000;
  const onlineStatus = isOnline
    ? `🟢 Онлайн`
    : p.last_seen
      ? `Последний раз был: ${new Date(p.last_seen).toLocaleString("ru-RU")}`
      : "—";

  const profileHeadHTML = `
    <div class="profile-head">
      <img class="profile-avatar" src="${avatarUrl(p.login)}" alt="" />
      <div>
        <div class="profile-name">${p.login}</div>
        <div class="profile-online">${onlineStatus}</div>
      </div>
    </div>
  `;

  return `
    ${wrapProfileHead(p.profile_theme, profileHeadHTML)}

    ${profileRow("commercialAirplane", "Очки на Ту-4", fmtNum(e.tu4_points))}
    ${profileRow("jetFighter", "Сбито на фаерболе", fmtNum(e.fireball_kills))}
    ${profileRow("fragmentedMeteor", "Уничтожено радиофугасом", fmtNum(e.radiofugas_kills))}
    ${profileRow("award", "Муты / Варны (за всё время)", p.legacy ? `${fmtNum(p.legacy.total_mutes)} / ${fmtNum(p.legacy.total_warns)}` : "—")}
    ${profileRow("coin", "Монеты чата Фортуны", fmtNum(e.loot_points))}
    ${profileRow("carKey", "Ключи", `${fmtNum(e.keys_current)} (всего: ${fmtNum(e.keys_lifetime)})`)}
    ${profileRow("anvilImpact", "Оборудование", e.active_equipment ? e.active_equipment.name : "нет активного")}
    ${profileRow("openChest", "Доступно ещё", fmtNum(e.equipment_available_count))}
    ${profileRow("detail", "Детали", fmtNum(e.details))}

    <div class="profile-section-title">${icon("stopwatch", 13)} Кулдауны фарма</div>
    <div class="profile-cd-list">${cdList}</div>

    <div class="profile-section-title">${icon("crossedSwords", 13)} Рейды</div>
    ${raidSection}
    <div class="profile-cd-row" style="margin-top:6px">${activeRaidLine}</div>

    <div class="profile-section-title">${icon("award", 13)} Легендарные предметы</div>
    ${legendaryHTML}

    <div class="profile-section-title">${icon("openChest", 13)} Уникальные предметы</div>
    ${regularHTML}

    ${renderAdminPanelHTML(p)}
  `;
}

function renderAdminPanelHTML(p) {
  const me = getCurrentPlayer();
  if (!me || me.login !== p.login || !currentState?.is_admin) return "";

  const themeOptions = Object.entries(PROFILE_THEME_NAMES)
    .map(([slug, name]) => `<option value="${slug}" ${p.profile_theme === slug ? "selected" : ""}>${name}</option>`)
    .join("");

  return `
    <div class="profile-section-title">${icon("award", 13)} Панель администратора</div>
    <div class="admin-panel">
      <div class="admin-panel-label">Сбросить кулдауны фарма:</div>
      <div class="admin-cd-checks">
        <label><input type="checkbox" data-admin-cd="loot" checked /> Лут</label>
        <label><input type="checkbox" data-admin-cd="fireball" checked /> Фаербол</label>
        <label><input type="checkbox" data-admin-cd="radiofugas" checked /> Радиофугас</label>
        <label><input type="checkbox" data-admin-cd="meladze" checked /> Меладзе</label>
      </div>
      <button id="admin-reset-cd-btn" class="btn-secondary btn-sm">Сбросить выбранные</button>

      <div class="admin-panel-label" style="margin-top:14px">Дизайн профиля (любой, без ограничений):</div>
      <select id="admin-theme-select" class="admin-theme-select">
        <option value="">— без дизайна —</option>
        ${themeOptions}
      </select>
      <button id="admin-set-theme-btn" class="btn-secondary btn-sm">Применить дизайн</button>

      <div id="admin-panel-result" class="result-box" hidden></div>
    </div>
  `;
}

async function openPlayerProfile(login) {
  const body = document.getElementById("profile-modal-body");
  body.innerHTML = `<div class="loading">Загрузка...</div>`;
  document.getElementById("profile-modal").hidden = false;
  try {
    const data = await getPlayerProfile(login);
    body.innerHTML = renderPlayerProfileHTML(data);
    wireAdminPanel(body, login);
  } catch (err) {
    body.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

function wireAdminPanel(body, login) {
  const resetBtn = body.querySelector("#admin-reset-cd-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const fields = [...body.querySelectorAll("[data-admin-cd]:checked")].map((el) => el.dataset.adminCd);
      if (!fields.length) return;
      try {
        await adminResetCooldowns(getCurrentPlayer().id, fields);
        await openPlayerProfile(login);
      } catch (err) {
        showResult("admin-panel-result", false, err.message);
      }
    });
  }

  const themeBtn = body.querySelector("#admin-set-theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", async () => {
      const select = body.querySelector("#admin-theme-select");
      try {
        await adminSetProfileTheme(getCurrentPlayer().id, select.value || null);
        await openPlayerProfile(login);
      } catch (err) {
        showResult("admin-panel-result", false, err.message);
      }
    });
  }
}

function closePlayerProfile() {
  document.getElementById("profile-modal").hidden = true;
}

document.getElementById("profile-modal-close").addEventListener("click", closePlayerProfile);
document.getElementById("profile-modal").addEventListener("click", (e) => {
  if (e.target.id === "profile-modal") closePlayerProfile();
});

// ── Модалка результата действия (медиа сверху, что получено — снизу) ──
function showMediaResult({ title, mediaSrc, resultHTML }) {
  document.getElementById("media-modal-title").textContent = title;
  const isVideo = /\.(mp4|webm|mov)$/i.test(mediaSrc);
  document.getElementById("media-modal-media").innerHTML = isVideo
    ? `<video src="${mediaSrc}" autoplay muted loop playsinline></video>`
    : `<img src="${mediaSrc}" alt="" />`;
  document.getElementById("media-modal-result").innerHTML = resultHTML;
  document.getElementById("media-modal").hidden = false;
}

function closeMediaModal() {
  document.getElementById("media-modal").hidden = true;
  document.getElementById("media-modal-media").innerHTML = "";
}

document.getElementById("media-modal-close").addEventListener("click", closeMediaModal);
document.getElementById("media-modal-close-btn").addEventListener("click", closeMediaModal);
document.getElementById("media-modal").addEventListener("click", (e) => {
  if (e.target.id === "media-modal") closeMediaModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeInfoModal();
  closePaytableModal();
  closePlayerProfile();
  closeMediaModal();
  closeEventTimersModal();
  closeTopModal();
  closeContainerInfoModal();
});

(getCurrentPlayer() ? renderDashboard() : renderAuth());
