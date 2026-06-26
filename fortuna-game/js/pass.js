// ============================================================
//  pass.js — Боевой пропуск.
//  Горизонтальная цепочка из 40 плиток-наград.
//  Вход через плитку «Пропуск» в профиле.
// ============================================================

// Пороги XP для каждого уровня (индекс 0 = уровень 1, значение = накопленный XP)
const BP_XP_THRESHOLDS = [
  0,    40,   80,   120,  160,
  220,  280,  340,  400,  460,
  580,  700,  820,  940,  1060,
  1240, 1420, 1600, 1780, 1960,
  2200, 2440, 2680, 2920, 3160,
  3460, 3760, 4060, 4360, 4660,
  5020, 5380, 5740, 6100, 6460,
  6860, 7260, 7660, 8060, 8460,
];

// Картинки наград по типу (пути относительно fortuna-game/)
const BP_REWARD_IMGS = {
  parts:       'res/parts.png',
  rare:        'kit/rare.png',
  boost_speed: 'pass/season_1/1_hour_boost.png',
  boost_extra: 'pass/season_1/extra_task.png',
  boost_xp:    'pass/season_1/double_exp.png',
};

let currentPassData = null;

// ── Утилиты ───────────────────────────────────────────────────

function formatPassMs(ms) {
  if (ms <= 0) return '0 мин';
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return h + 'ч ' + m + 'мин';
  if (h > 0) return h + 'ч';
  return m + 'мин';
}

function bpComputeLevel(seasonXp) {
  let level = 1;
  for (let i = 0; i < BP_XP_THRESHOLDS.length; i++) {
    if (seasonXp >= BP_XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  return Math.min(40, Math.max(1, level));
}

function getRewardImg(r) {
  if (r.reward_type === 'avatar') return r.reward_image || 'pass/exp.png';
  return BP_REWARD_IMGS[r.reward_type] || 'pass/exp.png';
}

// ── Основной рендер ───────────────────────────────────────────

async function renderPass() {
  const app = document.getElementById('app-content');
  if (!app) return;
  const player = getCurrentPlayer();
  if (!player) return;

  app.innerHTML = '<div class="card" style="text-align:center;padding:32px;color:var(--text-soft)">'
    + '&#1047;&#1072;&#1075;&#1088;&#1091;&#1078;&#1072;&#1077;&#1084; &#1087;&#1088;&#1086;&#1087;&#1091;&#1089;&#1082;&#8230;</div>';

  try {
    const initResult = await initBp(player.id);

    if (initResult.off_season) {
      app.innerHTML = '<div class="card" style="text-align:center;padding:40px;">'
        + '<div style="font-size:36px;margin-bottom:12px;">&#127988;</div>'
        + '<div style="font-size:16px;font-weight:650;margin-bottom:8px;">&#1052;&#1077;&#1078;&#1089;&#1077;&#1079;&#1086;&#1085;&#1100;&#1077;</div>'
        + '<div style="font-size:13px;color:var(--text-soft);">&#1053;&#1086;&#1074;&#1099;&#1081; &#1089;&#1077;&#1079;&#1086;&#1085; &#1073;&#1086;&#1077;&#1074;&#1086;&#1075;&#1086; &#1087;&#1088;&#1086;&#1087;&#1091;&#1089;&#1082;&#1072; &#1089;&#1082;&#1086;&#1088;&#1086; &#1085;&#1072;&#1095;&#1085;&#1105;&#1090;&#1089;&#1103;.</div>'
        + '</div>';
      return;
    }

    const season = initResult.season;
    const bp     = initResult.battle_pass;

    const [rewards, profile, base] = await Promise.all([
      fetchBpRewards(season.id),
      fetchPlayerProfileById(player.id),
      fetchPlayerBase(player.id),
    ]);

    currentPassData = { season, bp, rewards, profile, base };
  } catch (e) {
    app.innerHTML = '<div class="card" style="text-align:center;padding:32px;color:var(--accent)">'
      + '&#1054;&#1096;&#1080;&#1073;&#1082;&#1072;: '
      + (typeof escapeHtml === 'function' ? escapeHtml(e.message) : e.message)
      + '</div>';
    return;
  }

  renderPassContent();
}

function renderPassContent() {
  const app = document.getElementById('app-content');
  if (!app || !currentPassData) return;

  const { season, bp, rewards, profile, base } = currentPassData;
  const now   = new Date();
  const today = now.toISOString().split('T')[0];

  // Сезонный XP = текущий XP игрока − снимок на начало сезона
  const seasonXp     = Math.max(0, (profile.xp || 0) - (bp.xp_snapshot || 0));
  const currentLevel = bpComputeLevel(seasonXp);

  // Прогресс XP внутри текущего уровня
  const curThresh  = BP_XP_THRESHOLDS[currentLevel - 1];
  const nextThresh = currentLevel < 40 ? BP_XP_THRESHOLDS[currentLevel] : BP_XP_THRESHOLDS[39];
  const xpInLevel  = seasonXp - curThresh;
  const xpNeeded   = nextThresh - curThresh;
  const xpPct      = currentLevel >= 40 ? 100 : (xpNeeded > 0 ? Math.min(100, Math.round((xpInLevel / xpNeeded) * 100)) : 100);

  // Активные бусты
  const speedActive = !!(base.boost_speed_until && new Date(base.boost_speed_until) > now);
  const extraActive = base.boost_extra_date === today;
  const xpBoostActive = !!(base.boost_xp_until && new Date(base.boost_xp_until) > now);

  // Собранные уровни
  const claimedSet     = new Set(bp.claimed_levels || []);
  const claimableCount = rewards.filter(function(r) {
    return !claimedSet.has(r.level) && seasonXp >= r.xp_required;
  }).length;

  // ── Заголовок ─────────────────────────────────────────────

  const xpLabelRight = currentLevel >= 40
    ? seasonXp + '\u00a0XP &#8226; &#1052;&#1072;&#1082;&#1089;&#1080;&#1084;!'
    : xpInLevel + ' / ' + xpNeeded + '\u00a0XP';
  const levelUpLabel  = currentLevel >= 40
    ? '&#1052;&#1072;&#1082;&#1089;&#1080;&#1084;&#1072;&#1083;&#1100;&#1085;&#1099;&#1081; &#1091;&#1088;&#1086;&#1074;&#1077;&#1085;&#1100;!'
    : '&#1044;&#1086; &#1091;&#1088;&#1086;&#1074;&#1085;&#1103; ' + (currentLevel + 1);

  // Блок активных бустов
  let boostHtml = '';
  if (speedActive || extraActive || xpBoostActive) {
    const items = [];
    if (speedActive)   items.push('<img src="pass/season_1/1_hour_boost.png" style="width:15px;height:15px;object-fit:contain;vertical-align:middle;margin-right:4px;" alt=""> &#1057;&#1082;&#1086;&#1088;&#1086;&#1089;&#1090;&#1100; -1&#1095; &nbsp;&#183;&nbsp; &#1077;&#1097;&#1105; ' + formatPassMs(new Date(base.boost_speed_until) - now));
    if (extraActive)   items.push('<img src="pass/season_1/extra_task.png"   style="width:15px;height:15px;object-fit:contain;vertical-align:middle;margin-right:4px;" alt=""> &#1044;&#1086;&#1087;. &#1079;&#1072;&#1076;&#1072;&#1085;&#1080;&#1077; &nbsp;&#183;&nbsp; &#1076;&#1086; &#1087;&#1086;&#1083;&#1091;&#1085;&#1086;&#1095;&#1080; UTC');
    if (xpBoostActive) items.push('<img src="pass/season_1/double_exp.png"   style="width:15px;height:15px;object-fit:contain;vertical-align:middle;margin-right:4px;" alt=""> XP &#215;2 &nbsp;&#183;&nbsp; &#1077;&#1097;&#1105; ' + formatPassMs(new Date(base.boost_xp_until) - now));
    boostHtml = '<div style="background:var(--accent-soft);border-radius:8px;padding:8px 12px;margin-top:10px;">'
      + '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin-bottom:5px;">&#9889; &#1040;&#1082;&#1090;&#1080;&#1074;&#1085;&#1099;&#1077; &#1073;&#1091;&#1089;&#1090;&#1099;</div>'
      + items.map(function(i) { return '<div style="font-size:11px;margin-bottom:2px;">' + i + '</div>'; }).join('')
      + '</div>';
  }

  const claimBadge = claimableCount > 0
    ? '<div style="background:var(--accent-soft);border:1px solid var(--accent);border-radius:8px;padding:7px 12px;margin-top:8px;display:flex;align-items:center;gap:8px;">'
      + '<span style="font-size:16px;">&#127873;</span>'
      + '<span style="font-size:12px;color:var(--accent);font-weight:650;">&#1044;&#1086;&#1089;&#1090;&#1091;&#1087;&#1085;&#1086; &#1085;&#1072;&#1075;&#1088;&#1072;&#1076;: ' + claimableCount + ' — &#1087;&#1088;&#1086;&#1082;&#1088;&#1091;&#1090;&#1080; &#1074;&#1087;&#1088;&#1072;&#1074;&#1086;</span>'
      + '</div>'
    : '';

  const landscapeHint = '<div style="background:var(--surface-2);border-radius:8px;padding:7px 12px;margin-top:8px;display:flex;align-items:center;gap:8px;">'
    + '<span style="font-size:15px;">&#128260;</span>'
    + '<span style="font-size:11px;color:var(--text-soft);">&#1044;&#1083;&#1103; &#1091;&#1076;&#1086;&#1073;&#1085;&#1086;&#1075;&#1086; &#1087;&#1088;&#1086;&#1089;&#1084;&#1086;&#1090;&#1088;&#1072; &#1094;&#1077;&#1087;&#1086;&#1095;&#1082;&#1080; — &#1087;&#1077;&#1088;&#1077;&#1074;&#1077;&#1088;&#1085;&#1080; &#1091;&#1089;&#1090;&#1088;&#1086;&#1081;&#1089;&#1090;&#1074;&#1086;</span>'
    + '</div>';

  const headerHtml = '<div class="card">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">'
    + '<div>'
    + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-soft);margin-bottom:2px;">'
    + (typeof escapeHtml === 'function' ? escapeHtml(season.name) : season.name) + ' &nbsp;&#183;&nbsp; &#1041;&#1086;&#1077;&#1074;&#1086;&#1081; &#1087;&#1088;&#1086;&#1087;&#1091;&#1089;&#1082;</div>'
    + '<div style="font-size:24px;font-weight:800;letter-spacing:-.02em;line-height:1.1;">&#1059;&#1088;&#1086;&#1074;&#1077;&#1085;&#1100; ' + currentLevel
    + '<span style="font-size:14px;color:var(--text-soft);font-weight:500;"> / 40</span></div>'
    + '<div style="font-size:12px;color:var(--text-soft);margin-top:3px;">' + seasonXp + '\u00a0&#1089;&#1077;&#1079;&#1086;&#1085;&#1085;&#1086;&#1075;&#1086; ' + ICON_XP + '</div>'
    + '</div>'
    + '<div style="width:52px;height:52px;border-radius:14px;background:var(--accent-soft);border:2px solid var(--accent);'
    + 'display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--accent);">'
    + currentLevel + '</div>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-soft);margin-bottom:5px;">'
    + '<span>' + levelUpLabel + '</span>'
    + '<span style="font-weight:650;">' + xpLabelRight + '</span>'
    + '</div>'
    + '<div style="background:var(--surface-2);border-radius:99px;height:8px;overflow:hidden;">'
    + '<div style="background:var(--accent);height:100%;border-radius:99px;width:' + xpPct + '%;transition:width .4s;"></div>'
    + '</div>'
    + boostHtml + claimBadge + landscapeHint
    + '<div class="factory-msg" id="pass-msg" style="margin-top:8px;min-height:16px;"></div>'
    + '</div>';

  // ── Цепочка плиток ────────────────────────────────────────

  const sorted = (rewards || []).slice().sort(function(a, b) { return a.level - b.level; });
  const tiles  = sorted.map(function(r) {
    return buildPassTile(r, claimedSet, seasonXp);
  }).join('');

  const chainHtml = '<div class="card" style="padding:14px;">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;'
    + 'color:var(--text-soft);margin-bottom:12px;">&#1053;&#1072;&#1075;&#1088;&#1072;&#1076;&#1099;</div>'
    + '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;">'
    + '<div style="display:flex;gap:8px;padding:2px 2px 6px;width:max-content;" id="pass-chain">'
    + tiles
    + '</div>'
    + '</div>'
    + '</div>';

  app.innerHTML = headerHtml + chainHtml;
}

// ── Плитка награды ────────────────────────────────────────────

function buildPassTile(r, claimedSet, seasonXp) {
  const isClaimed   = claimedSet.has(r.level);
  const isReady     = !isClaimed && seasonXp >= r.xp_required;
  const isLocked    = !isClaimed && !isReady;
  const isMilestone = r.reward_type === 'avatar';

  const imgSrc = getRewardImg(r);

  // Размер: аватарки чуть шире
  const tileW = isMilestone ? '78px' : '72px';

  // Рамка и фон плитки
  let tileBorder, tileBg, tileOp;
  if (isReady) {
    tileBorder = 'border:2px solid var(--accent);';
    tileBg     = 'background:var(--accent-soft);';
    tileOp     = '';
  } else if (isClaimed) {
    tileBorder = 'border:1.5px solid var(--border);';
    tileBg     = 'background:var(--surface-2);';
    tileOp     = 'opacity:0.35;';
  } else {
    tileBorder = 'border:1.5px solid var(--border);';
    tileBg     = 'background:var(--surface-2);';
    tileOp     = 'opacity:0.65;';
  }

  // Бейдж уровня
  const lvlColor = isReady
    ? 'color:var(--accent);font-weight:800;'
    : isClaimed
      ? 'color:#4a9a6a;font-weight:700;'
      : 'color:var(--text-soft);font-weight:700;';
  const lvlText = isClaimed
    ? '&#10003;'
    : 'Ур.\u00a0' + r.level;

  // Иконка: для аватарок — квадратное изображение аватарки
  let iconHtml;
  if (r.reward_type === 'avatar') {
    iconHtml = '<img src="' + imgSrc + '" style="width:44px;height:44px;border-radius:8px;object-fit:cover;" '
      + 'onerror="this.src=\'pass/exp.png\'" alt="">';
  } else {
    iconHtml = '<img src="' + imgSrc + '" style="width:36px;height:36px;object-fit:contain;" alt="">';
  }

  // Подпись
  let subLabel;
  if (r.reward_amount > 0) {
    subLabel = '<span style="color:var(--accent);font-weight:700;font-size:10px;">+'
      + r.reward_amount + '</span>'
      + '<span style="font-size:8px;color:var(--text-soft);display:block;margin-top:1px;">'
      + (typeof escapeHtml === 'function' ? escapeHtml(r.reward_label) : r.reward_label)
      + '</span>';
  } else {
    subLabel = '<span style="font-size:8px;">'
      + (typeof escapeHtml === 'function' ? escapeHtml(r.reward_label) : r.reward_label)
      + '</span>';
  }

  // Кнопка / статус
  let actionHtml;
  if (isReady) {
    actionHtml = '<button onclick="doClaimBp(' + r.level + ')" '
      + 'style="width:100%;padding:5px 0;border:none;border-radius:6px;background:var(--accent);'
      + 'color:#fff;font-size:9px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px;">'
      + '&#1047;&#1072;&#1073;&#1088;&#1072;&#1090;&#1100;</button>';
  } else if (isClaimed) {
    actionHtml = '<div style="font-size:8px;color:#4a9a6a;font-weight:700;margin-top:4px;">'
      + '&#1055;&#1086;&#1083;&#1091;&#1095;&#1077;&#1085;&#1086;</div>';
  } else {
    actionHtml = '<div style="font-size:8px;color:var(--text-soft);margin-top:4px;text-align:center;line-height:1.3;">'
      + r.xp_required + '<br>XP</div>';
  }

  return '<div style="width:' + tileW + ';flex-shrink:0;display:flex;flex-direction:column;align-items:center;'
    + 'padding:10px 5px 8px;border-radius:12px;' + tileBorder + tileBg + tileOp + '">'
    + '<div style="font-size:9px;' + lvlColor + 'margin-bottom:6px;">' + lvlText + '</div>'
    + '<div style="width:44px;height:44px;border-radius:10px;background:var(--surface);'
    + 'border:1px solid var(--border);display:flex;align-items:center;justify-content:center;'
    + 'overflow:hidden;margin-bottom:5px;">'
    + iconHtml
    + '</div>'
    + '<div style="font-size:9px;text-align:center;color:var(--text-soft);line-height:1.3;'
    + 'min-height:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;">'
    + subLabel
    + '</div>'
    + actionHtml
    + '</div>';
}

// ── Действие: забрать награду ─────────────────────────────────

async function doClaimBp(level) {
  const player = getCurrentPlayer();
  if (!player || !currentPassData) return;

  // Блокируем все кнопки на время запроса
  document.querySelectorAll('#pass-chain button').forEach(function(b) {
    b.disabled = true;
    b.textContent = '\u2026';
  });

  try {
    const result = await claimBpReward(player.id, currentPassData.season.id, level);

    // Обновляем список собранных уровней
    if (!currentPassData.bp.claimed_levels) currentPassData.bp.claimed_levels = [];
    if (!currentPassData.bp.claimed_levels.includes(level)) {
      currentPassData.bp.claimed_levels.push(level);
    }

    // Обновляем ресурсы в базе (parts, rare, бусты)
    if (result.base) {
      currentPassData.base = Object.assign({}, currentPassData.base, result.base);
      var rP = document.getElementById('r-parts');
      if (rP && result.base.parts != null) rP.textContent = result.base.parts;
      var rR = document.getElementById('r-rare');
      if (rR && result.base.rare_materials != null) rR.textContent = result.base.rare_materials;
    }

    // Если аватарка — добавляем в unlocked локально
    if (result.reward_type === 'avatar' && result.reward_image) {
      if (!currentPassData.profile.avatar_unlocked) currentPassData.profile.avatar_unlocked = [];
      if (!currentPassData.profile.avatar_unlocked.includes(result.reward_image)) {
        currentPassData.profile.avatar_unlocked.push(result.reward_image);
      }
    }

    const lbl = typeof escapeHtml === 'function' ? escapeHtml(result.reward_label) : result.reward_label;
    showPassMsg(lbl + ' — &#1087;&#1086;&#1083;&#1091;&#1095;&#1077;&#1085;&#1086;!', 'ok');
    renderPassContent();
  } catch (e) {
    showPassMsg(typeof escapeHtml === 'function' ? escapeHtml(e.message) : e.message, 'err');
    renderPassContent();
  }
}

function showPassMsg(text, type) {
  const el = document.getElementById('pass-msg');
  if (!el) return;
  el.innerHTML = text;
  el.style.color = type === 'ok' ? 'var(--accent)' : '#e05252';
  clearTimeout(el._t);
  el._t = setTimeout(function() { if (el) el.innerHTML = ''; }, 3500);
}
