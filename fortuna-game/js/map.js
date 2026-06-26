// ============================================================
//  map.js — Карта войны (Этап 6, Кусок 1)
//  Только чтение: показывает карту 14×14, детали сектора, GLB.
//  Боевая механика — в Куске 2.
// ============================================================

// ── Константы ────────────────────────────────────────────────

var MAP_GRID = 14;
var MAP_CELL = 34;
var MAP_GAP  = 2;

var MAP_TIER = {
  1: { label: "\u041e\u043a\u0440\u0430\u0438\u043d\u0430",    garrison: 30,  tax: 180,  glb: "building-watermill.glb" },
  2: { label: "\u041f\u0440\u0435\u0434\u043c\u0435\u0441\u0442\u044c\u0435", garrison: 150, tax: 360,  glb: "building-archery.glb"   },
  3: { label: "\u0426\u0435\u043d\u0442\u0440",                garrison: 400, tax: 1200, glb: "building-walls.glb"     },
};

// Запасные GLB (заводские, с embedded-текстурами) — используются пока не загружены
// текстуры в Battle_Base_Clan_Wars/Textures/. Убрать когда текстуры будут на месте.
var MAP_TIER_GLB_FALLBACK = {
  1: "https://cdn.jsdelivr.net/gh/xF0RTUNAx/wtm-materials@main/fortuna-game/factory_and_lab/Models/GLB%20format/building-m.glb",
  2: "https://cdn.jsdelivr.net/gh/xF0RTUNAx/wtm-materials@main/fortuna-game/factory_and_lab/Models/GLB%20format/building-q.glb",
  3: "https://cdn.jsdelivr.net/gh/xF0RTUNAx/wtm-materials@main/fortuna-game/factory_and_lab/Models/GLB%20format/building-q.glb",
};

var MAP_TIER_RING = {
  1: "rgba(255,255,255,.22)",
  2: "#e8c030",
  3: "#e04010",
};

// CDN для GLB-моделей из папки Battle_Base_Clan_Wars/
var MAP_GLB_CDN = "https://cdn.jsdelivr.net/gh/xF0RTUNAx/wtm-materials@main/fortuna-game/Battle_Base_Clan_Wars/";

// Палитра цветов для кланов (8 цветов)
var MAP_CLAN_PALETTE = ["#e05050","#5090e0","#40c060","#e0a030","#c050e0","#40c0b0","#e06030","#a0c040"];

// ── Состояние ────────────────────────────────────────────────

var _mapFront     = null;
var _mapSectorMap = {};
var _mapClanMap   = {};
var _mapCoopMap   = {};   // key "row-col" → coop_request (активные запросы клана)
var _mapPlayer    = null;
var _mapBase      = null;
var _mapCSSOk     = false;

// ── Утилиты ──────────────────────────────────────────────────

function mapGetTier(r, c) {
  var d = Math.min(r, MAP_GRID - 1 - r, c, MAP_GRID - 1 - c);
  return d <= 1 ? 1 : d <= 4 ? 2 : 3;
}

// Детерминированное псевдослучайное число [0,1) по позиции и смещению
function mapRng(r, c, off) {
  var x = Math.sin((r + 1) * 3.141 + (c + 1) * 2.718 + ((off || 0) + 1) * 1.618) * 43758.5453;
  return x - Math.floor(x);
}

// Цвет клана по его UUID (стабильный хэш → палитра)
function mapClanColor(clanId) {
  if (!clanId) return null;
  var n = 0;
  for (var i = 0; i < clanId.length; i++) n += clanId.charCodeAt(i);
  return MAP_CLAN_PALETTE[n % MAP_CLAN_PALETTE.length];
}

// HEX → rgba(r,g,b,a)
function mapRgba(hex, a) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return "rgba(" + r + "," + g + "," + b + "," + a + ")";
}

// Координата сектора: строка→число (1–14), столбец→буква (A–N)
// Пример: [0,0] = "A1", [6,6] = "G7", [13,13] = "N14"
function mapCoord(r, c) {
  return String.fromCharCode(65 + c) + (r + 1);
}

// ── CSS (инжектируется один раз) ─────────────────────────────

function mapInjectCSS() {
  if (_mapCSSOk) return;
  var s = document.createElement("style");
  s.textContent = "@keyframes mapWave{from{background-position:0 0}to{background-position:36px 36px}}"
    + ".map-cell{width:" + MAP_CELL + "px;height:" + MAP_CELL + "px;border-radius:5px;"
    + "cursor:pointer;position:relative;z-index:1;transition:transform .12s;box-sizing:border-box;}"
    + ".map-cell:hover{transform:scale(1.15);z-index:20;}"
    + "@keyframes coopPulse{0%,100%{box-shadow:0 0 0 0 rgba(240,192,64,.5)}50%{box-shadow:0 0 0 3px rgba(240,192,64,.2)}}"
    + ".map-coop{animation:coopPulse 1.5s ease-in-out infinite;}";
  document.head.appendChild(s);
  _mapCSSOk = true;
}

// ── SVG-острова (стиль «Острова») ────────────────────────────

function mapCellSVG(r, c) {
  var tier = mapGetTier(r, c);
  var cx = MAP_CELL / 2;
  var cy = MAP_CELL / 2;
  var a  = mapRng(r, c, 0);
  var b  = mapRng(r, c, 1);
  var v  = a < 0.33 ? 0 : a < 0.66 ? 1 : 2;
  var rx, ry;

  if (tier === 1) {
    rx = 8 + a * 3; ry = 4 + b * 2;
    if (v === 0) {
      return "<ellipse cx=\"" + cx + "\" cy=\"" + (cy+3) + "\" rx=\"" + rx + "\" ry=\"" + ry + "\" fill=\"#c8a870\"/>"
           + "<ellipse cx=\"" + (cx-1) + "\" cy=\"" + cy + "\" rx=\"" + (rx-2) + "\" ry=\"" + (ry-1) + "\" fill=\"#5a9a2a\"/>";
    }
    if (v === 1) {
      return "<ellipse cx=\"" + cx + "\" cy=\"" + (cy+4) + "\" rx=\"" + rx + "\" ry=\"" + ry + "\" fill=\"#9a8870\"/>"
           + "<ellipse cx=\"" + (cx-2) + "\" cy=\"" + (cy+2) + "\" rx=\"" + (rx*0.5) + "\" ry=\"" + (ry+1) + "\" fill=\"#7a6858\"/>"
           + "<ellipse cx=\"" + (cx+3) + "\" cy=\"" + (cy+2) + "\" rx=\"" + (rx*0.5) + "\" ry=\"" + ry + "\" fill=\"#8a7868\"/>";
    }
    // v === 2: пальма
    return "<ellipse cx=\"" + cx + "\" cy=\"" + (cy+3) + "\" rx=\"" + rx + "\" ry=\"" + ry + "\" fill=\"#d0b070\"/>"
         + "<ellipse cx=\"" + (cx+1) + "\" cy=\"" + (cy+1) + "\" rx=\"" + (rx-3) + "\" ry=\"" + (ry-1) + "\" fill=\"#5a9a2a\"/>"
         + "<line x1=\"" + (cx+2) + "\" y1=\"" + (cy-4) + "\" x2=\"" + cx + "\" y2=\"" + (cy+2) + "\" stroke=\"#7a4820\" stroke-width=\"1.5\"/>"
         + "<ellipse cx=\"" + cx + "\" cy=\"" + (cy-6) + "\" rx=\"4\" ry=\"2.5\" fill=\"#2a7010\" transform=\"rotate(-15," + cx + "," + (cy-6) + ")\"/>";
  }

  if (tier === 2) {
    return "<ellipse cx=\"" + cx + "\" cy=\"" + (cy+5) + "\" rx=\"13\" ry=\"7\" fill=\"#b89050\"/>"
         + "<ellipse cx=\"" + (cx-3) + "\" cy=\"" + cy + "\" rx=\"9\" ry=\"7\" fill=\"#4a8820\"/>"
         + "<ellipse cx=\"" + (cx+4) + "\" cy=\"" + (cy+1) + "\" rx=\"7\" ry=\"6\" fill=\"#3d7818\"/>"
         + "<ellipse cx=\"" + cx + "\" cy=\"" + (cy-4) + "\" rx=\"4\" ry=\"5\" fill=\"#306010\"/>"
         + "<rect x=\"" + (cx-3) + "\" y=\"" + (cy-10) + "\" width=\"6\" height=\"8\" rx=\"1\" fill=\"#8a6848\"/>"
         + "<rect x=\"" + (cx-4) + "\" y=\"" + (cy-12) + "\" width=\"2\" height=\"4\" fill=\"#7a5838\"/>"
         + "<rect x=\"" + cx + "\" y=\"" + (cy-12) + "\" width=\"2\" height=\"4\" fill=\"#7a5838\"/>";
  }

  // tier 3: крепость
  return "<ellipse cx=\"" + cx + "\" cy=\"" + (cy+6) + "\" rx=\"14\" ry=\"6\" fill=\"#a07840\"/>"
       + "<ellipse cx=\"" + cx + "\" cy=\"" + (cy+1) + "\" rx=\"12\" ry=\"8\" fill=\"#3a6818\"/>"
       + "<rect x=\"" + (cx-8) + "\" y=\"" + (cy-9) + "\" width=\"16\" height=\"13\" rx=\"1\" fill=\"#6a5040\"/>"
       + "<rect x=\"" + (cx-9) + "\" y=\"" + (cy-11) + "\" width=\"5\" height=\"6\" fill=\"#6a5040\"/>"
       + "<rect x=\"" + (cx-3) + "\" y=\"" + (cy-11) + "\" width=\"5\" height=\"6\" fill=\"#6a5040\"/>"
       + "<rect x=\"" + (cx+3) + "\" y=\"" + (cy-11) + "\" width=\"5\" height=\"6\" fill=\"#6a5040\"/>"
       + "<rect x=\"" + (cx-9) + "\" y=\"" + (cy-13) + "\" width=\"2\" height=\"3\" fill=\"#7a6050\"/>"
       + "<rect x=\"" + (cx-7) + "\" y=\"" + (cy-13) + "\" width=\"2\" height=\"3\" fill=\"#7a6050\"/>"
       + "<rect x=\"" + (cx-3) + "\" y=\"" + (cy-13) + "\" width=\"2\" height=\"3\" fill=\"#7a6050\"/>"
       + "<rect x=\"" + (cx-1) + "\" y=\"" + (cy-13) + "\" width=\"2\" height=\"3\" fill=\"#7a6050\"/>"
       + "<rect x=\"" + (cx+3) + "\" y=\"" + (cy-13) + "\" width=\"2\" height=\"3\" fill=\"#7a6050\"/>"
       + "<rect x=\"" + (cx+5) + "\" y=\"" + (cy-13) + "\" width=\"2\" height=\"3\" fill=\"#7a6050\"/>";
}

// ── Построение одной ячейки сетки ────────────────────────────

function mapBuildCell(r, c) {
  var key      = r + "-" + c;
  var t        = _mapSectorMap[key];
  var ownerId  = t ? t.owner_clan_id : null;
  var tier     = mapGetTier(r, c);
  var clrColor = ownerId ? mapClanColor(ownerId) : null;
  var border   = clrColor
    ? ("2px solid " + clrColor)
    : ("1.5px solid " + MAP_TIER_RING[tier]);
  var bg       = clrColor ? mapRgba(clrColor, 0.14) : "transparent";

  var coopReq = _mapCoopMap[key];
  if (coopReq) {
    border = "2.5px solid #f0c040";
    bg = mapRgba("#f0c040", 0.08);
  }

  return "<div class=\"map-cell" + (coopReq ? " map-coop" : "") + "\" onclick=\"mapSelectSector(" + r + "," + c + ")\""
    + " style=\"border:" + border + ";background:" + bg + ";\">"
    + "<svg width=\"" + MAP_CELL + "\" height=\"" + MAP_CELL + "\""
    + " viewBox=\"0 0 " + MAP_CELL + " " + MAP_CELL + "\" xmlns=\"http://www.w3.org/2000/svg\">"
    + mapCellSVG(r, c)
    + "</svg></div>";
}

// ── Легенда кланов ───────────────────────────────────────────

function mapBuildClanLegend() {
  var keys = Object.keys(_mapClanMap);
  if (!keys.length) return "";
  var html = "<div style=\"display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;\">";
  keys.forEach(function(cid) {
    var cl    = _mapClanMap[cid];
    var color = mapClanColor(cid);
    html += "<span style=\"display:flex;align-items:center;gap:4px;font-size:11px;\">"
          + "<span style=\"display:inline-block;width:10px;height:10px;border-radius:2px;"
          + "background:" + mapRgba(color, 0.2) + ";border:1.5px solid " + color + ";\"></span>"
          + "<span style=\"color:" + color + ";font-weight:600;\">[" + escapeHtml(cl.tag) + "] " + escapeHtml(cl.name) + "</span>"
          + "</span>";
  });
  return html + "</div>";
}

// ── Строка информации в детали сектора ───────────────────────

function _mapInfoRow(label, value, valColor) {
  return "<div style=\"display:flex;justify-content:space-between;font-size:12px;padding:5px 0;"
    + "border-bottom:1px solid var(--border);\">"
    + "<span style=\"color:var(--text-soft);\">" + label + "</span>"
    + "<span style=\"color:" + valColor + ";font-weight:600;\">" + value + "</span>"
    + "</div>";
}

// ── Налоги: вспомогательные функции ─────────────────────────

// Форматирует оставшееся время в мс → "3ч 24м"
function mapFmtCountdown(ms) {
  var h = Math.floor(ms / 3600000);
  var m = Math.floor((ms % 3600000) / 60000);
  return h + "\u0447 " + m + "\u043c";
}

// Считает готовые секторы и сумму деталей для кнопки «Собрать»
function mapCountReadyTax() {
  var playerClanId = _mapPlayer ? _mapPlayer.clan_id : null;
  if (!playerClanId) return { ready: 0, total: 0, parts: 0 };
  var now = Date.now();
  var ready = 0, total = 0, parts = 0;
  Object.keys(_mapSectorMap).forEach(function(k) {
    var s = _mapSectorMap[k];
    if (s.owner_clan_id !== playerClanId) return;
    total++;
    var last = s.last_tax_collected ? new Date(s.last_tax_collected).getTime() : 0;
    if (!s.last_tax_collected || (now - last) >= 12 * 3600 * 1000) {
      ready++;
      parts += MAP_TIER[s.tier] ? MAP_TIER[s.tier].tax : 0;
    }
  });
  return { ready: ready, total: total, parts: parts };
}

// Ближайший момент следующего сбора (строка "Хч Xм")
function mapNextTaxIn() {
  var playerClanId = _mapPlayer ? _mapPlayer.clan_id : null;
  if (!playerClanId) return "";
  var now = Date.now();
  var soonest = Infinity;
  Object.keys(_mapSectorMap).forEach(function(k) {
    var s = _mapSectorMap[k];
    if (s.owner_clan_id !== playerClanId || !s.last_tax_collected) return;
    var next = new Date(s.last_tax_collected).getTime() + 12 * 3600 * 1000;
    if (next > now && next < soonest) soonest = next;
  });
  return soonest === Infinity ? "" : mapFmtCountdown(soonest - now);
}

// Строит HTML секции налогов (с id="map-tax-section" для точечного обновления)
function mapBuildTaxSection() {
  var playerClanId = _mapPlayer ? _mapPlayer.clan_id : null;
  if (!playerClanId) return "";

  var tx = mapCountReadyTax();
  var html = "<div class=\"card\" id=\"map-tax-section\" style=\"padding:12px 14px;margin-bottom:12px;\">";

  if (tx.total === 0) {
    html += "<div style=\"display:flex;align-items:center;gap:8px;color:var(--text-soft);font-size:13px;\">"
      + ICON_TAX + " \u041d\u0435\u0442 \u0437\u0430\u0445\u0432\u0430\u0447\u0435\u043d\u043d\u044b\u0445 \u0441\u0435\u043a\u0442\u043e\u0440\u043e\u0432</div>";
  } else if (tx.ready === 0) {
    var nextIn = mapNextTaxIn();
    html += "<div style=\"display:flex;align-items:center;justify-content:space-between;\">"
      + "<div style=\"display:flex;align-items:center;gap:8px;\">"
      + ICON_TAX
      + "<div><div style=\"font-size:13px;font-weight:600;\">\u041d\u0430\u043b\u043e\u0433\u0438</div>"
      + "<div style=\"font-size:11px;color:var(--text-soft);\">"
      + tx.total + " \u0441\u0435\u043a\u0442. \u2014 \u0432\u0441\u0435 \u0441\u043e\u0431\u0440\u0430\u043d\u044b</div>"
      + "</div></div>"
      + (nextIn ? "<span style=\"font-size:11px;color:var(--text-soft);\">" + "\u0427\u0435\u0440\u0435\u0437 " + nextIn + "</span>" : "")
      + "</div>";
  } else {
    html += "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;\">"
      + "<div style=\"display:flex;align-items:center;gap:8px;\">"
      + ICON_TAX
      + "<div><div style=\"font-size:13px;font-weight:600;\">\u041d\u0430\u043b\u043e\u0433\u0438</div>"
      + "<div style=\"font-size:11px;color:var(--text-soft);\">"
      + tx.ready + " / " + tx.total + " \u0441\u0435\u043a\u0442\u043e\u0440\u043e\u0432 \u0433\u043e\u0442\u043e\u0432\u043e</div>"
      + "</div></div>"
      + "<button id=\"map-tax-btn\" onclick=\"doCollectTax()\""
      + " style=\"background:var(--btn);color:var(--btn-text);border:none;"
      + "border-radius:var(--radius-sm);padding:8px 14px;font-size:13px;"
      + "font-weight:650;cursor:pointer;font-family:inherit;white-space:nowrap;\">"
      + "+" + tx.parts + " " + ICON_PARTS
      + "</button>"
      + "</div>";
  }

  html += "<div id=\"map-tax-msg\" style=\"min-height:14px;font-size:12px;"
    + "color:var(--accent);text-align:center;margin-top:4px;\"></div>";
  html += "</div>";
  return html;
}

// Перерисовывает только секцию налогов (без перезагрузки всей карты)
function mapRefreshTaxSection() {
  var old = document.getElementById("map-tax-section");
  if (!old) return;
  var tmp = document.createElement("div");
  tmp.innerHTML = mapBuildTaxSection();
  if (tmp.firstChild) old.parentNode.replaceChild(tmp.firstChild, old);
}

// ── Главный рендер ───────────────────────────────────────────

async function renderMapScreen() {
  if (typeof setActiveTab === "function") setActiveTab("battles");
  var app = document.getElementById("app-content");
  if (!app) return;
  var player = getCurrentPlayer();
  if (!player) return;

  app.innerHTML = "<div class=\"card\" style=\"text-align:center;padding:32px;color:var(--text-soft)\">"
    + "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u043a\u0430\u0440\u0442\u0443\u2026</div>";

  try {
    var loaded = await Promise.all([
      fetchPlayerProfileById(player.id),
      fetchActiveFront(),
      fetchPlayerBase(player.id),
    ]);
    _mapPlayer = loaded[0];
    var front  = loaded[1];
    _mapBase   = loaded[2];

    if (!front) {
      app.innerHTML = ""
        // Шапка с кнопкой назад
        + "<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:16px;\">"
        + "<button onclick=\"renderBattle()\" style=\"background:var(--surface-2);border:1px solid var(--border);"
        + "border-radius:var(--radius-sm);padding:8px 12px;font-size:13px;cursor:pointer;"
        + "color:var(--text);font-family:inherit;\">&#8592; \u041d\u0430\u0437\u0430\u0434</button>"
        + "<div style=\"font-size:16px;font-weight:650;\">\u041a\u0430\u0440\u0442\u0430 \u0432\u043e\u0439\u043d\u044b</div>"
        + "</div>"
        // Карточка межсезонья
        + "<div class=\"card\" style=\"text-align:center;padding:32px 24px;\">"
        + "<div style=\"font-size:44px;margin-bottom:14px;\">&#9873;</div>"
        + "<div style=\"font-size:20px;font-weight:700;margin-bottom:8px;\">"
        + "\u041c\u0435\u0436\u0441\u0435\u0437\u043e\u043d\u044c\u0435</div>"
        + "<div style=\"font-size:14px;color:var(--text-soft);line-height:1.6;margin-bottom:20px;\">"
        + "\u0421\u0435\u0437\u043e\u043d \u0437\u0430\u0432\u0435\u0440\u0448\u0451\u043d.<br>"
        + "\u0422\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u0438 \u0431\u0443\u0434\u0443\u0442 \u043e\u0431\u043d\u0443\u043b\u0435\u043d\u044b \u043f\u0435\u0440\u0435\u0434 \u043d\u043e\u0432\u044b\u043c \u0441\u0435\u0437\u043e\u043d\u043e\u043c.<br>"
        + "\u0421\u043b\u0435\u0434\u0438\u0442\u0435 \u0437\u0430 \u0430\u043d\u043e\u043d\u0441\u043e\u043c \u0432 \u0447\u0430\u0442\u0435.</div>"
        + "<div style=\"background:var(--surface-2);border-radius:var(--radius-sm);"
        + "padding:12px 16px;font-size:12px;color:var(--text-soft);line-height:1.5;\">"
        + "&#9876; PvP-\u0431\u0438\u0442\u0432\u044b \u0440\u0430\u0431\u043e\u0442\u0430\u044e\u0442 \u0432 \u043e\u0431\u044b\u0447\u043d\u043e\u043c \u0440\u0435\u0436\u0438\u043c\u0435"
        + "</div>"
        + "</div>";
      return;
    }
    _mapFront = front;

    var territories = await fetchTerritories(front.id);

    // Собираем уникальные clan_id
    var clanIds = [];
    territories.forEach(function(t) {
      if (t.owner_clan_id && clanIds.indexOf(t.owner_clan_id) < 0) {
        clanIds.push(t.owner_clan_id);
      }
    });

    var [clans, coopReqs] = await Promise.all([
      fetchClansByIds(clanIds),
      (_mapPlayer && _mapPlayer.clan_id)
        ? fetchCoopRequests(front.id, _mapPlayer.clan_id)
        : Promise.resolve([]),
    ]);
    _mapClanMap = {};
    clans.forEach(function(cl) { _mapClanMap[cl.id] = cl; });
    _mapCoopMap = {};
    coopReqs.forEach(function(req) {
      _mapCoopMap[req.row_idx + "-" + req.col_idx] = req;
    });

    _mapSectorMap = {};
    territories.forEach(function(t) {
      _mapSectorMap[t.row_idx + "-" + t.col_idx] = t;
    });

    mapInjectCSS();
    _renderMapUI(app, front);
  } catch (e) {
    app.innerHTML = "<div class=\"card\" style=\"text-align:center;padding:32px;color:var(--accent)\">"
      + "\u041e\u0448\u0438\u0431\u043a\u0430: " + escapeHtml(e.message) + "</div>";
  }
}

function _renderMapUI(app, front) {
  // Строим сетку с осями: первый столбец — номера строк, первая строка — буквы столбцов
  // Сетка: 15 × 15 = (1 угол + 14 заголовков) + (14 строк × (1 номер + 14 ячеек))
  var LABEL_W = 20; // ширина столбца с номерами строк
  var elements = [];

  // ── Первая строка: пустой угол + буквы A–N ──
  elements.push("<div style=\"width:" + LABEL_W + "px;height:18px;\"></div>");
  for (var ci = 0; ci < MAP_GRID; ci++) {
    elements.push("<div style=\"width:" + MAP_CELL + "px;height:18px;display:flex;align-items:center;"
      + "justify-content:center;font-size:9px;font-weight:700;color:rgba(255,255,255,.55);\">"
      + String.fromCharCode(65 + ci) + "</div>");
  }

  // ── Строки данных: номер строки + 14 ячеек ──
  for (var r = 0; r < MAP_GRID; r++) {
    elements.push("<div style=\"width:" + LABEL_W + "px;height:" + MAP_CELL + "px;display:flex;align-items:center;"
      + "justify-content:center;font-size:9px;font-weight:700;color:rgba(255,255,255,.55);\">"
      + (r + 1) + "</div>");
    for (var c = 0; c < MAP_GRID; c++) {
      elements.push(mapBuildCell(r, c));
    }
  }

  // Легенда тиров
  var tierLegend = "<div style=\"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;\">"
    + [1, 2, 3].map(function(t) {
        return "<span style=\"display:flex;align-items:center;gap:3px;font-size:10px;color:"
          + MAP_TIER_RING[t] + ";\">"
          + "<span style=\"display:inline-block;width:9px;height:9px;border-radius:2px;"
          + "border:1.5px solid " + MAP_TIER_RING[t] + ";\"></span>"
          + "\u0422\u0438\u0440 " + t + " \u2014 " + MAP_TIER[t].label + "</span>";
      }).join("")
    + "</div>";

  // Подсчёт захваченных
  var owned = 0;
  Object.keys(_mapSectorMap).forEach(function(k) {
    if (_mapSectorMap[k].owner_clan_id) owned++;
  });
  var total = MAP_GRID * MAP_GRID;

  // Размер сетки: 1 столбец меток + 14 столбцов ячеек
  var gridCols = LABEL_W + "px repeat(" + MAP_GRID + "," + MAP_CELL + "px)";

  // Токены в шапке
  var tokensLeft = _mapBase ? (_mapBase.attack_tokens != null ? _mapBase.attack_tokens : 2) : "?";
  var tokensHtml = "<span style=\"font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;"
    + (tokensLeft > 0 ? "background:var(--accent-soft);color:var(--accent);" : "background:var(--surface-2);color:var(--text-soft);") + "\">"
    + ICON_TOKEN + " " + tokensLeft + " / 2</span>";

  app.innerHTML = ""

    // ── Шапка ──
    + "<div style=\"display:flex;align-items:center;gap:8px;margin-bottom:12px;\">"
    + "<button onclick=\"renderBattle()\" style=\"background:var(--surface-2);border:1px solid var(--border);"
    + "border-radius:var(--radius-sm);padding:8px 12px;font-size:13px;cursor:pointer;"
    + "color:var(--text);font-family:inherit;\">&#8592; \u041d\u0430\u0437\u0430\u0434</button>"
    + "<div style=\"font-size:16px;font-weight:650;\">\u041a\u0430\u0440\u0442\u0430 \u0432\u043e\u0439\u043d\u044b</div>"
    + "<div style=\"margin-left:auto;display:flex;gap:6px;align-items:center;\">"
    + "<span style=\"background:var(--accent-soft);color:var(--accent);font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;\">"
    + escapeHtml(front.name) + "</span>"
    + tokensHtml
    + "</div></div>"

    // ── Легенды ──
    + tierLegend
    + mapBuildClanLegend()

    // ── Карта с осями ──
    + "<div style=\"overflow-x:auto;-webkit-overflow-scrolling:touch;"
    + "border-radius:var(--radius-sm);margin-bottom:8px;\">"
    + "<div style=\"display:grid;grid-template-columns:" + gridCols + ";"
    + "gap:" + MAP_GAP + "px;padding:10px;width:fit-content;"
    + "background-image:repeating-linear-gradient(-50deg,rgba(255,255,255,.035) 0,"
    + "rgba(255,255,255,.035) 1px,transparent 1px,transparent 18px);"
    + "background-color:#0b5899;"
    + "animation:mapWave 8s linear infinite;\">"
    + elements.join("")
    + "</div></div>"

    // ── Статистика ──
    + "<div style=\"font-size:10px;color:var(--text-soft);text-align:center;margin-bottom:12px;\">"
    + "\u0422\u0438\u0440 1: 96 &nbsp;&middot;&nbsp; \u0422\u0438\u0440 2: 84 &nbsp;&middot;&nbsp; \u0422\u0438\u0440 3: 16 \u0441\u0435\u043a\u0442\u043e\u0440\u043e\u0432"
    + " &nbsp;&middot;&nbsp; \u0417\u0430\u0445\u0432\u0430\u0447\u0435\u043d\u043e: " + owned + " / " + total
    + "</div>"

    + "<div id=\"map-detail\"></div>"
    + mapBuildTaxSection();
}

// ── Детальный просмотр сектора ───────────────────────────────

function mapSelectSector(r, c) {
  var key       = r + "-" + c;
  var territory = _mapSectorMap[key] || null;
  var ownerId   = territory ? territory.owner_clan_id : null;
  var clanData  = ownerId ? _mapClanMap[ownerId] : null;
  var tier      = mapGetTier(r, c);
  var ti        = MAP_TIER[tier];
  var clanColor = ownerId ? mapClanColor(ownerId) : null;
  var playerClanId = _mapPlayer ? _mapPlayer.clan_id : null;
  var tokensLeft   = _mapBase ? (_mapBase.attack_tokens != null ? _mapBase.attack_tokens : 2) : 0;
  var glbUrl = MAP_GLB_CDN + ti.glb;  // реальные модели (текстуры загружены)

  // ── Логика кнопки захвата ──────────────────────────────────
  var coord = mapCoord(r, c);
  var clanSectorCount = Object.keys(_mapSectorMap).filter(function(k) {
    return _mapSectorMap[k].owner_clan_id === playerClanId;
  }).length;
  var isFirstTerritory = playerClanId && clanSectorCount === 0;
  var isEdge = Math.min(r, MAP_GRID - 1 - r, c, MAP_GRID - 1 - c) === 0;
  var isFreeFirstLanding = isFirstTerritory && isEdge && !ownerId;

  var neighbors4 = [{r:r-1,c:c},{r:r+1,c:c},{r:r,c:c-1},{r:r,c:c+1}];
  var hasAdjacent = neighbors4.some(function(n) {
    return n.r >= 0 && n.r < MAP_GRID && n.c >= 0 && n.c < MAP_GRID
      && _mapSectorMap[n.r+"-"+n.c] && _mapSectorMap[n.r+"-"+n.c].owner_clan_id === playerClanId;
  });

  var canCapture = false;
  var btnLabel, btnStyle, btnHint = "";

  if (!playerClanId) {
    btnLabel = "\u041d\u0443\u0436\u0435\u043d \u043a\u043b\u0430\u043d";
    btnStyle = "background:var(--surface-2);color:var(--text-soft);cursor:default;";
  } else if (ownerId === playerClanId) {
    btnLabel = "\u0412\u0430\u0448 \u0441\u0435\u043a\u0442\u043e\u0440";
    btnStyle = "background:var(--surface-2);color:var(--text-soft);cursor:default;";
  } else if (isFreeFirstLanding) {
    canCapture = true;
    btnLabel = "\u0417\u0430\u0445\u0432\u0430\u0442\u0438\u0442\u044c (\u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u043e!)";
    btnStyle = "background:#287838;color:#fff;cursor:pointer;";
    btnHint = "\u041f\u0435\u0440\u0432\u0430\u044f \u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u044f \u2014 \u043f\u043e\u0434\u0430\u0440\u043e\u043a!";
  } else if (!hasAdjacent) {
    btnLabel = "\u041d\u0435\u0442 \u0441\u043c\u0435\u0436\u043d\u043e\u0433\u043e \u0441\u0435\u043a\u0442\u043e\u0440\u0430";
    btnStyle = "background:var(--surface-2);color:var(--text-soft);cursor:default;";
    btnHint = "\u0417\u0430\u0445\u0432\u0430\u0442\u0438\u0442\u0435 \u0441\u043e\u0441\u0435\u0434\u043d\u0438\u0439 \u0441\u0435\u043a\u0442\u043e\u0440 \u0441\u043d\u0430\u0447\u0430\u043b\u0430";
  } else if (tokensLeft <= 0) {
    btnLabel = "\u041d\u0435\u0442 \u0442\u043e\u043a\u0435\u043d\u043e\u0432";
    btnStyle = "background:var(--surface-2);color:var(--text-soft);cursor:default;";
    btnHint = "\u0421\u0431\u0440\u043e\u0441 \u0432 \u043f\u043e\u043b\u043d\u043e\u0447\u044c UTC";
  } else {
    canCapture = true;
    if (ownerId) {
      btnLabel = "&#9876; \u0410\u0442\u0430\u043a\u043e\u0432\u0430\u0442\u044c (\u2212" + ICON_TOKEN + "1)";
      btnStyle = "background:#b84030;color:#fff;cursor:pointer;";
    } else {
      btnLabel = "\u0417\u0430\u0445\u0432\u0430\u0442\u0438\u0442\u044c (\u2212" + ICON_TOKEN + "1)";
      btnStyle = "background:#287838;color:#fff;cursor:pointer;";
    }
  }

  var ownerHtml = clanData
    ? "<span style=\"color:" + clanColor + ";\">[" + escapeHtml(clanData.tag) + "] " + escapeHtml(clanData.name) + "</span>"
    : "\u041d\u0435\u0439\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439";

  // Статус налога (только для своих секторов)
  var taxRow = "";
  if (ownerId === playerClanId && territory) {
    var now2 = Date.now();
    var lastTax = territory.last_tax_collected ? new Date(territory.last_tax_collected).getTime() : 0;
    var taxReady = !territory.last_tax_collected || (now2 - lastTax) >= 12 * 3600 * 1000;
    if (taxReady) {
      taxRow = _mapInfoRow(
        ICON_TAX + " \u041d\u0430\u043b\u043e\u0433",
        "<span style=\"color:#3a8a2a;font-weight:600;\">"
          + ti.tax + " " + ICON_PARTS + " \u2014 \u0413\u043e\u0442\u043e\u0432!</span>",
        "#3a8a2a"
      );
    } else {
      var remaining2 = (lastTax + 12 * 3600 * 1000) - now2;
      taxRow = _mapInfoRow(
        ICON_TAX + " \u041d\u0430\u043b\u043e\u0433",
        ti.tax + " " + ICON_PARTS + " \u2014 \u0447\u0435\u0440\u0435\u0437 " + mapFmtCountdown(remaining2),
        "var(--text-soft)"
      );
    }
  }

  // ── Кооп: текущее состояние для этого сектора ────────────────
  var coopReq      = _mapCoopMap[key] || null;
  var coopExpired  = coopReq && (Date.now() - new Date(coopReq.created_at).getTime() > 24 * 3600 * 1000);
  var isInitiator  = coopReq && coopReq.initiator_id === (_mapPlayer ? _mapPlayer.id : null);
  var isJoiner     = coopReq && !isInitiator && playerClanId === coopReq.clan_id;

  var btnTag = canCapture
    ? "<button id=\"map-capture-btn\" onclick=\"doCapture(" + r + "," + c + ")\" style=\"width:100%;padding:11px;"
      + "border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:650;font-family:inherit;" + btnStyle + "\">"
      + btnLabel + "</button>"
    : "<button disabled style=\"width:100%;padding:11px;border:none;border-radius:var(--radius-sm);"
      + "font-size:13px;font-weight:650;font-family:inherit;" + btnStyle + "\">"
      + btnLabel + "</button>";

  // Кооп-блок (показывается ниже основной кнопки)
  var coopBlock = "";
  if (coopReq && !coopExpired) {
    if (isInitiator) {
      coopBlock = "<div style=\"margin-top:8px;padding:10px;background:rgba(240,192,64,.1);"
        + "border:1px solid rgba(240,192,64,.35);border-radius:var(--radius-sm);text-align:center;\">"
        + "<div style=\"font-size:12px;color:#c8a030;margin-bottom:6px;\">"
        + "&#8987; \u041e\u0436\u0438\u0434\u0430\u0435\u043c \u0441\u043e\u044e\u0437\u043d\u0438\u043a\u0430\u2026</div>"
        + "<button onclick=\"doCancelCoop(" + r + "," + c + ")\" style=\"background:var(--surface-2);"
        + "border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 14px;"
        + "font-size:12px;cursor:pointer;font-family:inherit;color:var(--text-soft);\">"
        + "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u043a\u043e\u043e\u043f</button>"
        + "</div>";
    } else if (isJoiner) {
      coopBlock = "<div style=\"margin-top:8px;\">"
        + "<button id=\"map-coop-join-btn\" onclick=\"doJoinCoop(" + r + "," + c + ")\" "
        + "style=\"width:100%;padding:10px;border:none;border-radius:var(--radius-sm);"
        + "background:#c8a030;color:#fff;font-size:13px;font-weight:650;cursor:pointer;font-family:inherit;"
        + "display:flex;align-items:center;justify-content:center;gap:6px;\">"
        + "&#9876; \u041f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0438\u0442\u044c\u0441\u044f (\u2212" + ICON_TOKEN + "1)</button>"
        + "<div style=\"text-align:center;font-size:10px;color:var(--text-soft);margin-top:3px;\">"
        + "\u041a\u043e\u043e\u043f: \u043c\u043e\u0449\u044c \u043e\u0431\u043e\u0438\u0445 \u0438\u0433\u0440\u043e\u043a\u043e\u0432 \u0441\u043b\u043e\u0436\u0438\u0442\u0441\u044f</div>"
        + "</div>";
    }
  } else if (canCapture && !isFreeFirstLanding && playerClanId) {
    // Предложение начать кооп (только если секторов нет — иначе кооп не нужен на первый захват)
    coopBlock = "<div style=\"margin-top:8px;\">"
      + "<button onclick=\"doInitiateCoop(" + r + "," + c + ")\" "
      + "style=\"width:100%;padding:9px;border:1px solid rgba(240,192,64,.4);border-radius:var(--radius-sm);"
      + "background:transparent;color:#c8a030;font-size:12px;cursor:pointer;font-family:inherit;\">"
      + "&#9872; \u0421\u043e\u0432\u043c\u0435\u0441\u0442\u043d\u0430\u044f \u0430\u0442\u0430\u043a\u0430</button>"
      + "</div>";
  }

  var html = "<div class=\"card\" style=\"padding:14px;\">"

    + "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;\">"
    + "<div><span style=\"font-size:20px;font-weight:700;color:var(--text);font-family:monospace;\">"
    + coord + "</span>"
    + "<span style=\"font-size:12px;color:" + MAP_TIER_RING[tier] + ";font-weight:600;margin-left:8px;\">"
    + "\u0422\u0438\u0440 " + tier + " \u2014 " + ti.label + "</span></div>"
    + "</div>"

    + "<model-viewer src=\"" + glbUrl + "\""
    + " auto-rotate auto-rotate-delay=\"500\" rotation-per-second=\"15deg\""
    + " camera-controls loading=\"lazy\" environment-image=\"neutral\""
    + " style=\"width:100%;height:180px;background:#0d1e30;"
    + "border-radius:var(--radius-sm);display:block;margin-bottom:12px;\"></model-viewer>"

    + "<div style=\"margin-bottom:14px;\">"
    + _mapInfoRow("\u0413\u0430\u0440\u043d\u0438\u0437\u043e\u043d", ti.garrison + " \u0435\u0434.", "var(--text)")
    + _mapInfoRow("\u041d\u0430\u043b\u043e\u0433", ti.tax + " " + ICON_PARTS + "/12\u0447", "var(--text)")
    + _mapInfoRow("\u0412\u043b\u0430\u0434\u0435\u043b\u0435\u0446", ownerHtml, clanColor || "var(--text-soft)")
    + taxRow
    + "</div>"

    + btnTag
    + coopBlock
    + (btnHint ? "<div style=\"text-align:center;font-size:10px;color:var(--text-soft);margin-top:4px;\">" + btnHint + "</div>" : "")
    + "<div id=\"map-capture-err\" style=\"min-height:14px;font-size:12px;color:#e05252;text-align:center;margin-top:6px;\"></div>"
    + "</div>";

  var det = document.getElementById("map-detail");
  if (!det) return;
  det.innerHTML = html;
  det.scrollIntoView({ behavior: "smooth", block: "nearest" });

  // Запускаем GLB-анимацию если она есть (building-watermill анимированная)
  var mv = det.querySelector("model-viewer");
  if (mv) {
    mv.addEventListener("load", function() {
      if (mv.availableAnimations && mv.availableAnimations.length > 0) {
        mv.play({ repetitions: Infinity });
      }
    });
  }
}

// ── Захват территории ────────────────────────────────────────

async function doCapture(r, c) {
  var player = getCurrentPlayer();
  if (!player) return;
  var btn = document.getElementById("map-capture-btn");
  var errEl = document.getElementById("map-capture-err");
  if (btn) { btn.disabled = true; btn.textContent = "\u0410\u0442\u0430\u043a\u0443\u0435\u043c\u2026"; }
  if (errEl) errEl.textContent = "";
  try {
    var result = await captureTerritory(player.id, r, c);
    // Обновляем локальные данные
    if (_mapBase) _mapBase.attack_tokens = result.tokens_remaining;
    if (result.won) {
      var profile = _mapPlayer;
      if (profile && profile.clan_id && _mapSectorMap[r + "-" + c]) {
        _mapSectorMap[r + "-" + c].owner_clan_id = profile.clan_id;
        _mapSectorMap[r + "-" + c].captured_at = new Date().toISOString();
        // Добавим клан в _mapClanMap если его ещё нет
        if (!_mapClanMap[profile.clan_id]) {
          try {
            var myClan = await fetchClanById(profile.clan_id);
            if (myClan) _mapClanMap[myClan.id] = myClan;
          } catch (_) {}
        }
      }
    }
    mapShowCaptureResult(result, r, c);
  } catch (e) {
    // Восстанавливаем панель с сообщением об ошибке
    mapSelectSector(r, c);
    var errEl2 = document.getElementById("map-capture-err");
    if (errEl2) errEl2.textContent = e.message;
  }
}

// ── Экран результата захвата ──────────────────────────────────

function mapShowCaptureResult(result, r, c) {
  var app = document.getElementById("app-content");
  if (!app) return;
  var coord2 = result.coord || mapCoord(r, c);
  var won = result.won;
  var bg  = won ? "var(--accent-soft)" : "var(--surface-2)";
  var tc  = won ? "var(--accent)" : "var(--text-soft)";

  app.innerHTML = "<div class=\"card\" style=\"text-align:center;padding:28px;\">"
    + "<div style=\"font-size:40px;margin-bottom:8px;\">" + (won ? "&#9876;" : "&#10006;") + "</div>"
    + "<div style=\"font-size:22px;font-weight:700;color:" + (won ? "#3a8a2a" : "#a32d2d") + ";margin-bottom:6px;\">"
    + (won
        ? (result.is_free_landing ? "\u041f\u0435\u0440\u0432\u0430\u044f \u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u044f \u2014 " + coord2 + "!" : "\u0421\u0435\u043a\u0442\u043e\u0440 " + coord2 + " \u0437\u0430\u0445\u0432\u0430\u0447\u0435\u043d!")
        : "\u0410\u0442\u0430\u043a\u0430 \u043d\u0430 " + coord2 + " \u043e\u0442\u0431\u0438\u0442\u0430")
    + "</div>"
    + (result.is_free_landing
        ? "<div style=\"font-size:13px;color:var(--text-soft);margin-bottom:18px;\">\u041f\u043e\u0434\u0430\u0440\u043e\u043a \u043d\u043e\u0432\u043e\u043c\u0443 \u043a\u043b\u0430\u043d\u0443 \u2014 \u0431\u0435\u0437 \u0442\u043e\u043a\u0435\u043d\u0430!</div>"
        : "<div style=\"font-size:13px;color:var(--text-soft);margin-bottom:18px;\">"
          + "\u041c\u043e\u0449\u044c: " + result.attacker_power + " vs " + result.defender_power + "</div>")
    + "<div style=\"font-size:12px;color:var(--text-soft);margin-bottom:24px;\">"
    + ICON_TOKEN + " \u041e\u0441\u0442\u0430\u043b\u043e\u0441\u044c \u0442\u043e\u043a\u0435\u043d\u043e\u0432: <b>" + result.tokens_remaining + " / 2</b>"
    + "</div>"
    + "<button onclick=\"renderMapScreen()\" style=\"background:var(--btn);color:var(--btn-text);"
    + "border:none;border-radius:var(--radius-sm);padding:12px 28px;"
    + "font-size:14px;font-weight:650;cursor:pointer;font-family:inherit;\">"
    + "\u041a \u043a\u0430\u0440\u0442\u0435</button>"
    + "</div>";
}

// ── Сбор всех налогов ─────────────────────────────────────────

async function doCollectTax() {
  var player = getCurrentPlayer();
  if (!player) return;

  var btn   = document.getElementById("map-tax-btn");
  var msgEl = document.getElementById("map-tax-msg");
  if (btn) { btn.disabled = true; btn.textContent = "\u0421\u043e\u0431\u0438\u0440\u0430\u0435\u043c\u2026"; }
  if (msgEl) msgEl.innerHTML = "";

  try {
    var result = await collectTax(player.id);

    // Обновляем локальное состояние секторов
    (result.sectors_collected || []).forEach(function(s) {
      var key = s.row_idx + "-" + s.col_idx;
      if (_mapSectorMap[key]) {
        _mapSectorMap[key].last_tax_collected = new Date().toISOString();
      }
    });

    // Перерисовываем секцию налогов
    mapRefreshTaxSection();

    // Показываем сообщение об успехе
    var msg2 = document.getElementById("map-tax-msg");
    if (msg2) {
      msg2.innerHTML = "+" + result.parts_gained + " " + ICON_PARTS
        + " \u0441 " + result.sectors_count + " \u0441\u0435\u043a\u0442\u043e\u0440\u043e\u0432!";
      clearTimeout(msg2._t);
      msg2._t = setTimeout(function() { msg2.innerHTML = ""; }, 3500);
    }

    // Обновляем счётчик деталей в профиле (если он виден)
    var rPartsEl = document.getElementById("r-parts");
    if (rPartsEl && result.new_parts != null) rPartsEl.textContent = result.new_parts;

  } catch (e) {
    mapRefreshTaxSection();
    var msg3 = document.getElementById("map-tax-msg");
    if (msg3) {
      msg3.innerHTML = escapeHtml(e.message);
      msg3.style.color = "#e05252";
    }
  }
}

// ── Кооп-атаки ───────────────────────────────────────────────

async function doInitiateCoop(r, c) {
  var player = getCurrentPlayer();
  if (!player) return;
  var errEl = document.getElementById("map-capture-err");
  if (errEl) errEl.innerHTML = "";
  try {
    var result = await initiateCoop(player.id, r, c);
    // Добавляем в локальный _mapCoopMap чтобы UI обновился
    _mapCoopMap[r + "-" + c] = {
      row_idx: r, col_idx: c,
      initiator_id: player.id,
      clan_id: _mapPlayer ? _mapPlayer.clan_id : null,
      created_at: new Date().toISOString(),
      status: "pending",
    };
    // Перерисовываем панель сектора
    mapSelectSector(r, c);
    var errEl2 = document.getElementById("map-capture-err");
    if (errEl2) {
      errEl2.innerHTML = result.message || "\u0417\u0430\u043f\u0440\u043e\u0441 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d!";
      errEl2.style.color = "var(--accent)";
    }
  } catch (e) {
    if (errEl) { errEl.innerHTML = escapeHtml(e.message); errEl.style.color = "#e05252"; }
  }
}

async function doJoinCoop(r, c) {
  var player = getCurrentPlayer();
  if (!player) return;
  var btn = document.getElementById("map-coop-join-btn");
  var errEl = document.getElementById("map-capture-err");
  if (btn) { btn.disabled = true; btn.textContent = "\u0410\u0442\u0430\u043a\u0443\u0435\u043c\u2026"; }
  if (errEl) errEl.innerHTML = "";
  try {
    var result = await joinCoop(player.id, r, c, "join");
    // Обновляем локальные данные
    if (_mapBase) _mapBase.attack_tokens = result.tokens_remaining;
    delete _mapCoopMap[r + "-" + c];
    if (result.won && _mapPlayer && _mapPlayer.clan_id) {
      var key = r + "-" + c;
      if (_mapSectorMap[key]) {
        _mapSectorMap[key].owner_clan_id = _mapPlayer.clan_id;
        _mapSectorMap[key].captured_at = new Date().toISOString();
      }
      if (!_mapClanMap[_mapPlayer.clan_id]) {
        try {
          var myClan = await fetchClanById(_mapPlayer.clan_id);
          if (myClan) _mapClanMap[myClan.id] = myClan;
        } catch (_) {}
      }
    }
    mapShowCaptureResult(result, r, c);
  } catch (e) {
    mapSelectSector(r, c);
    var errEl2 = document.getElementById("map-capture-err");
    if (errEl2) { errEl2.innerHTML = escapeHtml(e.message); errEl2.style.color = "#e05252"; }
  }
}

async function doCancelCoop(r, c) {
  var player = getCurrentPlayer();
  if (!player) return;
  var errEl = document.getElementById("map-capture-err");
  if (errEl) errEl.innerHTML = "";
  try {
    await joinCoop(player.id, r, c, "cancel");
    delete _mapCoopMap[r + "-" + c];
    mapSelectSector(r, c);
    var errEl2 = document.getElementById("map-capture-err");
    if (errEl2) {
      errEl2.innerHTML = "\u041a\u043e\u043e\u043f \u043e\u0442\u043c\u0435\u043d\u0451\u043d";
      errEl2.style.color = "var(--accent)";
    }
  } catch (e) {
    if (errEl) { errEl.innerHTML = escapeHtml(e.message); errEl.style.color = "#e05252"; }
  }
}
