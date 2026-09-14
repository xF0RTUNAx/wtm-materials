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

const NAV_TABS = [
  { id: "farm", icon: "farmBag", label: "Фарм" },
  { id: "shop", icon: "coin", label: "Магазин" },
  { id: "containers", icon: "chest", label: "Кейсы" },
  { id: "equipment", icon: "arrowRotate", label: "Оборудование" },
  { id: "raid", icon: "sword", label: "Рейд" },
  { id: "minigame", icon: "puzzle", label: "Игра" },
  { id: "feed", icon: "award", label: "Лента" },
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

  const e = currentState.economy;
  root.innerHTML = `
    <div class="topbar">
      <div class="brand">👤 ${player.login}</div>
      <button id="logout-btn" class="btn-ghost">Выйти</button>
    </div>

    <div class="stats-grid">
      <div class="stat"><div class="stat-label">Монеты</div><div class="stat-value">${icon("coin")} ${fmtNum(e.loot_points)}</div></div>
      <div class="stat"><div class="stat-label">Ключи</div><div class="stat-value">${icon("key")} ${fmtNum(e.keys_current)}</div></div>
      <div class="stat"><div class="stat-label">Детали</div><div class="stat-value">${icon("detail")} ${fmtNum(e.details)}</div></div>
      <div class="stat"><div class="stat-label">Ту-4</div><div class="stat-value">${icon("tu4bomber")} ${fmtNum(e.tu4_points)}</div></div>
      <div class="stat"><div class="stat-label">Фаербол</div><div class="stat-value">${icon("fireballPlane")} ${fmtNum(e.fireball_kills)}</div></div>
      <div class="stat"><div class="stat-label">Радиофугас</div><div class="stat-value">${icon("explosion")} ${fmtNum(e.radiofugas_kills)}</div></div>
    </div>

    <div id="tab-content"></div>

    <details class="migrate-box">
      <summary>Перенести прогресс из Telegram</summary>
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
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab;
      renderDashboard();
    });
  });

  renderTabContent(flash);

  document.getElementById("logout-btn").addEventListener("click", logout);
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

// ── Мини-игра ──
const SYMBOL_EMOJI = {
  skull: "💀", coin1: "🪙", coin2: "💰", coin3: "💵", coin4: "💎", coin5: "🏆", seven: "7️⃣",
  key: "🔑", fireball: "🔥", radiofugas: "💥", tu4: "✈️", clover: "🍀", joker: "🃏",
};
const MINIGAME_COSTS = { 1: 7777, 2: 17777, 3: 27777 };

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
      <div class="container-card-price">${canSpin ? `Цена: ${icon("coin", 14)} ${fmtNum(cost)}` : "Попытки на сегодня закончились"}</div>
      ${canSpin ? `<button id="spin-btn" class="btn-secondary btn-sm">Крутить</button>` : ""}
    </div>
  `;
  if (flash) showResult("minigame-result", flash.ok, flash.text);

  const btn = document.getElementById("spin-btn");
  if (btn) btn.addEventListener("click", async () => {
    const player = getCurrentPlayer();
    showResult("minigame-result", null, "Крутим...");
    try {
      const res = await minigameSpin(player.id);
      renderDashboard({ ok: true, text: describeSpinResult(res) });
    } catch (err) {
      showResult("minigame-result", false, err.message);
    }
  });
}

function describeSpinResult(res) {
  const symbols = res.rolled.map((k) => SYMBOL_EMOJI[k]).join(" ");
  const parts = [];
  if (res.coins_gained) parts.push(`${icon("coin", 14)} ${res.coins_gained > 0 ? "+" : ""}${fmtNum(res.coins_gained)}`);
  if (res.keys_gained) parts.push(`${icon("key", 14)} +${res.keys_gained}`);
  if (res.details_gained) parts.push(`${icon("detail", 14)} +${res.details_gained}`);
  if (res.resources_gained.fireball_kills) parts.push(`${icon("fireballPlane", 14)} +${res.resources_gained.fireball_kills}`);
  if (res.resources_gained.radiofugas_kills) parts.push(`${icon("explosion", 14)} +${res.resources_gained.radiofugas_kills}`);
  if (res.resources_gained.tu4_points) parts.push(`${icon("tu4bomber", 14)} +${res.resources_gained.tu4_points}`);
  let text = `${symbols}\n${parts.join(", ") || "Пусто"}`;
  if (res.big_win) text = "🎉 БОЛЬШОЙ ВЫИГРЫШ! " + text;
  if (res.item_drop === "new") text += `\n${icon("award", 14)} Выпал Набор Фортуны!`;
  if (res.item_drop === "duplicate") text += `\n${icon("award", 14)} Дубликат Набора Фортуны — +${fmtNum(ITEM_DUP_COMP_DISPLAY)} монет`;
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
        err.seconds_left ? `${err.message} — осталось ${fmtDuration(err.seconds_left)}` : err.message,
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
      err.seconds_left ? `${err.message} — осталось ${fmtDuration(err.seconds_left)}` : err.message,
    );
  }
}

// ── Фарм ──
function renderFarmTab(mount, flash) {
  mount.innerHTML = `
    <div class="actions-grid">
      <button class="action-card" data-action="loot">
        <div class="action-title">${icon("coin")} Собрать лут</div><div class="action-sub">/gimmetheloot</div>
      </button>
      <button class="action-card" data-action="fireball">
        <div class="action-title">${icon("fireballPlane")} Фаербол</div><div class="action-sub">/fireball</div>
      </button>
      <button class="action-card" data-action="radiofugas">
        <div class="action-title">${icon("explosion")} Радиофугас</div><div class="action-sub">/radiofugas</div>
      </button>
      <button class="action-card" data-action="meladze">
        <div class="action-title">${icon("award")} Меладзе</div><div class="action-sub">/meladze</div>
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

async function runAction(action) {
  const player = getCurrentPlayer();
  showResult("action-result", null, "...");
  try {
    const res = await ACTION_FNS[action](player.id);
    renderDashboard({ ok: true, text: describeResult(action, res) });
  } catch (err) {
    showResult(
      "action-result",
      false,
      err.seconds_left ? `${err.message} — осталось ${fmtDuration(err.seconds_left)}` : err.message,
    );
  }
}

function describeResult(action, res) {
  const c = icon("coin", 14), k = icon("key", 14), d = icon("detail", 14);
  if (action === "loot") return `${c} +${fmtNum(res.loot_gained)}${res.bonus_keys ? `, ${k} +${res.bonus_keys}` : ""}`;
  if (action === "fireball") return `${icon("fireballPlane", 14)} +${res.kills_gained}${res.bonus_keys ? `, ${k} +${res.bonus_keys}, ${d} +${res.bonus_details}` : ""}`;
  if (action === "radiofugas") return `${icon("explosion", 14)} +${res.kills_gained}${res.bonus_keys ? `, ${k} +${res.bonus_keys}, ${d} +${res.bonus_details}` : ""}`;
  if (action === "meladze") return `${c} +${fmtNum(res.coins_gained)}${res.bonus_keys ? `, ${k} +${res.bonus_keys}` : ""}${res.bonus_details ? `, ${d} +${res.bonus_details}` : ""}`;
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
        renderDashboard({ ok: true, text: `Куплено: ${res.bought} за ${icon("coin", 14)} ${fmtNum(res.price_paid)}` });
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

function renderContainersTab(mount, flash) {
  const cards = Object.entries(TIER_INFO)
    .map(
      ([tier, info]) => `
      <div class="container-card">
        <div class="container-card-name">${icon("chest")} ${info.name}</div>
        <div class="container-card-price">${icon("key", 13)} ${info.price} / шт</div>
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
      showResult("container-result", null, "Открываем...");
      try {
        const res = await containerOpen(player.id, Number(btn.dataset.tier), Number(btn.dataset.count));
        renderDashboard({ ok: true, text: describeContainerResult(res) });
      } catch (err) {
        showResult("container-result", false, err.message);
      }
    });
  });
}

function describeContainerResult(res) {
  const parts = [];
  if (res.totals.coins) parts.push(`${icon("coin", 14)} ${fmtNum(res.totals.coins)}`);
  if (res.totals.tu4) parts.push(`${icon("tu4bomber", 14)} ${res.totals.tu4}`);
  if (res.totals.fireball) parts.push(`${icon("fireballPlane", 14)} ${res.totals.fireball}`);
  if (res.totals.radiofugas) parts.push(`${icon("explosion", 14)} ${res.totals.radiofugas}`);
  if (res.totals.keys) parts.push(`${icon("key", 14)} ${res.totals.keys}`);
  if (res.totals.details) parts.push(`${icon("detail", 14)} ${res.totals.details}`);
  let text = "Получено: " + (parts.join(", ") || "ничего");
  if (res.new_items.length) {
    text += `. ${icon("award", 14)} Новый предмет: ${res.new_items.map(itemName).join(", ")}!`;
  }
  return text;
}

// ── Лента событий ──
function describeFeedItem(row) {
  const d = row.detail;
  const login = d.login ?? "кто-то";
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
    default:
      return `${login}: ${row.event_type}`;
  }
}

async function renderFeedTab(mount) {
  mount.innerHTML = `<div class="loading">Загрузка...</div>`;
  try {
    const rows = await fetchTable("activity_feed", "select=*&order=created_at.desc&limit=30");
    mount.innerHTML = rows.length
      ? `<div class="feed-list">${rows
          .map(
            (r) =>
              `<div class="feed-row"><div class="feed-text">${describeFeedItem(r)}</div><div class="feed-time">${new Date(r.created_at).toLocaleString("ru-RU")}</div></div>`,
          )
          .join("")}</div>`
      : `<div class="loading">Пока событий не было</div>`;
  } catch (err) {
    mount.innerHTML = `<div class="error-text">${err.message}</div>`;
  }
}

(getCurrentPlayer() ? renderDashboard() : renderAuth());
