// ============================================================
//  game.js — логика экрана Завода.
//  Таймер считается локально (для отображения),
//  начисление деталей — только через Edge Function (сервер).
// ============================================================

// Таблица уровней завода (из DESIGN_factory.md)
// Индекс = уровень - 1
const FACTORY_STATS = [
  { output: 20,   upgradeCost: null },  // ур. 1
  { output: 35,   upgradeCost: 100  },  // ур. 2
  { output: 60,   upgradeCost: 250  },  // ур. 3
  { output: 100,  upgradeCost: 500  },  // ур. 4
  { output: 180,  upgradeCost: 800  },  // ур. 5
  { output: 320,  upgradeCost: 1200 },  // ур. 6
  { output: 600,  upgradeCost: 1800 },  // ур. 7
  { output: 1000, upgradeCost: 2500 },  // ур. 8
  { output: 2000, upgradeCost: 4000 },  // ур. 9
  { output: 3600, upgradeCost: 6000 },  // ур. 10
];

const CYCLE_MS = 4 * 60 * 60 * 1000; // 4 часа в мс
const MIN_COLLECT = 10;               // минимум для кнопки «Собрать»

let factoryTimerInterval = null;      // интервал таймера
let currentBase = null;               // последние данные базы из БД

// ─── Вспомогательные функции ───────────────────────────────

// Сколько деталей накопилось с момента последнего сбора (локальный расчёт)
function calcAccumulated(base) {
  const stats = FACTORY_STATS[Math.min(base.factory_level, 10) - 1];
  const elapsed = Date.now() - new Date(base.last_parts_collected).getTime();
  const accumulated = Math.floor((elapsed / CYCLE_MS) * stats.output);
  return Math.min(accumulated, stats.output); // не больше потолка
}

// Сколько миллисекунд до следующей полной партии
function msUntilFull(base) {
  const stats = FACTORY_STATS[Math.min(base.factory_level, 10) - 1];
  const elapsed = Date.now() - new Date(base.last_parts_collected).getTime();
  const remaining = CYCLE_MS - (elapsed % CYCLE_MS);
  const accumulated = Math.floor((elapsed / CYCLE_MS) * stats.output);
  // Если уже полный — 0
  if (accumulated >= stats.output) return 0;
  return remaining;
}

// Форматируем миллисекунды в "Xч Yмин" или "Yмин"
function formatMs(ms) {
  if (ms <= 0) return "0 мин";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}ч ${m}мин`;
  if (h > 0) return `${h}ч`;
  return `${m}мин`;
}

// ─── Обновление UI завода (каждую секунду) ─────────────────

function updateFactoryUI() {
  if (!currentBase) return;

  const stats = FACTORY_STATS[Math.min(currentBase.factory_level, 10) - 1];
  const accumulated = calcAccumulated(currentBase);
  const cap = stats.output;
  const pct = Math.min(100, Math.round((accumulated / cap) * 100));
  const isFull = accumulated >= cap;
  const msLeft = msUntilFull(currentBase);
  const canCollect = accumulated >= MIN_COLLECT;

  // Прогресс-бар
  const bar = document.getElementById("factory-bar");
  if (bar) bar.style.width = pct + "%";

  // Подпись над баром
  const barLabel = document.getElementById("factory-bar-label");
  if (barLabel) barLabel.textContent = `Накоплено: ${accumulated} / ${cap}`;

  const barPct = document.getElementById("factory-bar-pct");
  if (barPct) barPct.textContent = pct + "%";

  // Стат: скорость
  const speedEl = document.getElementById("factory-speed");
  if (speedEl) speedEl.innerHTML = `${cap} <span class="gear">⚙️</span><small>/4ч</small>`;

  // Стат: таймер до партии
  const timerEl = document.getElementById("factory-timer");
  if (timerEl) {
    if (isFull) {
      timerEl.innerHTML = `<span style="color:var(--accent)">Полный!</span>`;
    } else {
      const totalMin = Math.ceil(msLeft / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      timerEl.innerHTML = h > 0
        ? `${h}<small>ч</small> ${m}<small>мин</small>`
        : `${m}<small>мин</small>`;
    }
  }

  // Блок сбора
  const collectMain = document.getElementById("collect-main");
  if (collectMain) {
    collectMain.innerHTML = `Готово: ${accumulated} <span class="gear">⚙️</span>`;
  }

  // Кнопка «Собрать»
  const collectBtn = document.getElementById("btn-collect");
  if (collectBtn) {
    if (canCollect) {
      collectBtn.disabled = false;
      collectBtn.textContent = "Собрать";
      collectBtn.style.opacity = "1";
    } else {
      collectBtn.disabled = true;
      collectBtn.textContent = `Ещё ${MIN_COLLECT - accumulated} ⚙️`;
      collectBtn.style.opacity = "0.5";
    }
  }

  // Подсказка под карточками
  const hint = document.getElementById("factory-hint");
  if (hint) {
    hint.textContent = isFull
      ? "⚠️ Завод полон — соберите детали!"
      : `⏱ Завод заполнится через ${formatMs(msLeft)}`;
    hint.style.color = isFull ? "var(--accent)" : "";
  }

  // Кнопка улучшения
  const upgradeBtn = document.getElementById("btn-upgrade");
  if (upgradeBtn) {
    const level = currentBase.factory_level;
    const parts = currentBase.parts ?? 0;
    if (level >= 10) {
      upgradeBtn.disabled = true;
      upgradeBtn.textContent = "Максимальный уровень";
      upgradeBtn.style.opacity = "0.5";
    } else {
      const cost = FACTORY_STATS[level].upgradeCost;
      if (parts >= cost) {
        upgradeBtn.disabled = false;
        upgradeBtn.innerHTML = `Улучшить завод (${cost} ⚙️)`;
        upgradeBtn.style.opacity = "1";
        upgradeBtn.style.background = "var(--btn)";
        upgradeBtn.style.color = "var(--btn-text)";
      } else {
        upgradeBtn.disabled = true;
        upgradeBtn.innerHTML = `Недостаточно ⚙️ (${parts} / ${cost})`;
        upgradeBtn.style.opacity = "0.5";
        upgradeBtn.style.background = "";
        upgradeBtn.style.color = "";
      }
    }
  }

  // Заголовок блока улучшения
  const upgradeInfo = document.getElementById("upgrade-info");
  if (upgradeInfo) {
    const level = currentBase.factory_level;
    if (level >= 10) {
      upgradeInfo.innerHTML = `<span style="color:var(--text-soft)">Достигнут максимум</span>`;
    } else {
      const cost = FACTORY_STATS[level].upgradeCost;
      upgradeInfo.innerHTML = `
        <div class="upgrade-levels">ур. ${level} <span>→</span> ур. ${level + 1}</div>
        <div>
          <div class="cost-label">Стоимость</div>
          <div class="cost-value">${cost} ⚙️</div>
        </div>`;
    }
  }
}

// ─── Запуск таймера ────────────────────────────────────────

function startFactoryTimer() {
  stopFactoryTimer();
  updateFactoryUI();
  factoryTimerInterval = setInterval(updateFactoryUI, 10000); // каждые 10 сек
}

function stopFactoryTimer() {
  if (factoryTimerInterval) {
    clearInterval(factoryTimerInterval);
    factoryTimerInterval = null;
  }
}

// ─── Действия кнопок ───────────────────────────────────────

async function doCollect() {
  const player = getCurrentPlayer();
  if (!player) return;

  const btn = document.getElementById("btn-collect");
  if (btn) { btn.disabled = true; btn.textContent = "Собираем…"; }

  try {
    const result = await collectResources(player.id);
    // Обновляем локальный стейт
    currentBase.parts = result.parts;
    currentBase.last_parts_collected = new Date().toISOString();
    // Обновляем счётчик деталей в шапке профиля (если виден)
    const partsEl = document.getElementById("r-parts");
    if (partsEl) partsEl.textContent = result.parts;
    updateFactoryUI();
    showFactoryMsg(`+${result.collected} ⚙️ собрано!`, "ok");
  } catch (e) {
    showFactoryMsg(e.message, "err");
    if (btn) { btn.disabled = false; btn.textContent = "Собрать"; }
  }
}

async function doUpgrade() {
  const player = getCurrentPlayer();
  if (!player) return;

  const btn = document.getElementById("btn-upgrade");
  if (btn) { btn.disabled = true; btn.textContent = "Улучшаем…"; }

  try {
    const result = await upgradeFactory(player.id);
    currentBase.factory_level = result.level;
    currentBase.parts = result.parts;
    // Обновляем счётчик деталей в шапке профиля
    const partsEl = document.getElementById("r-parts");
    if (partsEl) partsEl.textContent = result.parts;
    // Обновляем бейдж уровня
    const levelBadge = document.getElementById("factory-level-badge");
    if (levelBadge) levelBadge.textContent = `ур. ${result.level}`;
    updateFactoryUI();
    showFactoryMsg(`Завод улучшен до уровня ${result.level}!`, "ok");
  } catch (e) {
    showFactoryMsg(e.message, "err");
    updateFactoryUI();
  }
}

function showFactoryMsg(text, type) {
  const el = document.getElementById("factory-msg");
  if (!el) return;
  el.textContent = text;
  el.style.color = type === "ok" ? "var(--accent)" : "#e05252";
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => { el.textContent = ""; }, 3500);
}

// ─── Рендер экрана завода ──────────────────────────────────

async function renderFactory() {
  if (typeof setActiveTab === "function") setActiveTab("factory");
  const app = document.getElementById("app-content");
  if (!app) return;

  const player = getCurrentPlayer();
  if (!player) return;

  // Пока грузим — показываем скелетон
  app.innerHTML = `
    <div class="card" style="text-align:center;padding:32px;color:var(--text-soft)">
      Загружаем завод…
    </div>`;

  try {
    const base = await fetchPlayerBase(player.id);
    if (!base) throw new Error("База не найдена");
    currentBase = base;
  } catch (e) {
    app.innerHTML = `
      <div class="card" style="text-align:center;padding:32px;color:var(--accent)">
        Не удалось загрузить завод: ${e.message}
      </div>`;
    return;
  }

  const level = currentBase.factory_level;
  const stats = FACTORY_STATS[Math.min(level, 10) - 1];
  const nextCost = level < 10 ? FACTORY_STATS[level].upgradeCost : null;

  app.innerHTML = `
    <div class="card">
      <div class="factory-header">
        <svg width="54" height="54" viewBox="0 0 54 54" fill="none">
          <rect width="54" height="54" rx="13" fill="var(--accent-soft)"/>
          <rect x="4" y="44" width="46" height="6" rx="3" fill="var(--border)"/>
          <rect x="7" y="30" width="40" height="16" rx="3" fill="#b5532f"/>
          <polygon points="7,30 47,30 42,23 12,23" fill="var(--accent)"/>
          <rect x="11" y="10" width="8" height="20" rx="3" fill="#9e4427"/>
          <rect x="11" y="8" width="8" height="6" rx="3" fill="var(--accent)"/>
          <rect x="24" y="15" width="6" height="15" rx="3" fill="#9e4427"/>
          <rect x="24" y="13" width="6" height="6" rx="3" fill="var(--accent)"/>
          <rect x="12" y="33" width="8" height="7" rx="2" fill="#f5e8d8" opacity="0.95"/>
          <rect x="24" y="33" width="8" height="7" rx="2" fill="#f5e8d8" opacity="0.95"/>
          <rect x="13" y="34" width="3" height="2" rx="1" fill="#fff" opacity="0.6"/>
          <rect x="25" y="34" width="3" height="2" rx="1" fill="#fff" opacity="0.6"/>
          <rect x="36" y="36" width="8" height="10" rx="2" fill="var(--border)" opacity="0.8"/>
          <circle cx="40" cy="41" r="1" fill="#b5532f"/>
          <ellipse cx="15" cy="7" rx="2.5" ry="2" fill="var(--text-soft)" opacity="0.5"/>
          <ellipse cx="17" cy="5" rx="2" ry="1.5" fill="var(--text-soft)" opacity="0.35"/>
          <ellipse cx="27" cy="12" rx="2" ry="1.5" fill="var(--text-soft)" opacity="0.4"/>
          <ellipse cx="29" cy="10" rx="1.5" ry="1.2" fill="var(--text-soft)" opacity="0.25"/>
        </svg>
        <div>
          <div class="f-title">Завод</div>
          <div class="f-sub">производство деталей</div>
        </div>
        <div class="level-badge" id="factory-level-badge">ур. ${level}</div>
      </div>

      <div class="progress-label-row">
        <span id="factory-bar-label">Накоплено: … / ${stats.output}</span>
        <span id="factory-bar-pct">…%</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" id="factory-bar" style="width:0%"></div>
      </div>

      <div class="stats-row">
        <div class="stat">
          <div class="stat-label">Скорость</div>
          <div class="stat-value" id="factory-speed">… <span class="gear">⚙️</span><small>/4ч</small></div>
        </div>
        <div class="stat">
          <div class="stat-label">До партии</div>
          <div class="stat-value" id="factory-timer">…</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="collect-block">
        <div class="collect-info">
          <div class="collect-main" id="collect-main">Готово: … <span class="gear">⚙️</span></div>
          <div class="collect-sub">Минимум для сбора — ${MIN_COLLECT} ⚙️</div>
        </div>
        <button class="btn-collect" id="btn-collect" onclick="doCollect()" disabled>…</button>
      </div>
      <div class="factory-msg" id="factory-msg"></div>
    </div>

    <div class="upgrade-card">
      <div class="upgrade-title">Улучшение завода</div>
      <div class="upgrade-row" id="upgrade-info">
        <div class="upgrade-levels">ур. ${level} <span>→</span> ур. ${level + 1}</div>
        <div>
          <div class="cost-label">Стоимость</div>
          <div class="cost-value">${nextCost ?? "—"} ⚙️</div>
        </div>
      </div>
      <button class="btn-upgrade-dis btn-upgrade" id="btn-upgrade" onclick="doUpgrade()">…</button>
    </div>

    <div class="timer-hint" id="factory-hint"></div>`;

  startFactoryTimer();
}
