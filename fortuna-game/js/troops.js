// ============================================================
//  troops.js — Лаборатория и войска (Этап 2).
//  Открытие войск через лабораторию, прокачка за Детали.
//  Звёзды, фрагменты, живучесть — Этап 3.
// ============================================================

const TROOP_ORDER = ["inf", "bmp", "tank", "arty", "aa", "msl", "avia"];

const TROOP_CFG = {
  inf:  { name: "Пехота",     letter: "П",  letterSize: 17, color: "#5a7a3e", weight: 1,    baseCost: 50,    labLevel: 1 },
  bmp:  { name: "БМП",        letter: "Б",  letterSize: 17, color: "#4a7eb5", weight: 2.5,  baseCost: 150,   labLevel: 2 },
  tank: { name: "Танки",      letter: "Т",  letterSize: 17, color: "#8a6d2a", weight: 5,    baseCost: 500,   labLevel: 3 },
  arty: { name: "Артиллерия", letter: "А",  letterSize: 17, color: "#b54a2a", weight: 10,   baseCost: 1200,  labLevel: 4 },
  aa:   { name: "ПВО",        letter: "AA", letterSize: 11, color: "#3e7a5e", weight: 20,   baseCost: 3000,  labLevel: 5 },
  msl:  { name: "Ракеты",     letter: "Р",  letterSize: 17, color: "#7a4db5", weight: 60,   baseCost: 7000,  labLevel: 6 },
  avia: { name: "Авиация",    letter: "В",  letterSize: 17, color: "#1a5fa0", weight: 200,  baseCost: 15000, labLevel: 7 },
};

// LAB_COSTS[currentLevel] — детали для перехода на следующий уровень
const LAB_COSTS = [null, 500, 1500, 3000, 5000, 8000, 12000];

const MAX_TROOP_LEVEL = 25;

let currentLabData = null; // { base, troops }

// ── Расчёты ─────────────────────────────────────────────────

function troopCost(type, currentLevel) {
  return (TROOP_CFG[type]?.baseCost ?? 0) * (currentLevel + 1);
}

function armyPower(troops) {
  return Math.floor(troops.reduce(function(sum, t) {
    const cfg = TROOP_CFG[t.troop_type];
    return cfg ? sum + cfg.weight * t.level : sum;
  }, 0));
}

// ── HTML-фрагменты ───────────────────────────────────────────

function troopBadge(type) {
  const cfg = TROOP_CFG[type];
  if (!cfg) return "";
  return `<div style="width:38px;height:38px;border-radius:10px;background:${cfg.color};display:flex;align-items:center;justify-content:center;font-size:${cfg.letterSize}px;font-weight:700;color:#fff;flex-shrink:0;">${cfg.letter}</div>`;
}

function troopRowHtml(type, level, parts) {
  const cfg   = TROOP_CFG[type];
  const cost  = troopCost(type, level);
  const isMax = level >= MAX_TROOP_LEVEL;
  const canUp = !isMax && parts >= cost;
  const power = Math.floor(cfg.weight * level);

  const subText = isMax
    ? "Макс. уровень &#183; Мощь: " + power
    : "Ур. " + level + " &#183; Мощь: " + power + " &#183; Следующий: " + cost + " &#9881;";

  const btnText = isMax ? "Максимум" : canUp ? "Улучшить" : "Нужно " + cost + " &#9881;";

  return `<div id="troop-row-${type}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface-2);border-radius:var(--radius-sm);">
    ${troopBadge(type)}
    <div style="flex:1;min-width:0;">
      <div style="font-size:14px;font-weight:650;">${cfg.name}</div>
      <div style="font-size:12px;color:var(--text-soft);margin-top:2px;">${subText}</div>
    </div>
    <div style="text-align:right;flex-shrink:0;">
      <div style="font-size:12px;color:var(--text-soft);margin-bottom:5px;">Ур. ${level}</div>
      <button
        ${canUp ? `onclick="doTroopUpgrade('${type}')"` : ""}
        style="border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:650;font-family:inherit;cursor:${canUp ? "pointer" : "default"};background:${canUp ? "var(--btn)" : "var(--surface-2)"};color:${canUp ? "var(--btn-text)" : "var(--text-soft)"};white-space:nowrap;"
      >${btnText}</button>
    </div>
  </div>`;
}

function lockedRowHtml(type) {
  const cfg = TROOP_CFG[type];
  return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface-2);border-radius:var(--radius-sm);opacity:0.4;">
    <div style="width:38px;height:38px;border-radius:10px;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">&#128274;</div>
    <div>
      <div style="font-size:14px;font-weight:650;color:var(--text-soft);">${cfg.name}</div>
      <div style="font-size:12px;color:var(--text-soft);margin-top:2px;">Открывается на Лаб. ур. ${cfg.labLevel}</div>
    </div>
  </div>`;
}

function labSvg() {
  return `<svg width="54" height="54" viewBox="0 0 54 54" fill="none">
    <rect width="54" height="54" rx="13" fill="var(--accent-soft)"/>
    <path d="M22,8 L22,22 L12,40 Q12,46 27,46 Q42,46 42,40 L32,22 L32,8 Z" fill="var(--surface)"/>
    <path d="M15.3,34 L12,40 Q12,46 27,46 Q42,46 42,40 L38.7,34 Z" fill="var(--accent)"/>
    <path d="M22,8 L22,22 L12,40 Q12,46 27,46 Q42,46 42,40 L32,22 L32,8" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="15.3" y1="34" x2="38.7" y2="34" stroke="var(--accent)" stroke-width="0.7" stroke-dasharray="2,1.5" opacity="0.5"/>
    <rect x="20" y="6" width="14" height="4" rx="2" fill="var(--text)"/>
    <rect x="22" y="7" width="6" height="1.5" rx="0.75" fill="white" opacity="0.22"/>
    <line x1="26" y1="11" x2="18" y2="43" stroke="white" stroke-width="1.5" opacity="0.2" stroke-linecap="round"/>
    <circle cx="30" cy="40" r="2" fill="white" opacity="0.45"/>
    <circle cx="22" cy="38" r="1.5" fill="white" opacity="0.35"/>
    <circle cx="34" cy="37" r="1" fill="white" opacity="0.3"/>
  </svg>`;
}

// ── Рендер ───────────────────────────────────────────────────

async function renderLab() {
  if (typeof setActiveTab === "function") setActiveTab("lab");
  const app = document.getElementById("app-content");
  if (!app) return;
  const player = getCurrentPlayer();
  if (!player) return;

  app.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--text-soft)">Загружаем лабораторию\u2026</div>`;

  try {
    const [base, troops] = await Promise.all([
      fetchPlayerBase(player.id),
      fetchPlayerTroops(player.id),
    ]);
    if (!base) throw new Error("База не найдена");
    currentLabData = { base, troops };
  } catch (e) {
    app.innerHTML = `<div class="card" style="text-align:center;padding:32px;color:var(--accent)">Не удалось загрузить лабораторию: ${escapeHtml(e.message)}</div>`;
    return;
  }

  renderLabContent();
}

function renderLabContent() {
  const app = document.getElementById("app-content");
  if (!app || !currentLabData) return;

  const { base, troops } = currentLabData;
  const labLevel = base.lab_level;
  const parts    = base.parts;
  const power    = armyPower(troops);
  const isLabMax = labLevel >= 7;

  const openedMap = {};
  troops.forEach(function(t) { openedMap[t.troop_type] = t.level; });

  const nextType = isLabMax ? null : TROOP_ORDER.find(function(t) { return TROOP_CFG[t].labLevel === labLevel + 1; });
  const nextName = nextType ? TROOP_CFG[nextType].name : "";
  const labCost  = isLabMax ? null : LAB_COSTS[labLevel];
  const canUpLab = !isLabMax && parts >= labCost;

  const troopRows = TROOP_ORDER.map(function(type) {
    return type in openedMap
      ? troopRowHtml(type, openedMap[type], parts)
      : lockedRowHtml(type);
  }).join("");

  const labBtnText = isLabMax
    ? "Все войска исследованы"
    : canUpLab
      ? "Улучшить лабораторию (" + labCost + " &#9881;)"
      : "Недостаточно &#9881; (" + parts + " / " + labCost + ")";

  app.innerHTML = `
    <div class="card">
      <div class="factory-header">
        ${labSvg()}
        <div>
          <div class="f-title">Лаборатория</div>
          <div class="f-sub">исследование войск</div>
        </div>
        <div class="level-badge" id="lab-level-badge">ур. ${labLevel}</div>
      </div>

      <div class="stats-row">
        <div class="stat">
          <div class="stat-label">Мощь армии</div>
          <div class="stat-value" id="lab-power">${power}<small style="font-size:12px;color:var(--text-soft);font-weight:500;"> ед.</small></div>
        </div>
        <div class="stat">
          <div class="stat-label">Детали</div>
          <div class="stat-value" id="lab-parts">${parts}<span class="gear"> &#9881;</span></div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="upgrade-title">Улучшение лаборатории</div>
      ${isLabMax
        ? `<div style="color:var(--text-soft);font-size:13px;text-align:center;padding:8px 0 14px;">Все войска исследованы</div>`
        : `<div class="upgrade-row">
            <div class="upgrade-levels">ур. ${labLevel} <span>&#8594;</span> ур. ${labLevel + 1}</div>
            <div>
              <div class="cost-label">Открывает</div>
              <div class="cost-value" style="font-size:15px;">${nextName}</div>
            </div>
          </div>`
      }
      <button
        id="btn-lab-upgrade"
        ${canUpLab ? `onclick="doLabUpgrade()"` : ""}
        style="width:100%;padding:13px;border:none;border-radius:var(--radius-sm);cursor:${canUpLab ? "pointer" : "default"};background:${canUpLab ? "var(--btn)" : "var(--surface-2)"};color:${canUpLab ? "var(--btn-text)" : "var(--text-soft)"};font-size:14px;font-weight:650;font-family:inherit;"
      >${labBtnText}</button>
      <div class="factory-msg" id="lab-msg"></div>
    </div>

    <div class="card">
      <div class="section-title">Войска</div>
      <div id="troops-list" style="display:flex;flex-direction:column;gap:8px;">
        ${troopRows}
      </div>
    </div>`;
}

// ── Действия ─────────────────────────────────────────────────

async function doLabUpgrade() {
  const player = getCurrentPlayer();
  if (!player || !currentLabData) return;

  const btn = document.getElementById("btn-lab-upgrade");
  if (btn) { btn.disabled = true; btn.innerHTML = "Улучшаем\u2026"; }

  try {
    const result = await upgradeLab(player.id);
    currentLabData.base.lab_level = result.lab_level;
    currentLabData.base.parts     = result.parts;

    const already = currentLabData.troops.some(function(t) { return t.troop_type === result.new_troop; });
    if (!already) {
      currentLabData.troops.push({ troop_type: result.new_troop, level: 1 });
    }

    const rPartsEl = document.getElementById("r-parts");
    if (rPartsEl) rPartsEl.textContent = result.parts;

    renderLabContent();
    showLabMsg("Открыто: " + (TROOP_CFG[result.new_troop]?.name ?? result.new_troop) + "!", "ok");
  } catch (e) {
    showLabMsg(e.message, "err");
    renderLabContent();
  }
}

async function doTroopUpgrade(type) {
  const player = getCurrentPlayer();
  if (!player || !currentLabData) return;

  const row = document.getElementById("troop-row-" + type);
  if (row) {
    const btn = row.querySelector("button");
    if (btn) { btn.disabled = true; btn.innerHTML = "Улучшаем\u2026"; }
  }

  try {
    const result = await upgradeTroop(player.id, type);

    currentLabData.base.parts = result.parts;
    const troop = currentLabData.troops.find(function(t) { return t.troop_type === type; });
    if (troop) troop.level = result.level;

    const updatedRow = document.getElementById("troop-row-" + type);
    if (updatedRow) updatedRow.outerHTML = troopRowHtml(type, result.level, result.parts);

    const powerEl = document.getElementById("lab-power");
    if (powerEl) powerEl.innerHTML = armyPower(currentLabData.troops) + `<small style="font-size:12px;color:var(--text-soft);font-weight:500;"> ед.</small>`;

    const labPartsEl = document.getElementById("lab-parts");
    if (labPartsEl) labPartsEl.innerHTML = result.parts + `<span class="gear"> &#9881;</span>`;

    refreshLabUpgradeBtn(result.parts);

    const rPartsEl = document.getElementById("r-parts");
    if (rPartsEl) rPartsEl.textContent = result.parts;

    showLabMsg((TROOP_CFG[type]?.name ?? type) + " улучшена до ур. " + result.level + "!", "ok");
  } catch (e) {
    showLabMsg(e.message, "err");
    const troop = currentLabData.troops.find(function(t) { return t.troop_type === type; });
    const badRow = document.getElementById("troop-row-" + type);
    if (troop && badRow) badRow.outerHTML = troopRowHtml(type, troop.level, currentLabData.base.parts);
  }
}

function refreshLabUpgradeBtn(newParts) {
  if (!currentLabData) return;
  const labLevel = currentLabData.base.lab_level;
  if (labLevel >= 7) return;

  const labCost  = LAB_COSTS[labLevel];
  const canUpLab = newParts >= labCost;
  const btn      = document.getElementById("btn-lab-upgrade");
  if (!btn) return;

  btn.disabled         = !canUpLab;
  btn.style.cursor     = canUpLab ? "pointer" : "default";
  btn.style.background = canUpLab ? "var(--btn)" : "var(--surface-2)";
  btn.style.color      = canUpLab ? "var(--btn-text)" : "var(--text-soft)";
  btn.innerHTML = canUpLab
    ? "Улучшить лабораторию (" + labCost + " &#9881;)"
    : "Недостаточно &#9881; (" + newParts + " / " + labCost + ")";
  btn.onclick = canUpLab ? doLabUpgrade : null;
}

function showLabMsg(text, type) {
  const el = document.getElementById("lab-msg");
  if (!el) return;
  el.textContent = text;
  el.style.color = type === "ok" ? "var(--accent)" : "#e05252";
  clearTimeout(el._timeout);
  el._timeout = setTimeout(function() { el.textContent = ""; }, 3500);
}
