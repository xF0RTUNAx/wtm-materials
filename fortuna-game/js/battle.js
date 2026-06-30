// ============================================================
//  battle.js — PvP-битвы, составы, госпиталь (Этап 4).
//  Этап 7: раздел «Аркада», фикс составов < 3 войск.
//  Этап 9: тренировочный режим, SVG-иконки, улучшенный handleMgWin.
//  Этап 10: 16 синергий + 12 контр (12 типов войск), подсказки (?)
//  в Лаборатории и Битвах, «вит» → «ХП» в подписях интерфейса.
// ============================================================

var battleTimerInterval  = null;
var currentBattleData    = null; // { base, troops, battles, playerXp, allPlayers }
var lastBattleResult     = null; // { won, xp, parts } — показываем после боя

var ATTACK_COOLDOWN_MS   = 4 * 60 * 60 * 1000;
var HOSPITAL_DURATION_MS = 4 * 60 * 60 * 1000;
var HOSP_UPGRADE_COSTS   = { 1: 1500, 2: 4000 };
var HOSP_VIT_PER_LEVEL   = { 1: 10, 2: 20, 3: 30 };

// ── Аркада — конфигурация мини-игр ─────────────────────────

var MG_GAMES = [
  {
    id: "sea",
    name: "Морской бой",
    desc: "Победи в классическом морском бою против ИИ",
    color: "#4a9eff",
    src: "minigames/sea.html",
    dateField: "mg_sea_date",
  },
  {
    id: "strat",
    name: "Стратег",
    desc: "Проверь свою удачу и стратегическое мышление",
    color: "#c8a020",
    src: "minigames/strat.html",
    dateField: "mg_strat_date",
  },
  {
    id: "arty",
    name: "Артдуэль",
    desc: "Аналог легендарного Worms. Только горизонтально.",
    color: "#e05252",
    src: "minigames/arty.html",
    dateField: "mg_arty_date",
  },
];


// ── Синергии войск ───────────────────────────────────────────
// Отображение на фронтенде (расчёт — на сервере в resolve-battle/capture-territory)
// Этап 10: 16 пар (зеркало SYNERGY_PAIRS из resolve-battle.ts/capture-territory.ts).

var SYNERGY_CFG = [
  { types: ["inf",  "spec"],   atkBonus: 0.12, defBonus: 0,    name: "Штурмовая группа" },
  { types: ["inf",  "tank"],   atkBonus: 0,    defBonus: 0.10, name: "Бронепехота" },
  { types: ["inf",  "arty"],   atkBonus: 0.12, defBonus: 0,    name: "Огневая поддержка" },
  { types: ["spec", "ltank"],  atkBonus: 0.12, defBonus: 0,    name: "Рейдовый отряд" },
  { types: ["spec", "heli"],   atkBonus: 0.15, defBonus: 0,    name: "Воздушный десант" },
  { types: ["bmp",  "ltank"],  atkBonus: 0,    defBonus: 0.12, name: "Мотопехота" },
  { types: ["bmp",  "tank"],   atkBonus: 0,    defBonus: 0.10, name: "Мех. кулак" },
  { types: ["ltank","tank"],   atkBonus: 0,    defBonus: 0.10, name: "Танковый клин" },
  { types: ["taa",  "tank"],   atkBonus: 0,    defBonus: 0.10, name: "Войсковое ПВО" },
  { types: ["taa",  "aa"],     atkBonus: 0,    defBonus: 0.12, name: "Эшелон ПВО" },
  { types: ["arty", "heli"],   atkBonus: 0.12, defBonus: 0,    name: "Корректировка" },
  { types: ["arty", "msl"],    atkBonus: 0.10, defBonus: 0,    name: "Огневой шквал" },
  { types: ["msl",  "rfleet"], atkBonus: 0.12, defBonus: 0,    name: "Залп флота" },
  { types: ["rfleet","avia"],  atkBonus: 0.10, defBonus: 0,    name: "Морская авиация" },
  { types: ["avia", "aa"],     atkBonus: 0.10, defBonus: 0,    name: "Возд. превосходство" },
  { types: ["msl",  "avia"],   atkBonus: 0.12, defBonus: 0,    name: "Ударный кулак" },
];

// ── Контры войск ─────────────────────────────────────────────
// Клиентская копия COUNTER_REDUCTIONS из resolve-battle.ts/capture-territory.ts.
// Используется ТОЛЬКО для подсказки (#modal-battle-help) — реальный расчёт
// контр всегда выполняется на сервере. Не показывается в редакторе составов
// (намеренно, см. SYNERGY_GUIDE.md), но доступна тем, кто хочет разобраться
// в механике подробно через кнопку «?» на экране Битв.
var COUNTER_CFG = {
  inf:    { bmp: 0.15 },
  spec:   { arty: 0.25, msl: 0.20 },
  bmp:    { inf: 0.15, spec: 0.15 },
  ltank:  { inf: 0.20, spec: 0.20 },
  tank:   { bmp: 0.20, ltank: 0.20, inf: 0.10 },
  taa:    { heli: 0.30, avia: 0.15 },
  arty:   { tank: 0.20, bmp: 0.15, inf: 0.10 },
  heli:   { tank: 0.25, ltank: 0.25, bmp: 0.20 },
  aa:     { avia: 0.25, heli: 0.20 },
  msl:    { aa: 0.30, taa: 0.25 },
  rfleet: { arty: 0.25, aa: 0.15 },
  avia:   { arty: 0.20, inf: 0.20, rfleet: 0.20 },
};

// Возвращает HTML-бейджи активных синергий (или "" если нет)
function synergyBadgesHtml(lineup, isAtk) {
  var active = SYNERGY_CFG.filter(function(s) {
    return s.types.every(function(t) { return lineup.includes(t); })
      && (isAtk ? s.atkBonus > 0 : s.defBonus > 0);
  });
  if (!active.length) return "";
  return "<div style=\"display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;\">"
    + active.map(function(s) {
        var pct   = isAtk ? Math.round(s.atkBonus * 100) : Math.round(s.defBonus * 100);
        var label = isAtk
          ? "+" + pct + "% \u0430\u0442\u0430\u043a\u0430"
          : "+" + pct + "% \u0437\u0430\u0449\u0438\u0442\u0430";
        return "<div style=\"background:var(--accent-soft);color:var(--accent);"
          + "border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700;\">"
          + "&#9889; " + s.name + " " + label + "</div>";
      }).join("")
    + "</div>";
}

// Кнопка-подсказка «?» рядом с заголовком «Атака».
// Открывает модалку #modal-battle-help с полным справочником по
// синергиям, контрам и механике боя (генерируется динамически из
// SYNERGY_CFG / COUNTER_CFG, чтобы никогда не разойтись с реальным
// балансом при будущей калибровке).
function battleHelpBtn() {
  return '<button onclick="openBattleHelpModal()" title="Синергии, контры и механика боя"'
    + ' style="margin-left:6px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);'
    + 'border-radius:50%;width:20px;height:20px;display:inline-flex;align-items:center;'
    + 'justify-content:center;font-size:11px;font-weight:700;color:var(--btn-text);'
    + 'cursor:pointer;flex-shrink:0;vertical-align:middle;font-family:inherit;">?</button>';
}

function openBattleHelpModal() {
  var body = document.getElementById("battle-help-modal-body");
  if (body) body.innerHTML = buildBattleHelpHtml();
  if (typeof openModal === "function") openModal("battle-help");
}

function buildBattleHelpHtml() {
  var troopName = function(t) { return (TROOP_CFG[t] && TROOP_CFG[t].name) || t; };

  var synergyRows = SYNERGY_CFG.map(function(s) {
    var isAtk = s.atkBonus > 0;
    var pct   = isAtk ? s.atkBonus : s.defBonus;
    var label = isAtk ? "+" + Math.round(pct * 100) + "% \u0430\u0442\u0430\u043a\u0430"
                       : "+" + Math.round(pct * 100) + "% \u0437\u0430\u0449\u0438\u0442\u0430";
    return "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;"
      + "padding:7px 0;border-bottom:1px solid var(--border);\">"
      + "<div style=\"font-size:12.5px;color:var(--text);\">"
      + "<strong>" + escapeHtml(s.name) + "</strong><br>"
      + "<span style=\"color:var(--text-soft);font-size:11.5px;\">"
      + escapeHtml(troopName(s.types[0])) + " + " + escapeHtml(troopName(s.types[1])) + "</span></div>"
      + "<span style=\"flex-shrink:0;background:var(--accent-soft);color:var(--accent);"
      + "border-radius:8px;padding:3px 9px;font-size:11px;font-weight:700;white-space:nowrap;\">"
      + label + "</span></div>";
  }).join("");

  var counterRows = TROOP_ORDER.map(function(myType) {
    var targets = COUNTER_CFG[myType];
    if (!targets) return "";
    var targetsHtml = Object.keys(targets).map(function(enemyType) {
      return escapeHtml(troopName(enemyType)) + " &minus;" + Math.round(targets[enemyType] * 100) + "%";
    }).join(", ");
    return "<div style=\"display:flex;align-items:flex-start;justify-content:space-between;gap:8px;"
      + "padding:7px 0;border-bottom:1px solid var(--border);\">"
      + "<span style=\"font-size:12.5px;font-weight:600;color:var(--text);flex-shrink:0;\">"
      + escapeHtml(troopName(myType)) + "</span>"
      + "<span style=\"font-size:11.5px;color:var(--text-soft);text-align:right;\">" + targetsHtml + "</span>"
      + "</div>";
  }).join("");

  return "<h4>&#9881; \u041a\u0430\u043a \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u0431\u043e\u0439</h4>"
    + "<ul>"
    + "<li><strong>\u041c\u043e\u0449\u044c</strong> \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u0442\u0438\u043f\u0430 = \u0432\u0435\u0441 &times; \u0443\u0440\u043e\u0432\u0435\u043d\u044c &times; (\u0425\u041f/100), \u0441\u0443\u043c\u043c\u0438\u0440\u0443\u0435\u0442\u0441\u044f \u043f\u043e 3 \u0442\u0438\u043f\u0430\u043c \u0441\u043e\u0441\u0442\u0430\u0432\u0430.</li>"
    + "<li><strong>\u041a\u043e\u043d\u0442\u0440\u044b</strong> \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u044e\u0442\u0441\u044f \u043f\u0435\u0440\u0432\u044b\u043c\u0438: \u0435\u0441\u043b\u0438 \u0443 \u0432\u0440\u0430\u0433\u0430 \u0435\u0441\u0442\u044c \u0442\u0438\u043f-\u00ab\u043a\u043e\u043d\u0442\u0440\u0430\u0433\u0435\u043d\u0442\u00bb \u043a \u043e\u0434\u043d\u043e\u043c\u0443 \u0438\u0437 \u0432\u0430\u0448\u0438\u0445 \u0442\u0438\u043f\u043e\u0432, \u043c\u043e\u0449\u044c \u044d\u0442\u043e\u0433\u043e \u0442\u0438\u043f\u0430 \u0441\u043d\u0438\u0436\u0430\u0435\u0442\u0441\u044f.</li>"
    + "<li><strong>\u0421\u0438\u043d\u0435\u0440\u0433\u0438\u0438</strong> \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u044e\u0442\u0441\u044f \u0432\u0442\u043e\u0440\u044b\u043c\u0438: \u0438\u0442\u043e\u0433\u043e\u0432\u0430\u044f \u0441\u0443\u043c\u043c\u0430 \u043c\u043e\u0449\u0438 \u0443\u043c\u043d\u043e\u0436\u0430\u0435\u0442\u0441\u044f \u043d\u0430 \u0431\u043e\u043d\u0443\u0441 \u0437\u0430 \u043a\u0430\u0436\u0434\u0443\u044e \u0430\u043a\u0442\u0438\u0432\u043d\u0443\u044e \u043f\u0430\u0440\u0443 \u0438\u0437 \u0441\u043f\u0438\u0441\u043a\u0430 \u043d\u0438\u0436\u0435 (\u0431\u043e\u043d\u0443\u0441\u044b \u0441\u0442\u0435\u043a\u0430\u044e\u0442\u0441\u044f).</li>"
    + "<li>\u0418\u0442\u043e\u0433\u043e\u0432\u0430\u044f \u043c\u043e\u0449\u044c \u0430\u0442\u0430\u043a\u0438 \u043f\u043e\u043b\u0443\u0447\u0430\u0435\u0442 \u0441\u043b\u0443\u0447\u0430\u0439\u043d\u044b\u0439 \u0440\u0430\u0437\u0431\u0440\u043e\u0441 &plusmn;15% \u0438 \u0441\u0440\u0430\u0432\u043d\u0438\u0432\u0430\u0435\u0442\u0441\u044f \u0441 \u043c\u043e\u0449\u044c\u044e \u0437\u0430\u0449\u0438\u0442\u044b.</li>"
    + "<li>\u041f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u044c \u043f\u043e\u043b\u0443\u0447\u0430\u0435\u0442 XP \u0438 \u0447\u0430\u0441\u0442\u044c \u0414\u0435\u0442\u0430\u043b\u0435\u0439 \u043f\u0440\u043e\u0438\u0433\u0440\u0430\u0432\u0448\u0435\u0433\u043e; \u0432\u043e\u0439\u0441\u043a\u0430 \u043e\u0431\u0435\u0438\u0445 \u0441\u0442\u043e\u0440\u043e\u043d \u0442\u0435\u0440\u044f\u044e\u0442 \u0425\u041f (\u0431\u043e\u043b\u044c\u0448\u0435 \u2014 \u0443 \u043f\u0440\u043e\u0438\u0433\u0440\u0430\u0432\u0448\u0435\u0433\u043e).</li>"
    + "</ul>"
    + "<h4>&#9889; \u0421\u0438\u043d\u0435\u0440\u0433\u0438\u0438 (" + SYNERGY_CFG.length + ")</h4>"
    + "<p style=\"margin-bottom:6px;\">\u0410\u043a\u0442\u0438\u0432\u0438\u0440\u0443\u044e\u0442\u0441\u044f, \u0435\u0441\u043b\u0438 \u043e\u0431\u0430 \u0442\u0438\u043f\u0430 \u043f\u0440\u0438\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044e\u0442 \u0432 \u043e\u0434\u043d\u043e\u043c \u0441\u043e\u0441\u0442\u0430\u0432\u0435. \u0411\u043e\u043d\u0443\u0441\u044b \u0441\u0443\u043c\u043c\u0438\u0440\u0443\u044e\u0442\u0441\u044f.</p>"
    + synergyRows
    + "<h4 style=\"margin-top:18px;\">&#9876; \u041a\u043e\u043d\u0442\u0440\u044b</h4>"
    + "<p style=\"margin-bottom:6px;\">\u0415\u0441\u043b\u0438 \u0443 \u0432\u0430\u0441 \u0432 \u0441\u043e\u0441\u0442\u0430\u0432\u0435 \u0435\u0441\u0442\u044c \u0442\u0438\u043f \u0438\u0437 \u043b\u0435\u0432\u043e\u0439 \u043a\u043e\u043b\u043e\u043d\u043a\u0438, \u043e\u043d \u0441\u043d\u0438\u0436\u0430\u0435\u0442 \u043c\u043e\u0449\u044c \u0443\u043a\u0430\u0437\u0430\u043d\u043d\u044b\u0445 \u0441\u043f\u0440\u0430\u0432\u0430 \u0442\u0438\u043f\u043e\u0432 \u0443 \u043f\u0440\u043e\u0442\u0438\u0432\u043d\u0438\u043a\u0430 (\u0435\u0441\u043b\u0438 \u043e\u043d\u0438 \u0440\u0435\u0430\u043b\u044c\u043d\u043e \u0435\u0441\u0442\u044c \u0432 \u0435\u0433\u043e \u0441\u043e\u0441\u0442\u0430\u0432\u0435).</p>"
    + counterRows
    + "<p style=\"margin-top:10px;margin-bottom:0;font-size:11.5px;\">\u041a\u043e\u043d\u0442\u0440\u044b \u043d\u0435 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u044e\u0442\u0441\u044f \u043f\u0440\u044f\u043c\u043e \u0432 \u0440\u0435\u0434\u0430\u043a\u0442\u043e\u0440\u0435 \u0441\u043e\u0441\u0442\u0430\u0432\u043e\u0432 \u2014 \u044d\u0442\u043e \u0441\u0434\u0435\u043b\u0430\u043d\u043e \u043d\u0430\u043c\u0435\u0440\u0435\u043d\u043d\u043e, \u0447\u0442\u043e\u0431\u044b \u043e\u043f\u0442\u0438\u043c\u0430\u043b\u044c\u043d\u044b\u0435 \u0441\u0432\u044f\u0437\u043a\u0438 \u043d\u0430\u0445\u043e\u0434\u0438\u043b\u0438\u0441\u044c \u0447\u0435\u0440\u0435\u0437 \u0431\u043e\u0438, \u0430 \u043d\u0435 \u0447\u0438\u0442\u0430\u043b\u0438\u0441\u044c \u0432 \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0435.</p>";
}

// Проверка: игра уже сыграна сегодня (UTC)
function mgPlayed(base, dateField) {
  if (!base || !base[dateField]) return false;
  var todayUtc = new Date().toISOString().slice(0, 10);
  return String(base[dateField]).slice(0, 10) === todayUtc;
}

function mgAvailCount(base) {
  return MG_GAMES.filter(function(g) { return !mgPlayed(base, g.dateField); }).length;
}

// Аркада-карточка в дашборде
function arcadeCardHtml(base) {
  var avail = mgAvailCount(base);
  var badgeBg  = avail > 0 ? "var(--btn)"      : "var(--surface-2)";
  var badgeTc  = avail > 0 ? "var(--btn-text)" : "var(--text-soft)";
  var dots = MG_GAMES.map(function(g) {
    var done = mgPlayed(base, g.dateField);
    return "<div style=\"flex:1;background:var(--surface-2);border:1px solid var(--border);"
      + "border-radius:var(--radius-sm);padding:6px 4px;text-align:center;\">"
      + "<div style=\"font-size:10px;color:var(--text-soft);margin-bottom:2px;\">" + g.name + "</div>"
      + "<div style=\"font-size:11px;font-weight:650;color:" + (done ? "var(--text-soft)" : "#4a8a3e") + ";\">"
      + (done ? "&#10003;&nbsp;готово" : "&#9679;&nbsp;играть")
      + "</div></div>";
  }).join("");

  return "<div style=\"background:var(--surface-2);border:1px solid var(--border);"
    + "border-left:3px solid var(--accent);border-radius:var(--radius);padding:14px;margin-bottom:14px;\">"
    + "<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;\">"
    + "<div style=\"font-size:14px;font-weight:650;color:var(--text);\">" + ICON_PUZZLE + " Аркада</div>"
    + "<span style=\"background:" + badgeBg + ";color:" + badgeTc + ";"
    + "font-size:11px;font-weight:650;padding:3px 9px;border-radius:20px;\">"
    + avail + " / " + MG_GAMES.length + " сегодня</span>"
    + "</div>"
    + "<div style=\"font-size:12px;color:var(--text-soft);margin-bottom:10px;\">"
    + "Ежедневные мини-игры &mdash; за победу: <b>+50\u00a0" + ICON_PARTS
    + " &#183; +50\u00a0" + ICON_XP + " &#183; +5\u00a0" + ICON_RARE + "</b>"
    + "</div>"
    + "<div style=\"display:flex;gap:6px;margin-bottom:12px;\">" + dots + "</div>"
    + "<button onclick=\"openArcadeModal()\" style=\"width:100%;padding:12px;"
    + "background:var(--btn);color:var(--btn-text);border:none;"
    + "border-radius:var(--radius-sm);font-size:14px;font-weight:650;"
    + "cursor:pointer;font-family:inherit;\">Открыть аркаду</button>"
    + "</div>";
}

// Открыть аркадный модал (снизу, как bottom-sheet)
function openArcadeModal() {
  if (document.getElementById("mg-modal")) return;
  var base = currentBattleData ? currentBattleData.base : {};

  // Скрываем кнопку чата чтобы не перекрывала модал
  var chatRoot = document.getElementById("chat-widget-root");
  if (chatRoot) chatRoot.style.display = "none";

  var gameCards = MG_GAMES.map(function(g) {
    var done = mgPlayed(base, g.dateField);

    // Кнопка «Играть» (за награду, 1/день)
    var playBtn = done
      ? "<button disabled style=\"background:var(--surface-2);color:var(--text-soft);"
        + "border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:650;"
        + "cursor:default;font-family:inherit;\">&#10003; Забрано</button>"
      : "<button onclick=\"launchMiniGame('" + g.id + "')\" style=\"background:" + g.color
        + ";color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;"
        + "font-weight:650;cursor:pointer;font-family:inherit;\">Играть</button>";

    // Кнопка «Тренировка» (без награды, всегда доступна)
    var trainBtn = "<button onclick=\"launchMiniGame('" + g.id + "', true)\" "
      + "style=\"background:var(--surface-2);color:var(--text-soft);"
      + "border:1px solid var(--border);border-radius:8px;padding:6px 10px;"
      + "font-size:11px;font-weight:650;cursor:pointer;font-family:inherit;\">&#127891; Тренировка</button>";

    return "<div style=\"background:var(--surface-2);border:1px solid var(--border);"
      + "border-left:3px solid " + g.color + ";border-radius:var(--radius-sm);"
      + "padding:12px;margin-bottom:8px;\">"
      + "<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;\">"
      + "<div style=\"font-size:13px;font-weight:650;color:var(--text);\">" + g.name + "</div>"
      + "<span style=\"font-size:11px;font-weight:650;color:" + (done ? "var(--text-soft)" : "#4a8a3e") + ";\">"
      + (done ? "&#10003; Сыграно" : "&#9679; Доступно") + "</span>"
      + "</div>"
      + "<div style=\"font-size:11px;color:var(--text-soft);margin-bottom:9px;\">" + g.desc + "</div>"
      + "<div style=\"display:flex;align-items:center;justify-content:space-between;gap:8px;\">"
      + "<span style=\"font-size:11px;color:var(--text-soft);opacity:" + (done ? ".5" : "1") + ";\">"
      + "+50 " + ICON_PARTS + " &#183; +50 " + ICON_XP + " &#183; +5 " + ICON_RARE + "</span>"
      + "<div style=\"display:flex;gap:5px;flex-shrink:0;\">" + trainBtn + playBtn + "</div>"
      + "</div></div>";
  }).join("");

  var modal = document.createElement("div");
  modal.id = "mg-modal";
  modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:400;"
    + "background:rgba(0,0,0,0.65);display:flex;align-items:flex-end;justify-content:center;";
  modal.innerHTML = "<div style=\"background:var(--bg);width:100%;max-width:600px;"
    + "border-radius:16px 16px 0 0;padding:20px 16px;max-height:92vh;overflow-y:auto;\">"
    + "<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;\">"
    + "<div style=\"font-size:16px;font-weight:650;\">" + ICON_PUZZLE + " Аркада</div>"
    + "<button onclick=\"closeMgModal()\" style=\"background:var(--surface-2);"
    + "border:1px solid var(--border);border-radius:8px;padding:6px 12px;"
    + "font-size:13px;cursor:pointer;font-family:inherit;\">&#10005;</button>"
    + "</div>"
    + "<div style=\"text-align:center;margin-bottom:16px;\">"
    + "<model-viewer src=\"arcade/ticket-machine.glb\""
    + " camera-orbit=\"0deg 70deg 105%\""
    + " auto-rotate auto-rotate-delay=\"800\" rotation-per-second=\"18deg\""
    + " camera-controls"
    + " style=\"width:110px;height:110px;border-radius:13px;"
    + "background:var(--accent-soft);display:inline-block;\""
    + "></model-viewer>"
    + "</div>"
    + gameCards
    + "<div style=\"text-align:center;font-size:11px;color:var(--text-soft);margin-top:6px;\">"
    + "Обновление ежедневно в 00:00 UTC</div>"
    + "</div>";
  document.body.appendChild(modal);

  // Запускаем анимацию GLB-модели после загрузки
  var mv = modal.querySelector("model-viewer");
  if (mv) {
    mv.addEventListener("load", function() {
      try { mv.play({ repetitions: Infinity }); } catch (_) {}
    });
  }
}

function closeMgModal() {
  var el = document.getElementById("mg-modal");
  if (el) el.remove();
  // Возвращаем кнопку чата
  var chatRoot = document.getElementById("chat-widget-root");
  if (chatRoot) chatRoot.style.display = "";
}

// Запустить мини-игру в fullscreen iframe
// isTraining = true → тренировка (без начисления награды и статистики)
function launchMiniGame(gameId, isTraining) {
  window._mgIsTraining = !!isTraining;

  // Убираем модал напрямую (без восстановления чата — он вернётся при закрытии игры)
  var mgModal = document.getElementById("mg-modal");
  if (mgModal) mgModal.remove();

  var game = MG_GAMES.find(function(g) { return g.id === gameId; });
  if (!game) return;

  var overlay = document.createElement("div");
  overlay.id = "mg-overlay";
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;"
    + "z-index:500;background:#000;display:flex;flex-direction:column;";

  // Артдуэль — iframe на весь экран, без шапки.
  // Выход через кнопку «Выйти» внутри самой игры (exitGame).
  if (gameId === "arty") {
    overlay.innerHTML = "<iframe src=\"" + game.src + "\""
      + " style=\"flex:1;border:none;width:100%;height:100%;\""
      + " allow=\"autoplay\"></iframe>";
  } else {
    var trainingLabel = isTraining ? " &nbsp;<span style=\"font-size:10px;opacity:.7;\">\u2014 \u0422\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0430</span>" : "";
    overlay.innerHTML = "<div style=\"display:flex;align-items:center;gap:12px;"
      + "padding:8px 12px;background:rgba(0,0,0,0.85);flex-shrink:0;\">"
      + "<button onclick=\"closeMgOverlay()\" style=\"background:rgba(255,255,255,0.12);"
      + "color:#fff;border:1px solid rgba(255,255,255,0.2);border-radius:8px;"
      + "padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit;\">"
      + "&#10005; Выйти</button>"
      + "<span style=\"color:#ccc;font-size:12px;font-family:inherit;\">" + game.name + trainingLabel + "</span>"
      + "</div>"
      + "<iframe src=\"" + game.src + "\" style=\"flex:1;border:none;width:100%;\" allow=\"autoplay\"></iframe>";
  }
  document.body.appendChild(overlay);
}

function closeMgOverlay() {
  window._mgIsTraining = false; // сбрасываем флаг при любом закрытии игры
  var el = document.getElementById("mg-overlay");
  if (el) el.remove();
  // Возвращаем кнопку чата после выхода из игры
  var chatRoot = document.getElementById("chat-widget-root");
  if (chatRoot) chatRoot.style.display = "";
}

// postMessage-листенер для сигналов из iframe мини-игр
if (!window._mgListenerAdded) {
  window._mgListenerAdded = true;
  window.addEventListener("message", function(e) {
    if (!e.data || e.data.type !== "mg_win") return;
    var gameId     = e.data.game;
    var isTraining = !!window._mgIsTraining;
    closeMgOverlay(); // сбрасывает _mgIsTraining
    if (isTraining) {
      showMgTrainingBanner(gameId);
    } else {
      handleMgWin(gameId);
    }
  });
}

async function handleMgWin(gameId) {
  var player = getCurrentPlayer();
  if (!player) return;
  try {
    var result = await claimMinigameReward(player.id, gameId);

    // Обновляем локальный кэш базы
    // EF теперь возвращает parts и rare_materials (новые итоговые значения)
    if (result && currentBattleData && currentBattleData.base) {
      var game = MG_GAMES.find(function(x) { return x.id === gameId; });
      if (game) {
        currentBattleData.base[game.dateField] = new Date().toISOString().slice(0, 10);
      }
      if (result.parts !== undefined) {
        currentBattleData.base.parts = result.parts;
        var rPartsEl = document.getElementById("r-parts");
        if (rPartsEl) rPartsEl.textContent = result.parts;
      }
      if (result.rare_materials !== undefined) {
        currentBattleData.base.rare_materials = result.rare_materials;
      }
    }
    showMgRewardBanner(gameId);
    // Перерисовываем дашборд чтобы обновились статусы
    renderBattleDashboard();
  } catch (e) {
    if (e.message === "already_claimed") return; // тихо, лимит уже исчерпан
    // Показываем ошибку пользователю
    showMgErrorBanner(e.message || "Ошибка начисления награды");
    console.warn("MG reward error:", e.message);
  }
}

function showMgRewardBanner(gameId) {
  var old = document.getElementById("mg-reward-banner");
  if (old) old.remove();
  var game  = MG_GAMES.find(function(x) { return x.id === gameId; });
  var label = game ? game.name : "Мини-игра";
  var banner = document.createElement("div");
  banner.id = "mg-reward-banner";
  banner.style.cssText = "position:fixed;top:60px;left:50%;transform:translateX(-50%);"
    + "z-index:600;background:#e4f0dc;border-radius:12px;padding:14px 20px;"
    + "text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.18);"
    + "max-width:320px;width:90%;pointer-events:none;";
  banner.innerHTML = "<div style=\"font-size:15px;font-weight:650;color:#3a6b2a;margin-bottom:4px;\">"
    + "&#127942; " + label + " &mdash; Победа!</div>"
    + "<div style=\"font-size:13px;color:#3a6b2a;\">"
    + "+50\u00a0" + ICON_PARTS + " &nbsp; +50\u00a0" + ICON_XP + " &nbsp; +5\u00a0" + ICON_RARE
    + "</div>";
  document.body.appendChild(banner);
  setTimeout(function() {
    banner.style.transition = "opacity .5s";
    banner.style.opacity = "0";
  }, 3000);
  setTimeout(function() { if (banner.parentNode) banner.remove(); }, 3600);
}

// Баннер для тренировочной победы (без начисления ресурсов)
function showMgTrainingBanner(gameId) {
  var old = document.getElementById("mg-reward-banner");
  if (old) old.remove();
  var game  = MG_GAMES.find(function(x) { return x.id === gameId; });
  var label = game ? game.name : "Мини-игра";
  var banner = document.createElement("div");
  banner.id = "mg-reward-banner";
  banner.style.cssText = "position:fixed;top:60px;left:50%;transform:translateX(-50%);"
    + "z-index:600;background:var(--surface-2);border:1px solid var(--border);"
    + "border-radius:12px;padding:14px 20px;"
    + "text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.18);"
    + "max-width:320px;width:90%;pointer-events:none;";
  banner.innerHTML = "<div style=\"font-size:15px;font-weight:650;color:var(--text);margin-bottom:4px;\">"
    + "&#127891; " + label + " \u2014 \u0425\u043e\u0440\u043e\u0448\u0430\u044f \u0438\u0433\u0440\u0430!</div>"
    + "<div style=\"font-size:12px;color:var(--text-soft);"
    + "\">\u0420\u0435\u0436\u0438\u043c \u0442\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043a\u0438 \u2014 \u043d\u0430\u0433\u0440\u0430\u0434\u0430 \u043d\u0435 \u043d\u0430\u0447\u0438\u0441\u043b\u044f\u0435\u0442\u0441\u044f</div>";
  document.body.appendChild(banner);
  setTimeout(function() {
    banner.style.transition = "opacity .5s";
    banner.style.opacity = "0";
  }, 3000);
  setTimeout(function() { if (banner.parentNode) banner.remove(); }, 3600);
}

// Баннер ошибки начисления награды (помогает диагностировать сбои)
function showMgErrorBanner(msg) {
  var old = document.getElementById("mg-reward-banner");
  if (old) old.remove();
  var banner = document.createElement("div");
  banner.id = "mg-reward-banner";
  banner.style.cssText = "position:fixed;top:60px;left:50%;transform:translateX(-50%);"
    + "z-index:600;background:#fde8e8;border-radius:12px;padding:14px 20px;"
    + "text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.18);"
    + "max-width:320px;width:90%;pointer-events:none;";
  banner.innerHTML = "<div style=\"font-size:14px;font-weight:650;color:#a32d2d;margin-bottom:4px;\">"
    + "&#9888; \u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0447\u0438\u0441\u043b\u0438\u0442\u044c \u043d\u0430\u0433\u0440\u0430\u0434\u0443</div>"
    + "<div style=\"font-size:11px;color:#a32d2d;\">" + escapeHtml(msg) + "</div>";
  document.body.appendChild(banner);
  setTimeout(function() {
    banner.style.transition = "opacity .5s";
    banner.style.opacity = "0";
  }, 4000);
  setTimeout(function() { if (banner.parentNode) banner.remove(); }, 4600);
}

// ── Таймер ──────────────────────────────────────────────────

function stopBattleTimer() {
  if (battleTimerInterval) { clearInterval(battleTimerInterval); battleTimerInterval = null; }
}

function startBattleTimer() {
  stopBattleTimer();
  battleTimerInterval = setInterval(updateBattleTimers, 15000);
}

function updateBattleTimers() {
  if (!currentBattleData) return;
  var cdEl = document.getElementById("battle-cd-badge");
  if (cdEl) {
    var msLeft = attackCooldownLeft(currentBattleData.base);
    if (msLeft > 0) {
      cdEl.className = "battle-cooldown-badge";
      cdEl.innerHTML = ICON_SWORD + " \u041a\u0443\u043b\u0434\u0430\u0443\u043d: " + formatBattleMs(msLeft);
    } else {
      cdEl.className   = "battle-ready-badge";
      cdEl.textContent = "\u2713 \u0413\u043e\u0442\u043e\u0432 \u043a \u0430\u0442\u0430\u043a\u0435";
      document.querySelectorAll(".atk-btn").forEach(function(b) {
        b.disabled = false;
        b.innerHTML = ICON_SWORD + " \u0410\u0442\u0430\u043a\u043e\u0432\u0430\u0442\u044c";
      });
    }
  }
  (currentBattleData.troops || []).forEach(function(t) {
    if (!t.in_hospital_since) return;
    var el = document.getElementById("hosp-timer-" + t.troop_type);
    if (!el) return;
    var ms = hospitalMsLeft(t);
    if (ms <= 0) {
      el.outerHTML = "<button id=\"hosp-timer-" + t.troop_type
        + "\" class=\"hosp-collect-btn\" onclick=\"doCollectHospital('" + t.troop_type + "')\" "
        + "style=\"background:var(--accent-soft);color:var(--accent);border:none;border-radius:8px;"
        + "padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;"
        + "white-space:nowrap;font-family:inherit;\">\u0417\u0430\u0431\u0440\u0430\u0442\u044c</button>";
    } else {
      el.textContent = "\u23f3 " + formatBattleMs(ms);
    }
  });
}

// ── Утилиты ─────────────────────────────────────────────────

function attackCooldownLeft(base) {
  if (!base || !base.last_attack_at) return 0;
  return Math.max(0, ATTACK_COOLDOWN_MS - (Date.now() - new Date(base.last_attack_at).getTime()));
}

function hospitalMsLeft(troop) {
  if (!troop.in_hospital_since) return 0;
  return Math.max(0, HOSPITAL_DURATION_MS - (Date.now() - new Date(troop.in_hospital_since).getTime()));
}

function formatBattleMs(ms) {
  if (ms <= 0) return "0 \u043c\u0438\u043d";
  var totalMin = Math.ceil(ms / 60000);
  var h = Math.floor(totalMin / 60);
  var m = totalMin % 60;
  if (h > 0 && m > 0) return h + "\u0447 " + m + "\u043c\u0438\u043d";
  if (h > 0) return h + "\u0447";
  return m + " \u043c\u0438\u043d";
}

function vitColor(vit) {
  if (vit >= 80) return "#4a8a3e";
  if (vit >= 50) return "var(--accent)";
  return "#e05252";
}

function troopBadgeBattle(type, size) {
  size = size || 30;
  var cfg = TROOP_CFG[type];
  if (!cfg) return "";
  var src = (typeof TROOP_IMG !== "undefined" && TROOP_IMG[type]) ? TROOP_IMG[type] : "";
  var imgSize = Math.round(size * 0.82);
  return "<div style=\"width:" + size + "px;height:" + size + "px;border-radius:7px;"
    + "background:var(--surface-2);display:flex;align-items:center;justify-content:center;"
    + "flex-shrink:0;overflow:hidden;\">"
    + "<img src=\"" + src + "\" alt=\"\" style=\"width:" + imgSize + "px;height:" + imgSize
    + "px;object-fit:contain;transform:scale("
    + ((typeof TROOP_IMG_SCALE !== "undefined" && TROOP_IMG_SCALE[type]) || 1) + ");\" />"
    + "</div>";
}

function pickOpponents(allPlayers, myId, myXp, count) {
  count = count || 3;
  var others = allPlayers.filter(function(p) { return p.id !== myId; });
  others.sort(function(a, b) { return Math.abs((a.xp || 0) - myXp) - Math.abs((b.xp || 0) - myXp); });
  return others.slice(0, count);
}

function initials2(s) {
  if (!s) return "?";
  return s.trim().slice(0, 2).toUpperCase();
}

function oppAvatarHtml(login, avatarUrl, size) {
  size = size || 32;
  var ini = initials2(login);
  var baseStyle = "width:" + size + "px;height:" + size + "px;border-radius:8px;"
    + "background:var(--accent-soft);display:flex;align-items:center;justify-content:center;"
    + "font-size:12px;font-weight:700;color:var(--accent);flex-shrink:0;";
  if (avatarUrl) {
    return "<div style=\"" + baseStyle + "overflow:hidden;position:relative;\">"
      + "<span>" + escapeHtml(ini) + "</span>"
      + "<img src=\"" + escapeHtml(avatarUrl) + "\" alt=\"\""
      + " style=\"position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;\""
      + " onerror=\"this.style.display='none';\">"
      + "</div>";
  }
  return "<div style=\"" + baseStyle + "\">" + escapeHtml(ini) + "</div>";
}

// ── Сетка составов ───────────────────────────────────────────

function buildTroopGrid(which) {
  if (!currentBattleData) return "";
  var troops      = currentBattleData.troops;
  var openedTypes = troops.map(function(t) { return t.troop_type; });
  var pendAtk     = window._pendingAtk || [];
  var pendDef     = window._pendingDef || [];

  return TROOP_ORDER.map(function(type) {
    if (!openedTypes.includes(type)) return "";
    var cfg     = TROOP_CFG[type];
    var inAtk   = pendAtk.includes(type);
    var inDef   = pendDef.includes(type);
    var checked = which === "attack" ? inAtk : inDef;
    var troop   = troops.find(function(t) { return t.troop_type === type; });
    var inHosp  = !!(troop && troop.in_hospital_since);
    var disabled = inHosp;
    var bkg     = checked ? cfg.color : "var(--surface-2)";
    var brd     = checked ? cfg.color : "var(--border)";
    return "<div onclick=\"" + (disabled ? "" : "toggleLineupSlot('" + which + "','" + type + "')") + "\" "
      + "style=\"display:flex;align-items:center;gap:8px;padding:10px 12px;background:" + bkg + ";"
      + "border:1px solid " + brd + ";border-radius:var(--radius-sm);cursor:" + (disabled ? "default" : "pointer") + ";"
      + "opacity:" + (disabled ? ".4" : "1") + ";transition:background .15s;\">"
      + "<div style=\"width:28px;height:28px;border-radius:7px;background:var(--surface-2);"
      + "display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;"
      + "border:2px solid " + (checked ? cfg.color : "transparent") + ";\">"
      + "<img src=\"" + (TROOP_IMG && TROOP_IMG[type] ? TROOP_IMG[type] : "")
      + "\" style=\"width:22px;height:22px;object-fit:contain;transform:scale("
      + ((typeof TROOP_IMG_SCALE !== "undefined" && TROOP_IMG_SCALE[type]) || 1) + ");\" /></div>"
      + "<div style=\"flex:1;\"><div style=\"font-size:13px;font-weight:600;color:"
      + (checked ? "#fff" : "var(--text)") + ";\">" + escapeHtml(cfg.name) + "</div>"
      + (inHosp ? "<div style=\"font-size:11px;color:" + (checked ? "rgba(255,255,255,.7)" : "var(--accent)") + ";\">"
        + "\u0432 \u0433\u043e\u0441\u043f\u0438\u0442\u0430\u043b\u0435</div>" : "")
      + "</div>"
      + (checked ? "<span style=\"color:#fff;font-size:16px;\">\u2713</span>" : "")
      + "</div>";
  }).join("");
}

// ── Главный рендер ──────────────────────────────────────────

async function renderBattle() {
  if (typeof setActiveTab === "function") setActiveTab("battles");
  var app = document.getElementById("app-content");
  if (!app) return;
  var player = getCurrentPlayer();
  if (!player) return;

  app.innerHTML = "<div class=\"card\" style=\"text-align:center;padding:32px;color:var(--text-soft)\">"
    + "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c\u2026</div>";

  try {
    var results = await Promise.all([
      fetchPlayerBase(player.id),
      fetchPlayerTroops(player.id),
      fetchPlayerBattles(player.id),
      fetchOpponents(player.id),
      fetchPlayerProfileById(player.id),
    ]);
    if (!results[0]) throw new Error("\u0411\u0430\u0437\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430");
    currentBattleData = {
      base:       results[0],
      troops:     results[1] || [],
      battles:    results[2] || [],
      allPlayers: results[3] || [],
      playerXp:   results[4] ? (results[4].xp || 0) : 0,
    };
    renderBattleDashboard();
    startBattleTimer();
  } catch (e) {
    app.innerHTML = "<div class=\"card\" style=\"text-align:center;padding:32px;color:var(--accent)\">"
      + "\u041e\u0448\u0438\u0431\u043a\u0430: " + escapeHtml(e.message) + "</div>";
  }
}

// ── Дашборд ─────────────────────────────────────────────────

function renderBattleDashboard() {
  var app = document.getElementById("app-content");
  if (!app || !currentBattleData) return;

  var base      = currentBattleData.base;
  var troops    = currentBattleData.troops;
  var battles   = currentBattleData.battles;
  var player    = getCurrentPlayer();
  var cdLeft    = attackCooldownLeft(base);
  var canAtk    = cdLeft <= 0;
  var atkLineup0 = base.attack_lineup || [];
  // Атака требует ровно 3 войска в составе (как минимум 3 типа открыто и сохранено)
  var lineupReady = atkLineup0.length === 3;

  var realOpponents = lineupReady
    ? pickOpponents(currentBattleData.allPlayers, player.id, currentBattleData.playerXp, 3)
    : [];
  // Бот — всегда доступная цель, добавляется отдельной виртуальной карточкой.
  // Гарантирует что атаковать есть кого, даже если других игроков пока нет.
  var oppList = lineupReady
    ? realOpponents.concat([{ id: BOT_PLAYER_ID, isBot: true, login: "\u0422\u0440\u0435\u043d\u0438\u0440\u043e\u0432\u043e\u0447\u043d\u044b\u0439 \u0431\u043e\u0442" }])
    : [];

  window._battleOpponents = oppList;

  var myPower = armyPower(troops.filter(function(t) { return !t.in_hospital_since; }));

  var badgeHtml = canAtk
    ? "<span class=\"battle-ready-badge\" id=\"battle-cd-badge\">\u2713 \u0413\u043e\u0442\u043e\u0432 \u043a \u0430\u0442\u0430\u043a\u0435</span>"
    : "<span class=\"battle-cooldown-badge\" id=\"battle-cd-badge\">" + ICON_SWORD + " \u041a\u0443\u043b\u0434\u0430\u0443\u043d: " + formatBattleMs(cdLeft) + "</span>";

  var oppHtml = oppList.map(function(opp, idx) {
    if (opp.isBot) {
      return "<div class=\"battle-hero-row\" style=\"margin-bottom:6px;border:1px dashed var(--border);border-radius:var(--radius-sm);padding:6px;\">"
        + "<div style=\"flex:1;display:flex;align-items:center;gap:8px;min-width:0;\">"
        + "<div style=\"width:32px;height:32px;border-radius:8px;background:var(--surface-2);"
        + "display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;\">&#129302;</div>"
        + "<div style=\"min-width:0\">"
        + "<div class=\"battle-hero-name\">" + escapeHtml(opp.login) + "</div>"
        + "<div class=\"battle-hero-meta\">\u0428\u0430\u043d\u0441 \u043f\u043e\u0431\u0435\u0434\u044b: 50%</div>"
        + "</div></div>"
        + "<button class=\"battle-hero-atk-btn atk-btn\" onclick=\"doAttack(" + idx + ")\" "
        + (canAtk ? "" : "disabled") + ">" + ICON_SWORD + " \u0410\u0442\u0430\u043a\u043e\u0432\u0430\u0442\u044c</button>"
        + "</div>";
    }
    return "<div class=\"battle-hero-row\" style=\"margin-bottom:6px;\">"
      + "<div style=\"flex:1;display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer\" onclick=\"openPlayerProfile('" + opp.id + "')\">"
      + oppAvatarHtml(opp.login, opp.avatar_url, 32)
      + "<div style=\"min-width:0\">"
      + "<div class=\"battle-hero-name\">" + escapeHtml(opp.login || "?") + "</div>"
      + "<div class=\"battle-hero-meta\">" + (opp.xp || 0) + " XP</div>"
      + "</div></div>"
      + "<button class=\"battle-hero-atk-btn atk-btn\" onclick=\"doAttack(" + idx + ")\" "
      + (canAtk ? "" : "disabled") + ">" + ICON_SWORD + " \u0410\u0442\u0430\u043a\u043e\u0432\u0430\u0442\u044c</button>"
      + "</div>";
  }).join("");

  function lineupSlots(lineup) {
    var html = "";
    for (var i = 0; i < 3; i++) {
      var type = lineup[i];
      if (type && TROOP_CFG[type]) {
        html += "<div title=\"" + escapeHtml(TROOP_CFG[type].name) + "\">" + troopBadgeBattle(type, 26) + "</div>";
      } else {
        html += "<div style=\"width:26px;height:26px;border-radius:7px;background:var(--border);"
          + "border:1px dashed var(--text-soft);\"></div>";
      }
    }
    return html;
  }

  var atkLineup = base.attack_lineup  || [];
  var defLineup = base.defense_lineup || [];
  var atkSynHtml = synergyBadgesHtml(atkLineup, true);
  var defSynHtml = synergyBadgesHtml(defLineup, false);

  var hospRows = TROOP_ORDER.map(function(type) {
    var t = troops.find(function(tr) { return tr.troop_type === type; });
    if (!t) return "";
    var vit    = t.vit == null ? 100 : t.vit;
    var inHosp = !!t.in_hospital_since;
    var col    = vitColor(vit);
    var cfg    = TROOP_CFG[type];
    return "<div style=\"margin-bottom:5px;\">"
      + "<div style=\"display:flex;justify-content:space-between;margin-bottom:2px;\">"
      + "<span style=\"font-size:10px;color:var(--text);font-weight:600;\">"
      + escapeHtml(cfg ? cfg.name : type) + (inHosp ? " \u23f3" : "") + "</span>"
      + "<span style=\"font-size:10px;color:" + col + ";font-weight:600;\">" + vit + "%</span>"
      + "</div>"
      + "<div style=\"background:var(--surface-2);border-radius:99px;height:4px;\">"
      + "<div style=\"background:" + col + ";width:" + vit + "%;height:100%;border-radius:99px;\"></div>"
      + "</div></div>";
  }).filter(Boolean).join("");

  var histHtml = battles.slice(0, 5).map(function(b) {
    var iAmAtk = b.attacker_id === player.id;
    var won    = (iAmAtk && b.result === "attacker_win") || (!iAmAtk && b.result === "defender_win");
    var time = typeof fmtSmartTime === "function" ? fmtSmartTime(b.created_at) : b.created_at.slice(0,10);
    var partTxt = won ? "+" + b.parts_gained : "-" + b.parts_gained;
    return "<div style=\"display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);\">"
      + "<div style=\"width:26px;height:26px;border-radius:50%;background:" + (won ? "var(--accent-soft)" : "var(--surface-2)") + ";"
      + "display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:13px;\">"
      + (won ? "\u{1F3C6}" : "\u2716") + "</div>"
      + "<div style=\"flex:1;min-width:0;\">"
      + "<div style=\"font-size:12px;font-weight:600;color:var(--text);\">"
      + (won ? "\u041f\u043e\u0431\u0435\u0434\u0430" : "\u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435") + "</div>"
      + "<div style=\"font-size:11px;color:var(--text-soft);\">+" + b.xp_gained + " XP &middot; " + partTxt + "" + ICON_PARTS + "</div>"
      + "</div>"
      + "<span style=\"font-size:10px;color:var(--text-soft);flex-shrink:0;\">" + time + "</span>"
      + "</div>";
  }).join("") || "<div style=\"text-align:center;padding:16px;color:var(--text-soft);font-size:13px;\">"
    + "\u0431\u043e\u0451\u0432 \u0435\u0449\u0451 \u043d\u0435 \u0431\u044b\u043b\u043e</div>";

  var resultBanner = "";
  if (lastBattleResult) {
    var r   = lastBattleResult;
    var col = r.won ? "#e4f0dc" : "#fde8e8";
    var tc  = r.won ? "#3a6b2a" : "#a32d2d";
    resultBanner = "<div style=\"background:" + col + ";border-radius:var(--radius);padding:14px;"
      + "text-align:center;margin-bottom:14px;\">"
      + "<div style=\"font-size:16px;font-weight:650;color:" + tc + ";margin-bottom:3px;\">"
      + (r.won ? "\u{1F3C6} \u041f\u043e\u0431\u0435\u0434\u0430!" : "\u2716 \u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435") + "</div>"
      + "<div style=\"font-size:13px;color:" + tc + ";\">+" + r.xp + " XP &nbsp; "
      + (r.won ? "+" : "") + r.parts + "" + ICON_PARTS + "</div>"
      + "</div>";
    lastBattleResult = null;
  }

  app.innerHTML = resultBanner

    // ── КЛАНОВЫЕ ВОЙНЫ ──
    + "<div style=\"margin-bottom:14px;\">"
    + "<button onclick=\"renderMapScreen()\" style=\"width:100%;padding:14px;background:var(--btn);"
    + "color:var(--btn-text);border:none;border-radius:var(--radius);font-size:15px;font-weight:650;"
    + "cursor:pointer;font-family:inherit;display:flex;align-items:center;"
    + "justify-content:center;gap:8px;letter-spacing:.01em;\">"
    + ICON_SWORD + " \u041a\u043b\u0430\u043d\u043e\u0432\u044b\u0435 \u0432\u043e\u0439\u043d\u044b &rarr;</button>"
    + "<div style=\"text-align:center;font-size:11px;color:var(--text-soft);margin-top:5px;\">"
    + "\u0417\u0430\u0445\u0432\u0430\u0442\u044b\u0432\u0430\u0439 \u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u0438 \u0432\u043c\u0435\u0441\u0442\u0435 \u0441 \u043a\u043b\u0430\u043d\u043e\u043c</div>"
    + "</div>"

    // ── АРКАДА ──
    + arcadeCardHtml(base)

    // ── HERO CARD (атака) ──
    + (lineupReady
      ? "<div class=\"battle-hero\">"
        + "<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;\">"
        + "<div><div class=\"battle-hero-title\">" + ICON_SWORD + " \u0410\u0442\u0430\u043a\u0430 " + battleHelpBtn() + "</div>"
        + "<div class=\"battle-hero-sub\">\u041c\u043e\u0449\u044c \u0430\u0440\u043c\u0438\u0438: " + myPower + " \u0435\u0434.</div></div>"
        + badgeHtml + "</div>"
        + "<div style=\"display:flex;flex-direction:column;gap:6px;margin-bottom:10px;\">" + oppHtml + "</div>"
        + "<div style=\"text-align:center;\"><button onclick=\"refreshOpponents()\" style=\"background:none;border:none;"
        + "cursor:pointer;color:var(--btn-text);opacity:.5;font-size:12px;font-family:inherit;\">"
        + "\u21bb \u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a</button></div>"
        + "</div>"
      : "<div class=\"battle-hero\">"
        + "<div style=\"display:flex;align-items:center;gap:6px;margin-bottom:10px;\">"
        + "<div class=\"battle-hero-title\">" + ICON_SWORD + " \u0410\u0442\u0430\u043a\u0430 " + battleHelpBtn() + "</div>"
        + "</div>"
        + "<div style=\"text-align:center;padding:10px 8px 6px;\">"
        + "<div style=\"font-size:13px;color:var(--btn-text);font-weight:650;margin-bottom:6px;\">"
        + "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0441\u043e\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043e\u0441\u0442\u0430\u0432 \u0438\u0437 3 \u0432\u043e\u0439\u0441\u043a</div>"
        + "<div style=\"font-size:12px;color:var(--btn-text);opacity:.75;margin-bottom:14px;line-height:1.5;\">"
        + "\u0414\u043b\u044f \u0430\u0442\u0430\u043a\u0438 \u043d\u0443\u0436\u043d\u043e \u0432\u044b\u0431\u0440\u0430\u0442\u044c \u0440\u043e\u0432\u043d\u043e 3 \u0442\u0438\u043f\u0430 \u0432\u043e\u0439\u0441\u043a \u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u043e\u0441\u0442\u0430\u0432.</div>"
        + "<button onclick=\"renderLineupEditor()\" style=\"background:#fff;color:var(--accent);"
        + "border:none;border-radius:var(--radius-sm);padding:11px 22px;font-size:13px;font-weight:650;"
        + "cursor:pointer;font-family:inherit;\">\u041d\u0430\u0441\u0442\u0440\u043e\u0438\u0442\u044c \u0441\u043e\u0441\u0442\u0430\u0432</button>"
        + "</div></div>")

    // ── ДВА СТОЛБЦА: Составы + Госпиталь ──
    + "<div style=\"display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px;\">"

    + "<div class=\"card\" style=\"padding:14px;margin-bottom:0;\">"
    + "<div style=\"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"
    + "color:var(--text-soft);margin-bottom:10px;\">\u0421\u043e\u0441\u0442\u0430\u0432\u044b</div>"
    + "<div style=\"font-size:10px;color:var(--text-soft);font-weight:600;margin-bottom:5px;\">\u0410\u0442\u0430\u043a\u0430</div>"
    + "<div style=\"display:flex;gap:4px;margin-bottom:4px;\">" + lineupSlots(atkLineup) + "</div>"
    + atkSynHtml
    + "<div style=\"font-size:10px;color:var(--text-soft);font-weight:600;margin-bottom:5px;margin-top:" + (atkSynHtml ? "2" : "5") + "px;\">\u0417\u0430\u0449\u0438\u0442\u0430</div>"
    + "<div style=\"display:flex;gap:4px;margin-bottom:4px;\">" + lineupSlots(defLineup) + "</div>"
    + defSynHtml
    + "<button onclick=\"renderLineupEditor()\" style=\"width:100%;background:var(--surface-2);"
    + "border:1px solid var(--border);border-radius:var(--radius-sm);padding:7px;font-size:11px;"
    + "font-weight:600;color:var(--text);cursor:pointer;font-family:inherit;\">\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c</button>"
    + "</div>"

    + "<div class=\"card\" style=\"padding:14px;margin-bottom:0;\">"
    + "<div style=\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;\">"
    + "<div style=\"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"
    + "color:var(--text-soft);\">\u0413\u043e\u0441\u043f\u0438\u0442\u0430\u043b\u044c</div>"
    + "<span style=\"background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:700;"
    + "padding:2px 8px;border-radius:99px;\">\u0443\u0440. " + (base.hospital_level || 1) + "</span>"
    + "</div>"
    + (hospRows || "<div style=\"font-size:11px;color:var(--text-soft);\">\u0432\u043e\u0439\u0441\u043a \u043f\u043e\u043a\u0430 \u043d\u0435\u0442</div>")
    + "<button onclick=\"renderHospitalFull()\" style=\"width:100%;background:var(--surface-2);"
    + "border:1px solid var(--border);border-radius:var(--radius-sm);padding:7px;font-size:11px;"
    + "font-weight:600;color:var(--text);cursor:pointer;font-family:inherit;margin-top:8px;\">"
    + "\u041b\u0435\u0447\u0438\u0442\u044c</button>"
    + "</div>"
    + "</div>"

    // ── ИСТОРИЯ ──
    + "<div class=\"card\">"
    + "<div style=\"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"
    + "color:var(--text-soft);margin-bottom:10px;\">\u041f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0435 \u0431\u043e\u0438</div>"
    + histHtml
    + "</div>";
}

// ── Редактор составов ────────────────────────────────────────

function renderLineupEditor() {
  var app = document.getElementById("app-content");
  if (!app || !currentBattleData) return;
  var base        = currentBattleData.base;
  var openedTypes = (currentBattleData.troops || []).map(function(t) { return t.troop_type; });

  // Фикс: у новых игроков меньше 3 типов войск
  if (openedTypes.length < 3) {
    var need = 3 - openedTypes.length;
    app.innerHTML = "<div class=\"card\">"
      + "<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:20px;\">"
      + "<button onclick=\"renderBattleDashboard()\" style=\"background:var(--surface-2);"
      + "border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;"
      + "font-size:13px;cursor:pointer;color:var(--text);font-family:inherit;\">"
      + "\u2190 \u041d\u0430\u0437\u0430\u0434</button>"
      + "<div style=\"font-size:16px;font-weight:650;\">\u0421\u043e\u0441\u0442\u0430\u0432\u044b</div>"
      + "</div>"
      + "<div style=\"text-align:center;padding:16px 8px 24px;\">"
      + "<div style=\"margin-bottom:12px;\">" + mkSvgIcon('sword', 36, 36, '0') + "</div>"
      + "<div style=\"font-size:15px;font-weight:650;color:var(--text);margin-bottom:8px;\">"
      + "\u041d\u0443\u0436\u043d\u043e \u0431\u043e\u043b\u044c\u0448\u0435 \u0432\u043e\u0439\u0441\u043a</div>"
      + "<div style=\"font-size:13px;color:var(--text-soft);margin-bottom:20px;line-height:1.5;\">"
      + "\u0414\u043b\u044f \u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f \u0441\u043e\u0441\u0442\u0430\u0432\u0430 \u043d\u0443\u0436\u043d\u043e \u043c\u0438\u043d\u0438\u043c\u0443\u043c 3 \u0442\u0438\u043f\u0430 \u0432\u043e\u0439\u0441\u043a."
      + "<br>\u0423 \u0442\u0435\u0431\u044f \u0435\u0441\u0442\u044c " + openedTypes.length
      + " \u2014 \u043e\u0442\u043a\u0440\u043e\u0439 \u0435\u0449\u0451 " + need
      + " \u0432 \u041b\u0430\u0431\u043e\u0440\u0430\u0442\u043e\u0440\u0438\u0438.</div>"
      + "<button onclick=\"renderLab()\" style=\"background:var(--btn);color:var(--btn-text);"
      + "border:none;border-radius:var(--radius-sm);padding:12px 24px;"
      + "font-size:14px;font-weight:650;cursor:pointer;font-family:inherit;\">"
      + "\u041f\u0435\u0440\u0435\u0439\u0442\u0438 \u0432 \u041b\u0430\u0431\u043e\u0440\u0430\u0442\u043e\u0440\u0438\u044e</button>"
      + "</div></div>";
    return;
  }

  window._pendingAtk = (base.attack_lineup  || []).slice();
  window._pendingDef = (base.defense_lineup || []).slice();

  app.innerHTML = "<div class=\"card\">"
    + "<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:16px;\">"
    + "<button onclick=\"renderBattleDashboard()\" style=\"background:var(--surface-2);"
    + "border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;"
    + "font-size:13px;cursor:pointer;color:var(--text);font-family:inherit;\">"
    + "\u2190 \u041d\u0430\u0437\u0430\u0434</button>"
    + "<div style=\"font-size:16px;font-weight:650;\">\u0421\u043e\u0441\u0442\u0430\u0432\u044b</div>"
    + "</div>"
    + "<div style=\"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"
    + "color:var(--text-soft);margin-bottom:8px;\">"
    + ICON_SWORD + " \u0410\u0442\u0430\u043a\u0443\u044e\u0449\u0438\u0439 \u0441\u043e\u0441\u0442\u0430\u0432 &mdash; \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 3</div>"
    + "<div id=\"atk-grid\" style=\"display:flex;flex-direction:column;gap:7px;margin-bottom:16px;\">"
    + buildTroopGrid("attack") + "</div>"
    + "<div style=\"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"
    + "color:var(--text-soft);margin-bottom:8px;\">"
    + ICON_SHIELD + " \u0417\u0430\u0449\u0438\u0442\u043d\u044b\u0439 \u0441\u043e\u0441\u0442\u0430\u0432 &mdash; \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 3</div>"
    + "<div id=\"def-grid\" style=\"display:flex;flex-direction:column;gap:7px;margin-bottom:16px;\">"
    + buildTroopGrid("defense") + "</div>"
    + "<button id=\"save-lineup-btn\" onclick=\"doSaveLineup()\" style=\"width:100%;"
    + "background:var(--btn);color:var(--btn-text);border:none;border-radius:var(--radius-sm);"
    + "padding:13px;font-size:14px;font-weight:650;cursor:pointer;font-family:inherit;\">"
    + "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u043e\u0441\u0442\u0430\u0432\u044b</button>"
    + "<div id=\"lineup-msg\" style=\"min-height:18px;font-size:13px;text-align:center;margin-top:10px;\"></div>"
    + "</div>";
}

function toggleLineupSlot(which, type) {
  var arr = which === "attack" ? window._pendingAtk : window._pendingDef;
  var idx = arr.indexOf(type);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else {
    if (arr.length >= 3) {
      showLineupMsg("\u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c 3 \u0442\u0438\u043f\u0430 \u0432 \u0441\u043e\u0441\u0442\u0430\u0432\u0435", "err");
      return;
    }
    arr.push(type);
  }
  var ag = document.getElementById("atk-grid");
  var dg = document.getElementById("def-grid");
  if (ag) ag.innerHTML = buildTroopGrid("attack");
  if (dg) dg.innerHTML = buildTroopGrid("defense");
}

function showLineupMsg(text, type) {
  var el = document.getElementById("lineup-msg");
  if (!el) return;
  el.textContent = text;
  el.style.color = type === "ok" ? "var(--accent)" : "#e05252";
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.textContent = ""; }, 3000);
}

async function doSaveLineup() {
  var player = getCurrentPlayer();
  if (!player) return;
  var atkArr = window._pendingAtk || [];
  var defArr = window._pendingDef || [];
  if (atkArr.length !== 3) {
    showLineupMsg("\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u043e\u0432\u043d\u043e 3 \u0432\u043e\u0439\u0441\u043a\u0430 \u0434\u043b\u044f \u0430\u0442\u0430\u043a\u0438", "err");
    return;
  }
  if (defArr.length !== 3) {
    showLineupMsg("\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u043e\u0432\u043d\u043e 3 \u0432\u043e\u0439\u0441\u043a\u0430 \u0434\u043b\u044f \u0437\u0430\u0449\u0438\u0442\u044b", "err");
    return;
  }
  var btn = document.getElementById("save-lineup-btn");
  if (btn) { btn.disabled = true; btn.textContent = "\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c\u2026"; }
  try {
    await saveLineup(player.id, "attack",  atkArr);
    await saveLineup(player.id, "defense", defArr);
    currentBattleData.base.attack_lineup  = atkArr.slice();
    currentBattleData.base.defense_lineup = defArr.slice();
    showLineupMsg("\u0421\u043e\u0441\u0442\u0430\u0432\u044b \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b!", "ok");
    setTimeout(function() { renderBattleDashboard(); }, 900);
  } catch (e) {
    showLineupMsg(e.message, "err");
    if (btn) { btn.disabled = false; btn.textContent = "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u043e\u0441\u0442\u0430\u0432\u044b"; }
  }
}

// ── Госпиталь (полный экран) ─────────────────────────────────

function renderHospitalFull() {
  var app = document.getElementById("app-content");
  if (!app || !currentBattleData) return;
  var base      = currentBattleData.base;
  var troops    = currentBattleData.troops;
  var hospLevel = base.hospital_level || 1;
  var vitGain   = HOSP_VIT_PER_LEVEL[hospLevel] || 10;
  var upgCost   = HOSP_UPGRADE_COSTS[hospLevel];

  var troopRows = TROOP_ORDER.map(function(type) {
    var t   = troops.find(function(tr) { return tr.troop_type === type; });
    if (!t) return "";
    var cfg    = TROOP_CFG[type];
    var vit    = t.vit == null ? 100 : t.vit;
    var inHosp = !!t.in_hospital_since;
    var msLeft = inHosp ? hospitalMsLeft(t) : 0;
    var done   = inHosp && msLeft <= 0;
    var col    = vitColor(vit);

    var actionHtml;
    if (!inHosp && vit < 100) {
      actionHtml = "<button onclick=\"doSendToHospital('" + type + "')\" style=\"background:var(--btn);"
        + "color:var(--btn-text);border:none;border-radius:8px;padding:6px 10px;"
        + "font-size:11px;font-weight:650;cursor:pointer;white-space:nowrap;font-family:inherit;\">"
        + "\u0412 \u0433\u043e\u0441\u043f.</button>";
    } else if (done) {
      actionHtml = "<button id=\"hosp-timer-" + type + "\" class=\"hosp-collect-btn\" onclick=\"doCollectHospital('" + type + "')\" "
        + "style=\"background:var(--accent-soft);color:var(--accent);border:none;border-radius:8px;"
        + "padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;"
        + "font-family:inherit;\">\u0417\u0430\u0431\u0440\u0430\u0442\u044c</button>";
    } else if (inHosp) {
      actionHtml = "<span id=\"hosp-timer-" + type + "\" style=\"font-size:11px;color:var(--accent);"
        + "font-weight:600;white-space:nowrap;\">\u23f3 " + formatBattleMs(msLeft) + "</span>";
    } else {
      actionHtml = "<span style=\"font-size:11px;color:var(--text-soft);\">\u0417\u0434\u043e\u0440\u043e\u0432\u043e</span>";
    }

    return "<div style=\"display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface-2);"
      + "border-radius:var(--radius-sm);border:1px solid " + (inHosp ? "var(--accent)" : "transparent") + ";\">"
      + troopBadgeBattle(type, 30)
      + "<div style=\"flex:1;min-width:0;\">"
      + "<div style=\"display:flex;justify-content:space-between;margin-bottom:4px;\">"
      + "<span style=\"font-size:13px;font-weight:600;color:var(--text);\">" + escapeHtml(cfg ? cfg.name : type) + "</span>"
      + "<span style=\"font-size:12px;font-weight:700;color:" + col + ";\">" + vit + "%</span>"
      + "</div>"
      + "<div style=\"background:var(--border);border-radius:99px;height:5px;\">"
      + "<div style=\"background:" + col + ";width:" + vit + "%;height:100%;border-radius:99px;\"></div>"
      + "</div></div>"
      + "<div style=\"flex-shrink:0;\">" + actionHtml + "</div>"
      + "</div>";
  }).filter(Boolean).join("");

  app.innerHTML = "<div style=\"display:flex;align-items:center;gap:10px;margin-bottom:14px;\">"
    + "<button onclick=\"renderBattleDashboard()\" style=\"background:var(--surface-2);"
    + "border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;"
    + "font-size:13px;cursor:pointer;color:var(--text);font-family:inherit;\">"
    + "\u2190 \u041d\u0430\u0437\u0430\u0434</button>"
    + "<div style=\"font-size:16px;font-weight:650;\">\u0413\u043e\u0441\u043f\u0438\u0442\u0430\u043b\u044c</div>"
    + "<span style=\"margin-left:auto;background:var(--accent-soft);color:var(--accent);"
    + "font-size:12px;font-weight:700;padding:3px 12px;border-radius:20px;\">\u0443\u0440. " + hospLevel + "</span>"
    + "</div>"
    + "<div style=\"background:var(--surface-2);border-radius:var(--radius-sm);padding:10px 14px;"
    + "margin-bottom:12px;font-size:12px;color:var(--text-soft);\">"
    + "\u0423\u0440. " + hospLevel + " \u2014 \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u0442 +" + vitGain
    + "% \u0425\u041f \u0437\u0430 4 \u0447."
    + "</div>"
    + "<div class=\"card\" style=\"padding:14px;\">"
    + "<div style=\"font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;"
    + "color:var(--text-soft);margin-bottom:10px;\">"
    + "\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0432\u043e\u0439\u0441\u043a</div>"
    + "<div style=\"display:flex;flex-direction:column;gap:7px;\">"
    + (troopRows || "<div style=\"text-align:center;padding:12px;color:var(--text-soft);font-size:13px;\">"
      + "\u0432\u043e\u0439\u0441\u043a \u0435\u0449\u0451 \u043d\u0435\u0442</div>")
    + "</div></div>"
    + (hospLevel < 3
      ? "<div class=\"upgrade-card\">"
        + "<div class=\"upgrade-title\">\u0423\u043b\u0443\u0447\u0448\u0438\u0442\u044c \u0433\u043e\u0441\u043f\u0438\u0442\u0430\u043b\u044c</div>"
        + "<div class=\"upgrade-row\">"
        + "<div class=\"upgrade-levels\">\u0443\u0440. " + hospLevel + " <span>\u2192</span> \u0443\u0440. " + (hospLevel + 1) + "</div>"
        + "<div><div class=\"cost-label\">\u0412\u043e\u0441\u0441\u0442\u0430\u043d\u0430\u0432\u043b\u0438\u0432\u0430\u0435\u0442</div>"
        + "<div class=\"cost-value\">+" + HOSP_VIT_PER_LEVEL[hospLevel + 1] + "% \u0425\u041f/4\u0447</div></div>"
        + "</div>"
        + "<button id=\"hosp-upg-btn\" onclick=\"doUpgradeHospital()\" class=\"btn-upgrade\">"
        + "\u0423\u043b\u0443\u0447\u0448\u0438\u0442\u044c (" + upgCost + "" + ICON_PARTS + ")</button>"
        + "<div id=\"hosp-upg-msg\" class=\"factory-msg\"></div>"
        + "</div>"
      : "<div style=\"text-align:center;padding:12px;color:var(--text-soft);font-size:13px;\">"
        + "\u0413\u043e\u0441\u043f\u0438\u0442\u0430\u043b\u044c \u043c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u043e\u0433\u043e \u0443\u0440\u043e\u0432\u043d\u044f</div>")
    + "<div id=\"hosp-msg\" class=\"factory-msg\"></div>";
}

function showHospMsg(text, type) {
  var el = document.getElementById("hosp-msg");
  if (!el) return;
  el.textContent = text;
  el.style.color = type === "ok" ? "var(--accent)" : "#e05252";
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.textContent = ""; }, 3000);
}

// ── Действия ─────────────────────────────────────────────────

async function doAttack(idx) {
  var player = getCurrentPlayer();
  if (!player || !currentBattleData) return;
  var opp = (window._battleOpponents || [])[idx];
  if (!opp) return;

  // Защита: атака требует ровно 3 войска в составе (UI уже это гарантирует,
  // но проверяем ещё раз на случай рассинхрона состояния)
  if ((currentBattleData.base.attack_lineup || []).length !== 3) {
    renderBattleDashboard();
    return;
  }

  var btns = document.querySelectorAll(".atk-btn");
  btns.forEach(function(b) { b.disabled = true; b.innerHTML = ICON_SWORD + "\u2026"; });

  try {
    var result = opp.isBot
      ? await resolveBotBattle(player.id)
      : await resolveBattle(player.id, opp.id);
    var won    = result.result === "attacker_win";

    currentBattleData.base.last_attack_at  = new Date().toISOString();
    currentBattleData.base.parts           = result.attacker_parts;
    var rPartsEl = document.getElementById("r-parts");
    if (rPartsEl) rPartsEl.textContent = result.attacker_parts;

    (currentBattleData.base.attack_lineup || []).forEach(function(type) {
      var t = currentBattleData.troops.find(function(tr) { return tr.troop_type === type; });
      if (t) t.vit = Math.max(0, (t.vit == null ? 100 : t.vit) - (won ? 10 : 25));
    });

    lastBattleResult = {
      won:   won,
      xp:    result.xp_gained,
      parts: result.parts_gained,
    };

    var newBattles = await fetchPlayerBattles(player.id);
    if (currentBattleData) currentBattleData.battles = newBattles || [];
    renderBattleDashboard();
  } catch (e) {
    btns.forEach(function(b) {
      b.disabled = false;
      b.innerHTML = ICON_SWORD + " \u0410\u0442\u0430\u043a\u043e\u0432\u0430\u0442\u044c";
    });
    var cdEl = document.getElementById("battle-cd-badge");
    if (cdEl) cdEl.insertAdjacentHTML("afterend",
      "<div style=\"font-size:12px;color:#e05252;margin-top:8px;text-align:center;\">"
      + escapeHtml(e.message) + "</div>");
  }
}

async function refreshOpponents() {
  var player = getCurrentPlayer();
  if (!player || !currentBattleData) return;
  try {
    currentBattleData.allPlayers = await fetchOpponents(player.id);
    renderBattleDashboard();
  } catch (_) {}
}

async function doSendToHospital(type) {
  var player = getCurrentPlayer();
  if (!player) return;
  try {
    await sendToHospital(player.id, type);
    var t = currentBattleData.troops.find(function(tr) { return tr.troop_type === type; });
    if (t) t.in_hospital_since = new Date().toISOString();
    renderHospitalFull();
  } catch (e) {
    showHospMsg(e.message, "err");
  }
}

async function doCollectHospital(type) {
  var player = getCurrentPlayer();
  if (!player) return;
  var btn = document.getElementById("hosp-timer-" + type);
  if (btn && btn.tagName === "BUTTON") { btn.disabled = true; btn.textContent = "\u0417\u0430\u0431\u0438\u0440\u0430\u0435\u043c\u2026"; }
  try {
    var result = await collectHospital(player.id, type);
    var t = currentBattleData.troops.find(function(tr) { return tr.troop_type === type; });
    if (t) { t.vit = result.vit; t.in_hospital_since = null; }
    showHospMsg("\u0412\u043e\u0439\u0441\u043a\u043e \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u043e: +" + result.vit_gained + "% \u0425\u041f", "ok");
    setTimeout(function() { renderHospitalFull(); }, 700);
  } catch (e) {
    showHospMsg(e.message, "err");
  }
}

async function doUpgradeHospital() {
  var player = getCurrentPlayer();
  if (!player) return;
  var btn = document.getElementById("hosp-upg-btn");
  if (btn) { btn.disabled = true; btn.textContent = "\u0423\u043b\u0443\u0447\u0448\u0430\u0435\u043c\u2026"; }
  try {
    var result = await upgradeHospital(player.id);
    currentBattleData.base.hospital_level = result.hospital_level;
    currentBattleData.base.parts          = result.parts;
    var rPartsEl = document.getElementById("r-parts");
    if (rPartsEl) rPartsEl.textContent = result.parts;
    var msgEl = document.getElementById("hosp-upg-msg");
    if (msgEl) {
      msgEl.textContent = "\u0413\u043e\u0441\u043f\u0438\u0442\u0430\u043b\u044c \u0443\u043b\u0443\u0447\u0448\u0435\u043d \u0434\u043e \u0443\u0440. " + result.hospital_level + "!";
      msgEl.style.color = "var(--accent)";
    }
    setTimeout(function() { renderHospitalFull(); }, 800);
  } catch (e) {
    var msgEl = document.getElementById("hosp-upg-msg");
    if (msgEl) { msgEl.textContent = e.message; msgEl.style.color = "#e05252"; }
    if (btn) { btn.disabled = false; btn.textContent = "\u0423\u043b\u0443\u0447\u0448\u0438\u0442\u044c"; }
  }
}
