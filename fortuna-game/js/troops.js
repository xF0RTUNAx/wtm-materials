// ============================================================
//  troops.js — Лаборатория и войска (Этап 2, расширено в Этапе 10).
//  Открытие войск через лабораторию, прокачка за Детали.
//  Этап 10: добавлено 5 новых типов войск (12 всего), лаборатория
//  расширена до 12 уровней, «Танки» переименованы в «ОБТ» (id не менялся).
// ============================================================

const TROOP_ORDER = ["inf", "spec", "bmp", "ltank", "tank", "taa", "arty", "heli", "aa", "msl", "rfleet", "avia"];

const TROOP_CFG = {
  inf:    { name: "Пехота",        color: "#5a7a3e", weight: 1,    baseCost: 60,    labLevel: 1  },
  spec:   { name: "Спецназ",       color: "#6b3f8a", weight: 1.6,  baseCost: 125,   labLevel: 2  },
  bmp:    { name: "БМП",           color: "#4a7eb5", weight: 2.2,  baseCost: 250,   labLevel: 3  },
  ltank:  { name: "Лёгкие танки",  color: "#9a8a3e", weight: 3,    baseCost: 450,   labLevel: 4  },
  tank:   { name: "ОБТ",           color: "#8a6d2a", weight: 4,    baseCost: 800,   labLevel: 5  },
  taa:    { name: "Такт. ПВО",     color: "#1f9e9e", weight: 5,    baseCost: 1400,  labLevel: 6  },
  arty:   { name: "Артиллерия",    color: "#b54a2a", weight: 6,    baseCost: 2000,  labLevel: 7  },
  heli:   { name: "Вертолёты",     color: "#2a6db5", weight: 8,    baseCost: 3250,  labLevel: 8  },
  aa:     { name: "ПВО",           color: "#3e7a5e", weight: 10,   baseCost: 5250,  labLevel: 9  },
  msl:    { name: "Ракеты",        color: "#7a4db5", weight: 12,   baseCost: 12000, labLevel: 10 },
  rfleet: { name: "Ракетный флот", color: "#0f3d66", weight: 14,   baseCost: 17500, labLevel: 11 },
  avia:   { name: "Авиация",       color: "#1a5fa0", weight: 16,   baseCost: 26000, labLevel: 12 },
};

// ── PNG-пути для каждого типа войска ─────────────────────────
const TROOP_IMG = {
  inf:    "army/soldier_r.png",
  spec:   "army/special_force_r.png",
  bmp:    "army/bmp_r.png",
  ltank:  "army/light_tank_r.png",
  tank:   "army/tank_r.png",
  taa:    "army/tactic_aa_r.png",
  arty:   "army/artillery_r.png",
  heli:   "army/heli_r.png",
  aa:     "army/aa_r.png",
  msl:    "army/missile_r.png",
  rfleet: "army/rocket_fleet_r.png",
  avia:   "army/aviation_r.png",
};

// Масштаб PNG внутри бейджа (компенсирует разные поля прозрачности в файлах)
const TROOP_IMG_SCALE = {
  inf: 1, spec: 1, bmp: 1.6, ltank: 1, tank: 1, taa: 1,
  arty: 1, heli: 1, aa: 1, msl: 1, rfleet: 1, avia: 1,
};



// Цепочка прокачки лаборатории (12 уровней)
var LAB_CHAIN_ITEMS = [
  {label:'Пехота',      cost:null},
  {label:'Спецназ',     cost:'600'},
  {label:'БМП',         cost:'1\u202f500'},
  {label:'Лёгк. танки', cost:'3\u202f000'},
  {label:'ОБТ',         cost:'5\u202f000'},
  {label:'Такт. ПВО',   cost:'7\u202f500'},
  {label:'Артиллерия',  cost:'10\u202f000'},
  {label:'Вертолёты',   cost:'15\u202f000'},
  {label:'ПВО',         cost:'20\u202f000'},
  {label:'Ракеты',      cost:'26\u202f000'},
  {label:'Рак. флот',   cost:'35\u202f000'},
  {label:'Авиация',     cost:'45\u202f000'},
];
const LAB_COSTS = [null, 600, 1500, 3000, 5000, 7500, 10000, 15000, 20000, 26000, 35000, 45000];
const LAB_MAX_LEVEL = 12;
const MAX_TROOP_LEVEL = 25;

let currentLabData = null;

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

// PNG-бейдж войска (38×38, вместо буквы)
function troopBadge(type) {
  const cfg = TROOP_CFG[type];
  if (!cfg) return "";
  const src   = TROOP_IMG[type] || "";
  const scale = TROOP_IMG_SCALE[type] || 1;
  return `<div style="width:38px;height:38px;border-radius:10px;background:var(--surface-2);`
    + `display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">`
    + `<img src="${src}" alt="${cfg.name}" style="width:38px;height:38px;object-fit:contain;transform:scale(${scale});" />`
    + `</div>`;
}

function troopRowHtml(type, level, parts) {
  const cfg   = TROOP_CFG[type];
  const cost  = troopCost(type, level);
  const isMax = level >= MAX_TROOP_LEVEL;
  const canUp = !isMax && parts >= cost;
  const power = Math.floor(cfg.weight * level);

  const subText = isMax
    ? "Макс. уровень &#183; Мощь: " + power
    : "Ур. " + level + " &#183; Мощь: " + power + " &#183; Следующий: " + cost + " " + ICON_PARTS;

  const btnText = isMax ? "Максимум" : canUp ? "Улучшить" : "Нужно " + cost + " " + ICON_PARTS;

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
  const src = TROOP_IMG[type] || "";
  return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface-2);border-radius:var(--radius-sm);opacity:0.4;">
    <div style="width:38px;height:38px;border-radius:10px;background:var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">
      <img src="${src}" alt="${cfg.name}" style="width:38px;height:38px;object-fit:contain;filter:grayscale(1);transform:scale(${TROOP_IMG_SCALE[type] || 1});" />
    </div>
    <div>
      <div style="font-size:14px;font-weight:650;color:var(--text-soft);">${cfg.name}</div>
      <div style="font-size:12px;color:var(--text-soft);margin-top:2px;">Открывается на Лаб. ур. ${cfg.labLevel}</div>
    </div>
  </div>`;
}

// GLB-модель лаборатории (вместо SVG)
function labSvg() {
  return '<model-viewer'
    + ' src="factory_and_lab/Models/GLB%20format/building-q.glb"'
    + ' camera-orbit="0deg 70deg 105%"'
    + ' auto-rotate'
    + ' auto-rotate-delay="800"'
    + ' rotation-per-second="18deg"'
    + ' camera-controls'
    + ' style="width:80px;height:80px;border-radius:13px;background:var(--accent-soft);flex-shrink:0;"'
    + '></model-viewer>';
}

// Кнопка-подсказка «?» рядом с заголовком Лаборатории.
// Открывает модалку #modal-lab-help (статичная разметка в app.html).
function labHelpBtn() {
  return '<button onclick="openModal(\'lab-help\')" title="Что такое мощь и синергии?"'
    + ' style="margin-left:6px;background:var(--surface-2);border:1px solid var(--border);'
    + 'border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;'
    + 'justify-content:center;font-size:11px;font-weight:700;color:var(--text-soft);'
    + 'cursor:pointer;flex-shrink:0;vertical-align:middle;font-family:inherit;">?</button>';
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
  const isLabMax = labLevel >= LAB_MAX_LEVEL;

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
      ? "Улучшить лабораторию (" + labCost + " " + ICON_PARTS + ")"
      : "Недостаточно " + ICON_PARTS + " (" + parts + " / " + labCost + ")";

  app.innerHTML = `
    <div class="card">
      <div class="factory-header">
        ${labSvg()}
        <div>
          <div class="f-title">Лаборатория ${labHelpBtn()}</div>
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
          <div class="stat-value" id="lab-parts">${parts} ${ICON_PARTS}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="upgrade-title">Прокачка лаборатории</div>
      ${buildChain(LAB_CHAIN_ITEMS, labLevel - 1, 'lab-chain-tip', 'parts')}
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

    const newTroops = result.new_troops || (result.new_troop ? [result.new_troop] : []);
    newTroops.forEach(function(nt) {
      const already = currentLabData.troops.some(function(t) { return t.troop_type === nt; });
      if (!already) currentLabData.troops.push({ troop_type: nt, level: 1 });
    });

    const rPartsEl = document.getElementById("r-parts");
    if (rPartsEl) rPartsEl.textContent = result.parts;

    renderLabContent();
    const openedNames = newTroops.map(function(nt) { return TROOP_CFG[nt]?.name ?? nt; }).join(", ");
    showLabMsg("Открыто: " + (openedNames || "—") + "!", "ok");
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
    if (labPartsEl) labPartsEl.innerHTML = result.parts + " " + ICON_PARTS;

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
  if (labLevel >= LAB_MAX_LEVEL) return;

  const labCost  = LAB_COSTS[labLevel];
  const canUpLab = newParts >= labCost;
  const btn      = document.getElementById("btn-lab-upgrade");
  if (!btn) return;

  btn.disabled         = !canUpLab;
  btn.style.cursor     = canUpLab ? "pointer" : "default";
  btn.style.background = canUpLab ? "var(--btn)" : "var(--surface-2)";
  btn.style.color      = canUpLab ? "var(--btn-text)" : "var(--text-soft)";
  btn.innerHTML = canUpLab
    ? "Улучшить лабораторию (" + labCost + " " + ICON_PARTS + ")"
    : "Недостаточно " + ICON_PARTS + " (" + newParts + " / " + labCost + ")";
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
