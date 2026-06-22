// ============================================================
//  game.js — логика экрана Завода.
//  Таймер считается локально (для отображения),
//  начисление деталей — только через Edge Function (сервер).
// ============================================================

const FACTORY_STATS = [
  { output: 20,   upgradeCost: null },
  { output: 35,   upgradeCost: 100  },
  { output: 60,   upgradeCost: 250  },
  { output: 100,  upgradeCost: 500  },
  { output: 180,  upgradeCost: 800  },
  { output: 320,  upgradeCost: 1200 },
  { output: 600,  upgradeCost: 1800 },
  { output: 1000, upgradeCost: 2500 },
  { output: 2000, upgradeCost: 4000 },
  { output: 3600, upgradeCost: 6000 },
];

const CYCLE_MS = 4 * 60 * 60 * 1000;
const MIN_COLLECT = 10;

var FACTORY_CHAIN_ITEMS = [
  {label:'1', cost:null},    {label:'2', cost:'100'},
  {label:'3', cost:'250'},   {label:'4', cost:'500'},
  {label:'5', cost:'800'},   {label:'6', cost:'1 200'},
  {label:'7', cost:'1 800'}, {label:'8', cost:'2 500'},
  {label:'9', cost:'4 000'}, {label:'10',cost:'6 000'},
];
let factoryTimerInterval = null;
let currentBase = null;

function calcAccumulated(base) {
  const stats = FACTORY_STATS[Math.min(base.factory_level, 10) - 1];
  const elapsed = Date.now() - new Date(base.last_parts_collected).getTime();
  const accumulated = Math.floor((elapsed / CYCLE_MS) * stats.output);
  return Math.min(accumulated, stats.output);
}

function msUntilFull(base) {
  const stats = FACTORY_STATS[Math.min(base.factory_level, 10) - 1];
  const elapsed = Date.now() - new Date(base.last_parts_collected).getTime();
  const remaining = CYCLE_MS - (elapsed % CYCLE_MS);
  const accumulated = Math.floor((elapsed / CYCLE_MS) * stats.output);
  if (accumulated >= stats.output) return 0;
  return remaining;
}

function formatMs(ms) {
  if (ms <= 0) return "0 мин";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}ч ${m}мин`;
  if (h > 0) return `${h}ч`;
  return `${m}мин`;
}

function updateFactoryUI() {
  if (!currentBase) return;

  const stats = FACTORY_STATS[Math.min(currentBase.factory_level, 10) - 1];
  const accumulated = calcAccumulated(currentBase);
  const cap = stats.output;
  const pct = Math.min(100, Math.round((accumulated / cap) * 100));
  const isFull = accumulated >= cap;
  const msLeft = msUntilFull(currentBase);
  const canCollect = accumulated >= MIN_COLLECT;

  const bar = document.getElementById("factory-bar");
  if (bar) bar.style.width = pct + "%";

  const barLabel = document.getElementById("factory-bar-label");
  if (barLabel) barLabel.textContent = `Накоплено: ${accumulated} / ${cap}`;

  const barPct = document.getElementById("factory-bar-pct");
  if (barPct) barPct.textContent = pct + "%";

  const speedEl = document.getElementById("factory-speed");
  if (speedEl) speedEl.innerHTML = "" + cap + " " + ICON_PARTS + "<small>/4ч</small>";

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

  const collectMain = document.getElementById("collect-main");
  if (collectMain) {
    collectMain.innerHTML = "Готово: " + accumulated + " " + ICON_PARTS;
  }

  const collectBtn = document.getElementById("btn-collect");
  if (collectBtn) {
    if (canCollect) {
      collectBtn.disabled = false;
      collectBtn.textContent = "Собрать";
      collectBtn.style.opacity = "1";
    } else {
      collectBtn.disabled = true;
      collectBtn.innerHTML = 'Ещё ' + (MIN_COLLECT - accumulated) + ' ' + ICON_PARTS;
      collectBtn.style.opacity = "0.5";
    }
  }

  const hint = document.getElementById("factory-hint");
  if (hint) {
    hint.textContent = isFull
      ? "⚠️ Завод полон — соберите детали!"
      : `⏱ Завод заполнится через ${formatMs(msLeft)}`;
    hint.style.color = isFull ? "var(--accent)" : "";
  }

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
        upgradeBtn.innerHTML = `Улучшить завод (${cost} ${ICON_PARTS})`;
        upgradeBtn.style.opacity = "1";
        upgradeBtn.style.background = "var(--btn)";
        upgradeBtn.style.color = "var(--btn-text)";
      } else {
        upgradeBtn.disabled = true;
        upgradeBtn.innerHTML = 'Недостаточно ' + ICON_PARTS + ' (' + parts + ' / ' + cost + ')';
        upgradeBtn.style.opacity = "0.5";
        upgradeBtn.style.background = "";
        upgradeBtn.style.color = "";
      }
    }
  }

  const upgradeInfo = document.getElementById("upgrade-info");
  if (upgradeInfo) {
    const level = currentBase.factory_level;
    if (level >= 10) {
      upgradeInfo.innerHTML = `<span style="color:var(--text-soft)">Достигнут максимум</span>`;
    } else {
      const cost = FACTORY_STATS[level].upgradeCost;
      upgradeInfo.innerHTML = `
        <div class="upgrade-levels">ур. ${level} <span>&#8594;</span> ур. ${level + 1}</div>
        <div>
          <div class="cost-label">Стоимость</div>
          <div class="cost-value">${cost} ${ICON_PARTS}</div>
        </div>`;
    }
  }
}

function startFactoryTimer() {
  stopFactoryTimer();
  updateFactoryUI();
  factoryTimerInterval = setInterval(updateFactoryUI, 10000);
}

function stopFactoryTimer() {
  if (factoryTimerInterval) {
    clearInterval(factoryTimerInterval);
    factoryTimerInterval = null;
  }
}

async function doCollect() {
  const player = getCurrentPlayer();
  if (!player) return;

  const btn = document.getElementById("btn-collect");
  if (btn) { btn.disabled = true; btn.textContent = "Собираем…"; }

  try {
    const result = await collectResources(player.id);
    currentBase.parts = result.parts;
    currentBase.last_parts_collected = new Date().toISOString();
    const partsEl = document.getElementById("r-parts");
    if (partsEl) partsEl.textContent = result.parts;
    updateFactoryUI();
    showFactoryMsg('+' + result.collected + ' ' + ICON_PARTS + ' собрано!', 'ok');
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
    const partsEl = document.getElementById("r-parts");
    if (partsEl) partsEl.textContent = result.parts;
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

async function renderFactory() {
  if (typeof setActiveTab === "function") setActiveTab("factory");
  const app = document.getElementById("app-content");
  if (!app) return;

  const player = getCurrentPlayer();
  if (!player) return;

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

  // ── GLB-модель завода (model-viewer) ─────────────────────
  const factoryModel = `<model-viewer
    src="factory_and_lab/Models/GLB%20format/building-m.glb"
    camera-orbit="0deg 70deg 105%"
    auto-rotate
    auto-rotate-delay="800"
    rotation-per-second="18deg"
    camera-controls
    style="width:80px;height:80px;border-radius:13px;background:var(--accent-soft);flex-shrink:0;"
  ></model-viewer>`;

  app.innerHTML = `
    <div class="card">
      <div class="factory-header">
        ${factoryModel}
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
          <div class="stat-value" id="factory-speed">…</div>
        </div>
        <div class="stat">
          <div class="stat-label">До партии</div>
          <div class="stat-value" id="factory-timer">…</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="collect-block">
        <div class="collect-info">
          <div class="collect-main" id="collect-main">Готово: …</div>
          <div class="collect-sub">Минимум для сбора — ${MIN_COLLECT} ${ICON_PARTS}</div>
        </div>
        <button class="btn-collect" id="btn-collect" onclick="doCollect()" disabled>…</button>
      </div>
      <div class="factory-msg" id="factory-msg"></div>
    </div>

    <div class="upgrade-card">
      <div class="upgrade-title">Прокачка завода</div>
      ` + buildChain(FACTORY_CHAIN_ITEMS, Math.min(level,10)-1, 'factory-chain-tip', 'parts') + `\n      <div class="upgrade-row" id="upgrade-info">
        <div class="upgrade-levels">ур. ${level} <span>&#8594;</span> ур. ${level + 1}</div>
        <div>
          <div class="cost-label">Стоимость</div>
          <div class="cost-value">${nextCost ?? '—'} ${ICON_PARTS}</div>
        </div>
      </div>
      <button class="btn-upgrade-dis btn-upgrade" id="btn-upgrade" onclick="doUpgrade()">…</button>
    </div>

    <div class="timer-hint" id="factory-hint"></div>`;

  startFactoryTimer();
}
