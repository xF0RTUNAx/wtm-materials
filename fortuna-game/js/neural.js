// Цепочки версий нейросетей
var NEURAL_CHAIN_CFG = {
  superchat:  [{label:'1.0', cost:null}, {label:'2.0', cost:'100'},    {label:'3.0', cost:'250'}],
  twink:      [{label:'Fast',cost:null}, {label:'Flash',cost:'2 000'},{label:'Pro', cost:'5 000'}],
  fortuna_ai: [{label:'Low', cost:null}, {label:'Med.', cost:'40 000'},{label:'High',cost:'90 000'}],
};
// ============================================================
//  neural.js — Нейросети (Этап 3).
//  Три линейки (Super Chat, Twink, Fortuna AI), каждая с 3 версиями.
//  Цикл: отправить на задание (4ч) → забрать результат.
//  Лимит: 3 задания в день на линейку. Сброс в полночь UTC.
// ============================================================

const NEURAL_LINES = ['superchat', 'twink', 'fortuna_ai'];
const MISSION_MS   = 4 * 60 * 60 * 1000;
const MAX_MISSIONS = 3;

const NEURAL_CFG = {
  superchat: {
    name: 'Super Chat',
    versions:     ['1.0', '2.0', '3.0'],
    rewards:      [[40, 5], [80, 10], [140, 18]],
    upgradeCosts: [0, 100, 250],
  },
  twink: {
    name: 'Twink',
    versions:     ['Fast', 'Flash', 'Pro'],
    rewards:      [[240, 40], [400, 65], [600, 100]],
    upgradeCosts: [750, 2000, 5000],
  },
  fortuna_ai: {
    name: 'Fortuna AI',
    versions:     ['Low', 'Medium', 'High'],
    rewards:      [[1000, 180], [1600, 280], [2400, 450]],
    upgradeCosts: [15000, 40000, 90000],
  },
};

// ── GLB-модели нейросетей ────────────────────────────────────
// Общий заголовок: computer-wide.glb
// Per-line: superchat=computer-system, twink=computer, fortuna_ai=computer-screen
const NEURAL_MODELS = {
  header:     'ai/Models/GLB%20format/computer-wide.glb',
  superchat:  'ai/Models/GLB%20format/computer-system.glb',
  twink:      'ai/Models/GLB%20format/computer.glb',
  fortuna_ai: 'ai/Models/GLB%20format/computer-screen.glb',
};

let currentNeuralData   = null;
let neuralTimerInterval = null;

// ── Утилиты ─────────────────────────────────────────────────

function todayUTC() {
  return new Date().toISOString().split('T')[0];
}

function formatNum(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

function formatCountdown(ms) {
  if (ms <= 0) return '0 мин';
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return h + 'ч ' + m + 'мин';
  if (h > 0) return h + 'ч';
  return m + 'мин';
}

function missionsEffective(nn) {
  if (!nn) return 0;
  return nn.last_reset_date < todayUTC() ? 0 : (nn.missions_today || 0);
}

function getNeuralState(nn) {
  if (!nn) return { state: 'locked' };
  const mt = missionsEffective(nn);
  if (nn.mission_started_at) {
    const elapsed = Date.now() - new Date(nn.mission_started_at).getTime();
    if (elapsed >= MISSION_MS) return { state: 'ready',   missionsToday: mt };
    return                            { state: 'running', missionsToday: mt, remainingMs: MISSION_MS - elapsed };
  }
  if (mt >= MAX_MISSIONS) return { state: 'limit', missionsToday: mt };
  return                         { state: 'idle',  missionsToday: mt };
}

// ── GLB-иконки ───────────────────────────────────────────────

// Общий заголовок экрана нейросетей (80×80)
function neuralHeaderSvg() {
  return '<model-viewer'
    + ' src="' + NEURAL_MODELS.header + '"'
    + ' camera-orbit="0deg 70deg 105%"'
    + ' auto-rotate'
    + ' auto-rotate-delay="800"'
    + ' rotation-per-second="18deg"'
    + ' camera-controls'
    + ' style="width:80px;height:80px;border-radius:13px;background:var(--accent-soft);flex-shrink:0;"'
    + '></model-viewer>';
}

// Per-line иконка (50×50)
function neuralLineModel(lineType, isLocked) {
  var src    = NEURAL_MODELS[lineType] || NEURAL_MODELS.header;
  var filter = isLocked ? 'filter:grayscale(1);opacity:0.45;' : '';
  return '<model-viewer'
    + ' src="' + src + '"'
    + ' camera-orbit="0deg 70deg 105%"'
    + ' auto-rotate'
    + ' auto-rotate-delay="500"'
    + ' rotation-per-second="25deg"'
    + ' camera-controls'
    + ' style="width:50px;height:50px;border-radius:11px;background:var(--accent-soft);flex-shrink:0;' + filter + '"'
    + '></model-viewer>';
}

// ── HTML карточки линейки ────────────────────────────────────

function neuralCardHtml(lineType, nn, rare) {
  const cfg      = NEURAL_CFG[lineType];
  const st       = getNeuralState(nn);
  const version  = nn ? nn.version : 0;
  const isLocked = st.state === 'locked';

  const opacity    = isLocked ? (lineType === 'fortuna_ai' ? '0.28' : '0.55') : '1';
  const titleStyle = isLocked ? 'color:var(--text-soft);' : '';

  const vBadge = isLocked
    ? '<div style="background:var(--border);color:var(--text-soft);font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;flex-shrink:0;">&#128274;</div>'
    : '<div style="background:var(--accent);color:#fff;font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;flex-shrink:0;">' + cfg.versions[version - 1] + '</div>';

  // GLB-иконка вместо SVG
  const header = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">'
    + neuralLineModel(lineType, isLocked)
    + '<div style="flex:1;">'
    + '<div style="font-size:15px;font-weight:650;' + titleStyle + '">' + cfg.name + '</div>'
    + '<div style="font-size:11px;color:var(--text-soft);margin-top:1px;">Фарм опыта и редких материалов</div>'
    + '</div>' + vBadge + '</div>';

  // === ЗАБЛОКИРОВАНА ===
  if (isLocked) {
    const cost    = cfg.upgradeCosts[0];
    const canOpen = rare >= cost;
    return '<div id="neural-card-' + lineType + '" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px;margin-bottom:16px;opacity:' + opacity + ';">'
      + header
      + '<div id="neural-btns-' + lineType + '">'
      + '<button ' + (canOpen ? 'onclick="doNeuralUpgrade(\'' + lineType + '\')"' : '') + ' style="width:100%;padding:10px;border:none;border-radius:9px;font-size:12px;font-weight:650;font-family:inherit;cursor:' + (canOpen ? 'pointer' : 'default') + ';background:' + (canOpen ? 'var(--btn)' : 'var(--surface-2)') + ';color:' + (canOpen ? 'var(--btn-text)' : 'var(--text-soft)') + ';">'
      + 'Открыть за ' + formatNum(cost) + '\u00a0' + ICON_RARE + '</button>'
      + '</div>'
      + '<div class="factory-msg" id="neural-msg-' + lineType + '"></div>'
      + '</div>';
  }

  // === АКТИВНАЯ ЛИНЕЙКА ===
  const rewards    = cfg.rewards[version - 1];
  const xpReward   = rewards[0];
  const rareReward = rewards[1];
  const mt         = st.missionsToday;
  const mPct       = Math.round((mt / MAX_MISSIONS) * 100);

  // Цепочка прокачки
  var chainItems  = NEURAL_CHAIN_CFG[lineType] || [];
  var chainCurIdx = isLocked ? -1 : (version - 1);
  var chainHtml   = (typeof buildChain !== 'undefined' && chainItems.length)
    ? buildChain(chainItems, chainCurIdx, 'nn-chain-' + lineType, 'rare') : '';

  let statusBox = '';
  if (st.state === 'running') {
    const progPct = Math.round(((MISSION_MS - st.remainingMs) / MISSION_MS) * 100);
    statusBox = '<div style="background:var(--accent-soft);border-radius:9px;padding:10px 12px;margin-bottom:10px;">'
      + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin-bottom:3px;">&#9203; Задание выполняется</div>'
      + '<div id="neural-timer-' + lineType + '" style="font-size:19px;font-weight:680;letter-spacing:-.02em;">' + formatCountdown(st.remainingMs) + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-soft);margin-top:7px;margin-bottom:4px;"><span>Прогресс</span><span>' + progPct + '%</span></div>'
      + '<div style="background:var(--border);border-radius:99px;height:4px;overflow:hidden;"><div style="background:var(--accent);height:100%;border-radius:99px;width:' + progPct + '%;transition:width .4s;"></div></div>'
      + '</div>';
  } else if (st.state === 'ready') {
    statusBox = '<div style="background:var(--accent-soft);border-radius:9px;padding:10px 12px;margin-bottom:10px;">'
      + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin-bottom:2px;">&#10003; Задание выполнено!</div>'
      + '<div style="font-size:12px;color:var(--text-soft);margin-top:2px;">+' + xpReward + '\u00a0' + ICON_XP + '\u00a0\u00b7\u00a0+' + rareReward + '\u00a0' + ICON_RARE + '</div>'
      + '</div>';
  } else if (st.state === 'limit') {
    statusBox = '<div style="background:var(--surface-2);border-radius:9px;padding:10px 12px;margin-bottom:10px;">'
      + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-soft);">&#128683; Лимит исчерпан</div>'
      + '<div style="font-size:12px;color:var(--text-soft);margin-top:2px;">3/3 задания \u00b7 сброс в полночь UTC</div>'
      + '</div>';
  } else {
    statusBox = '<div style="background:var(--surface-2);border-radius:9px;padding:10px 12px;margin-bottom:10px;">'
      + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--text-soft);">&#9726; Свободна</div>'
      + '<div style="font-size:12px;color:var(--text-soft);margin-top:2px;">Награда: +' + xpReward + '\u00a0' + ICON_XP + '\u00a0\u00b7\u00a0+' + rareReward + '\u00a0' + ICON_RARE + '</div>'
      + '</div>';
  }

  const progressBar = '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-soft);margin-bottom:4px;">'
    + '<span>Заданий сегодня</span><span style="font-weight:650;">' + mt + '\u00a0/\u00a0' + MAX_MISSIONS + '</span></div>'
    + '<div style="background:var(--surface-2);border-radius:99px;height:5px;overflow:hidden;margin-bottom:11px;">'
    + '<div style="background:var(--accent);height:100%;border-radius:99px;width:' + mPct + '%;"></div></div>';

  let actionBtn = '';
  if (st.state === 'ready') {
    actionBtn = '<button onclick="doNeuralCollect(\'' + lineType + '\')" style="flex:1;padding:10px;border:none;border-radius:9px;background:var(--accent);color:#fff;font-size:12px;font-weight:650;cursor:pointer;font-family:inherit;">Забрать результат!</button>';
  } else if (st.state === 'idle') {
    actionBtn = '<button onclick="doNeuralStart(\'' + lineType + '\')" style="flex:1;padding:10px;border:none;border-radius:9px;background:var(--btn);color:var(--btn-text);font-size:12px;font-weight:650;cursor:pointer;font-family:inherit;">Отправить на задание</button>';
  } else {
    const lbl = st.state === 'running' ? 'В процессе\u2026' : 'Лимит (3/3)';
    actionBtn = '<button style="flex:1;padding:10px;border:none;border-radius:9px;background:var(--surface-2);color:var(--text-soft);font-size:12px;font-weight:650;cursor:default;font-family:inherit;">' + lbl + '</button>';
  }

  let upgradeBtn = '';
  if (version < 3) {
    const upgCost    = cfg.upgradeCosts[version];
    const canUpgrade = rare >= upgCost;
    upgradeBtn = '<button ' + (canUpgrade ? 'onclick="doNeuralUpgrade(\'' + lineType + '\')"' : '') + ' style="padding:10px 12px;border:none;border-radius:9px;background:var(--surface-2);color:' + (canUpgrade ? 'var(--text)' : 'var(--text-soft)') + ';font-size:11px;font-weight:650;cursor:' + (canUpgrade ? 'pointer' : 'default') + ';font-family:inherit;white-space:nowrap;flex-shrink:0;">'
      + cfg.versions[version] + '\u00a0\u00b7\u00a0' + formatNum(upgCost) + '\u00a0' + ICON_RARE + '</button>';
  }

  return '<div id="neural-card-' + lineType + '" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px;margin-bottom:16px;">'
    + header + chainHtml + statusBox + progressBar
    + '<div style="display:flex;gap:7px;" id="neural-btns-' + lineType + '">'
    + actionBtn + upgradeBtn + '</div>'
    + '<div class="factory-msg" id="neural-msg-' + lineType + '"></div>'
    + '</div>';
}

// ── Рендер экрана ─────────────────────────────────────────────

async function renderNeural() {
  if (typeof setActiveTab === 'function') setActiveTab('ai');
  const app    = document.getElementById('app-content');
  if (!app) return;
  const player = getCurrentPlayer();
  if (!player) return;

  app.innerHTML = '<div class="card" style="text-align:center;padding:32px;color:var(--text-soft)">Загружаем нейросети\u2026</div>';

  try {
    const [nns, base] = await Promise.all([
      fetchPlayerNeural(player.id),
      fetchPlayerBase(player.id),
    ]);
    if (!base) throw new Error('База не найдена');
    currentNeuralData = { nns, base };
  } catch (e) {
    app.innerHTML = '<div class="card" style="text-align:center;padding:32px;color:var(--accent)">Не удалось загрузить нейросети: '
      + (typeof escapeHtml === 'function' ? escapeHtml(e.message) : e.message) + '</div>';
    return;
  }

  renderNeuralContent();
  startNeuralTimer();
}

function renderNeuralContent() {
  const app = document.getElementById('app-content');
  if (!app || !currentNeuralData) return;

  const { nns, base } = currentNeuralData;
  const rare = base.rare_materials || 0;

  const nnMap = {};
  nns.forEach(function(nn) { nnMap[nn.line_type] = nn; });

  const headerCard = '<div class="card">'
    + '<div class="factory-header">'
    + neuralHeaderSvg()
    + '<div><div class="f-title">Нейросети</div>'
    + '<div class="f-sub">Фарм опыта и редких материалов</div></div>'
    + '</div>'
    + '<div class="stats-row">'
    + '<div class="stat"><div class="stat-label">Опыт</div><div class="stat-value" id="neural-xp">\u2026</div></div>'
    + '<div class="stat"><div class="stat-label">Редкие</div><div class="stat-value" id="neural-rare">' + rare + '</div></div>'
    + '</div></div>';

  const cards = NEURAL_LINES.map(function(line) {
    return neuralCardHtml(line, nnMap[line] || null, rare);
  }).join('');

  app.innerHTML = headerCard + cards;

  const player = getCurrentPlayer();
  if (player) {
    fetchPlayerProfileById(player.id).then(function(profile) {
      const el = document.getElementById('neural-xp');
      if (el && profile) el.textContent = profile.xp || 0;
    }).catch(function() {});
  }
}

// ── Таймер ───────────────────────────────────────────────────

function startNeuralTimer() {
  stopNeuralTimer();
  updateNeuralTimers();
  neuralTimerInterval = setInterval(updateNeuralTimers, 30000);
}

function stopNeuralTimer() {
  if (neuralTimerInterval) {
    clearInterval(neuralTimerInterval);
    neuralTimerInterval = null;
  }
}

function updateNeuralTimers() {
  if (!currentNeuralData) return;
  currentNeuralData.nns.forEach(function(nn) {
    if (!nn.mission_started_at) return;
    const elapsed = Date.now() - new Date(nn.mission_started_at).getTime();
    if (elapsed >= MISSION_MS) return;
    const el = document.getElementById('neural-timer-' + nn.line_type);
    if (el) el.textContent = formatCountdown(MISSION_MS - elapsed);
  });
}

// ── Действия ─────────────────────────────────────────────────

async function doNeuralStart(lineType) {
  const player = getCurrentPlayer();
  if (!player || !currentNeuralData) return;
  setBtnLoading(lineType);
  try {
    const result = await startNeural(player.id, lineType);
    const nn = currentNeuralData.nns.find(function(n) { return n.line_type === lineType; });
    if (nn) {
      nn.mission_started_at = result.mission_started_at;
      nn.missions_today     = result.missions_today;
      nn.last_reset_date    = todayUTC();
    }
    renderNeuralContent();
    startNeuralTimer();
    showNeuralMsg(lineType, 'Задание запущено!', 'ok');
  } catch (e) {
    renderNeuralContent();
    showNeuralMsg(lineType, e.message, 'err');
  }
}

async function doNeuralCollect(lineType) {
  const player = getCurrentPlayer();
  if (!player || !currentNeuralData) return;
  setBtnLoading(lineType);
  try {
    const result = await collectNeural(player.id, lineType);
    const nn = currentNeuralData.nns.find(function(n) { return n.line_type === lineType; });
    if (nn) nn.mission_started_at = null;
    currentNeuralData.base.rare_materials = result.rare_materials;

    const rRareEl = document.getElementById('r-rare');
    if (rRareEl) rRareEl.textContent = result.rare_materials;
    const rXpEl = document.getElementById('r-xp');
    if (rXpEl) rXpEl.textContent = result.xp;

    renderNeuralContent();
    startNeuralTimer();
    showNeuralMsg(lineType, '+' + result.xp_gained + ' ' + ICON_XP + ' \u00b7 +' + result.rare_gained + ' ' + ICON_RARE + '!', 'ok');
  } catch (e) {
    renderNeuralContent();
    showNeuralMsg(lineType, e.message, 'err');
  }
}

async function doNeuralUpgrade(lineType) {
  const player = getCurrentPlayer();
  if (!player || !currentNeuralData) return;
  setBtnLoading(lineType);
  try {
    const result = await upgradeNeural(player.id, lineType);
    currentNeuralData.base.rare_materials = result.rare_materials;

    const nn = currentNeuralData.nns.find(function(n) { return n.line_type === lineType; });
    if (nn) {
      nn.version = result.version;
    } else {
      currentNeuralData.nns.push({
        line_type:          lineType,
        version:            result.version,
        mission_started_at: null,
        missions_today:     0,
        last_reset_date:    todayUTC(),
      });
    }

    const rRareEl = document.getElementById('r-rare');
    if (rRareEl) rRareEl.textContent = result.rare_materials;

    renderNeuralContent();
    const cfg = NEURAL_CFG[lineType];
    showNeuralMsg(lineType, cfg.name + ' ' + cfg.versions[result.version - 1] + ' открыта!', 'ok');
  } catch (e) {
    renderNeuralContent();
    showNeuralMsg(lineType, e.message, 'err');
  }
}

function setBtnLoading(lineType) {
  const container = document.getElementById('neural-btns-' + lineType);
  if (!container) return;
  const btn = container.querySelector('button');
  if (btn) { btn.disabled = true; btn.textContent = '\u2026'; }
}

function showNeuralMsg(lineType, text, type) {
  const el = document.getElementById('neural-msg-' + lineType);
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'ok' ? 'var(--accent)' : '#e05252';
  clearTimeout(el._timeout);
  el._timeout = setTimeout(function() { el.textContent = ''; }, 3500);
}
