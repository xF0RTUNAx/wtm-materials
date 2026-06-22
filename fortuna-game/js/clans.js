// ============================================================
//  clans.js — Этап 5: Кланы, задания, рейтинг и чат
//  Дизайн: комбинация вариантов 1+2+3 (баннер + ранг + акцент-бордер)
//  Иконка Руды: " + ICON_ORE + " (📋 чертёж)
// ============================================================

// ─── Константы ───────────────────────────────────────────────

const CLAN_INTEL_GOAL  = 120;
const CLAN_MAX_MEMBERS = 4;
const CLAN_REWARD_XP   = 500;

// ─── Состояние ───────────────────────────────────────────────

let clanSbClient      = null;  // Supabase JS client (для Realtime)
let clanRtChannel     = null;  // активный Realtime-канал
let chatActiveCh      = 'general'; // 'general' | clan_id (uuid)
let chatWidgetOpen    = false;
let chatNewCount      = 0;
let chatPlayerClanId  = null;  // clan_id текущего игрока в чате

// ─── Утилиты ─────────────────────────────────────────────────

function clanEsc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function currentWeekStartUtc() {
  var now  = new Date();
  var day  = now.getUTCDay();
  var diff = day === 0 ? -6 : 1 - day;
  var mon  = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + diff
  ));
  return mon.toISOString().slice(0, 10);
}

function msToNextMonday() {
  var now  = new Date();
  var day  = now.getUTCDay();
  var days = day === 0 ? 1 : 8 - day;
  var next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + days
  ));
  return next.getTime() - now.getTime();
}

function fmtCountdown(ms) {
  if (ms <= 0) return 'скоро сброс';
  var m  = Math.floor(ms / 60000);
  var d  = Math.floor(m / 1440);
  var h  = Math.floor((m % 1440) / 60);
  var mn = m % 60;
  if (d > 0) return d + 'д ' + h + 'ч';
  if (h > 0) return h + 'ч ' + mn + 'мин';
  return mn + 'мин';
}

function fmtTime(isoStr) {
  var d = new Date(isoStr);
  var h = String(d.getHours()).padStart(2, '0');
  var m = String(d.getMinutes()).padStart(2, '0');
  return h + ':' + m;
}

function clanInitials(login) {
  if (!login) return '?';
  var w = login.toUpperCase().split(/[\s_\-\.]+/);
  if (w.length >= 2) return w[0][0] + w[1][0];
  return login.slice(0, 2).toUpperCase();
}

function clanAvatarColor(login) {
  var palette = ['#c8643c','#4a9fd4','#5a7a3e','#8a6d2a','#7a4db5','#3e7a5e','#b5534a'];
  var hash = 0;
  for (var i = 0; i < (login || '').length; i++) hash += login.charCodeAt(i);
  return palette[hash % palette.length];
}

function getClanSb() {
  if (!clanSbClient && window.supabase) {
    clanSbClient = window.supabase.createClient(
      CONFIG.SUPABASE_URL,
      CONFIG.SUPABASE_ANON_KEY
    );
  }
  return clanSbClient;
}

// ─── Вспомогательные HTML-элементы ───────────────────────────

function avatarCircle(login, size) {
  size = size || 36;
  var bg  = clanAvatarColor(login);
  var ini = clanInitials(login);
  return '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
    'background:' + bg + ';display:flex;align-items:center;justify-content:center;' +
    'font-size:' + Math.round(size * 0.33) + 'px;font-weight:700;color:#fff;flex-shrink:0">' + ini + '</div>';
}

function roleTag(role) {
  if (role === 'leader') {
    return '<span style="background:var(--accent-soft);color:var(--accent);border-radius:6px;' +
      'padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">&#128081; лидер</span>';
  }
  if (role === 'officer') {
    return '<span style="background:var(--surface-2);color:#4a9fd4;border-radius:6px;' +
      'padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">&#11088; офицер</span>';
  }
  return '<span style="background:var(--surface-2);color:var(--text-soft);border-radius:6px;' +
    'padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">участник</span>';
}

function clanBtn(label, type, onclick) {
  var base = 'width:100%;padding:12px;border:none;border-radius:var(--radius-sm);' +
    'font-size:14px;font-weight:650;font-family:inherit;';
  if (type === 'primary') {
    return '<button onclick="' + onclick + '" style="' + base +
      'background:var(--accent);color:#fff;cursor:pointer">' + label + '</button>';
  }
  if (type === 'ghost') {
    return '<button onclick="' + onclick + '" style="' + base +
      'background:var(--surface-2);color:var(--text);cursor:pointer">' + label + '</button>';
  }
  if (type === 'danger') {
    return '<button onclick="' + onclick + '" style="' + base +
      'background:var(--surface-2);color:#e05252;cursor:pointer">' + label + '</button>';
  }
  if (type === 'disabled') {
    return '<button disabled style="' + base +
      'background:var(--surface-2);color:var(--text-soft);cursor:default;opacity:0.6">' + label + '</button>';
  }
  return '';
}

function showClanMsg(elId, text, isOk) {
  var el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.style.color = isOk ? 'var(--accent)' : '#e05252';
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.textContent = ''; }, 4000);
}

// ─── Доп. fetchers (с join на players) ───────────────────────

async function fetchClanMembersRich(clanId) {
  var rows = await supabaseSelect(
    'clan_members?clan_id=eq.' + clanId +
    '&select=player_id,role,joined_at,players(login,xp)&order=joined_at.asc'
  );
  return rows || [];
}

async function fetchPendingApps(clanId) {
  var rows = await supabaseSelect(
    'clan_applications?clan_id=eq.' + clanId +
    '&status=eq.pending&select=id,player_id,created_at,players(login)&order=created_at.asc'
  );
  return rows || [];
}

async function fetchMsgsForChannel(channel) {
  var rows = await supabaseSelect(
    'messages?channel=eq.' + channel +
    '&order=created_at.desc&limit=50&select=*'
  );
  return (rows || []).reverse();
}

// ─── Главный рендер экрана Кланов ────────────────────────────

async function renderClans() {
  var app = document.getElementById('app-content');
  if (!app) return;
  var player = getCurrentPlayer();
  if (!player) return;

  app.innerHTML = '<div class="card" style="text-align:center;padding:32px;color:var(--text-soft)">Загружаем\u2026</div>';

  try {
    var profile = await fetchPlayerProfileById(player.id);
    if (profile && profile.clan_id) {
      await renderInClanScreen(player, profile.clan_id);
    } else {
      await renderNoClanScreen(player);
    }
  } catch(e) {
    app.innerHTML = '<div class="card" style="text-align:center;padding:32px;color:var(--accent)">' +
      'Ошибка: ' + clanEsc(e.message) + '</div>';
  }
}

// ─── Экран: игрок без клана ───────────────────────────────────

async function renderNoClanScreen(player) {
  var app = document.getElementById('app-content');

  var allClans = [], myApp = null;
  try {
    var res = await Promise.all([
      fetchAllClans(),
      fetchPlayerApplication(player.id),
    ]);
    allClans = res[0];
    myApp    = res[1];
  } catch(e) { /* некритично */ }

  // Список кланов (дизайн V2+V3: ранги + акцент-бордер слева)
  var rankColors = ['var(--accent)', '#888', '#888'];
  var clanListHtml = allClans.length === 0
    ? '<div class="card" style="text-align:center;color:var(--text-soft);padding:24px">Пока нет кланов. Создай первый!</div>'
    : allClans.map(function(c, idx) {
        var full  = c.member_count >= CLAN_MAX_MEMBERS;
        var myPending = myApp && myApp.clan_id === c.id;

        var btnHtml;
        if (myPending) {
          btnHtml = '<div style="background:var(--surface-2);border-radius:var(--radius-sm);' +
            'padding:8px 12px;font-size:12px;color:var(--text-soft);font-weight:600;text-align:center">' +
            '&#9203; Заявка на рассмотрении</div>';
        } else if (full) {
          btnHtml = clanBtn('Заполнен', 'disabled', '');
        } else {
          btnHtml = '<button onclick="doApplyClan(\'' + c.id + '\')" style="' +
            'width:100%;padding:9px;border:1px solid var(--accent);border-radius:var(--radius-sm);' +
            'background:transparent;color:var(--accent);font-size:13px;font-weight:650;' +
            'cursor:pointer;font-family:inherit">Подать заявку</button>';
        }

        return '<div class="card" style="padding:12px 14px;border-left:3px solid var(--accent);border-radius:0 var(--radius-sm) var(--radius-sm) 0;margin-bottom:8px">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:9px">' +
          '<div style="font-size:16px;font-weight:900;color:' + rankColors[Math.min(idx, 2)] + ';width:24px;flex-shrink:0">#' + (idx + 1) + '</div>' +
          '<span style="background:var(--accent);color:#fff;border-radius:8px;padding:3px 10px;font-size:12px;font-weight:700;letter-spacing:.5px">' + clanEsc(c.tag) + '</span>' +
          '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + clanEsc(c.name) + '</div>' +
          '<div style="font-size:11px;color:var(--text-soft)">' + c.member_count + '/' + CLAN_MAX_MEMBERS + ' участников</div>' +
          '</div>' +
          '</div>' + btnHtml + '</div>';
      }).join('');

  app.innerHTML =
    // Заголовок с кнопкой назад
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
    '<button onclick="renderProfile && renderProfile()" ' +
    'style="background:var(--surface-2);color:var(--text);border:none;border-radius:var(--radius-sm);' +
    'padding:8px 12px;font-size:13px;cursor:pointer;font-family:inherit">&#8592; Профиль</button>' +
    '<div style="font-size:15px;font-weight:700">Кланы</div>' +
    '</div>' +

    // Форма создания клана
    '<div class="card" style="margin-bottom:10px">' +
    '<div style="font-size:13px;font-weight:700;margin-bottom:12px">&#127979; Создать клан</div>' +
    '<input id="clan-name-inp" placeholder="Название (2–30 символов)" maxlength="30" ' +
    'style="width:100%;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);' +
    'border-radius:var(--radius-sm);color:var(--text);font-size:13px;font-family:inherit;' +
    'margin-bottom:8px;box-sizing:border-box;outline:none" />' +
    '<input id="clan-tag-inp" placeholder="Тег [2–5 символов, напр. WTM]" maxlength="5" ' +
    'style="width:100%;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);' +
    'border-radius:var(--radius-sm);color:var(--text);font-size:13px;font-family:inherit;' +
    'margin-bottom:8px;box-sizing:border-box;outline:none" />' +
    '<input id="clan-desc-inp" placeholder="Описание (необязательно)" maxlength="120" ' +
    'style="width:100%;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);' +
    'border-radius:var(--radius-sm);color:var(--text);font-size:13px;font-family:inherit;' +
    'margin-bottom:10px;box-sizing:border-box;outline:none" />' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
    '<span style="font-size:12px;color:var(--text-soft)">Стоимость создания</span>' +
    '<span style="font-size:13px;font-weight:700;color:var(--accent)">' + '10 ' + ICON_RARE + ' редких' + '</span>' +
    '</div>' +
    clanBtn('Создать клан', 'primary', 'doCreateClan()') +
    '<div id="clan-create-msg" style="text-align:center;font-size:12px;margin-top:8px;min-height:16px"></div>' +
    '</div>' +

    // Список кланов
    (allClans.length > 0
      ? '<div style="font-size:11px;color:var(--text-soft);font-weight:600;text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Рейтинг кланов</div>'
      : '') +
    clanListHtml;
}

// ─── Экран: игрок в клане ─────────────────────────────────────

async function renderInClanScreen(player, clanId) {
  var app = document.getElementById('app-content');

  var clan, members, pendingApps = [], myClaimed = false;
  try {
    var res2 = await Promise.all([fetchClanById(clanId), fetchClanMembersRich(clanId)]);
    clan    = res2[0];
    members = res2[1];
  } catch(e) {
    app.innerHTML = '<div class="card" style="text-align:center;padding:32px;color:var(--accent)">Ошибка загрузки</div>';
    return;
  }
  if (!clan) {
    app.innerHTML = '<div class="card" style="text-align:center;padding:32px;color:var(--text-soft)">Клан не найден</div>';
    return;
  }

  var myMember  = members.find(function(m) { return m.player_id === player.id; });
  var myRole    = myMember ? myMember.role : 'member';
  var isLeader  = myRole === 'leader';
  var canManage = myRole === 'leader' || myRole === 'officer';

  // Заявки (только для лидера/офицера)
  if (canManage) {
    try { pendingApps = await fetchPendingApps(clanId); } catch(e) {}
  }

  // Руда и задание
  var weekStart    = currentWeekStartUtc();
  var intelReset   = clan.task_week_start < weekStart;
  var intel        = intelReset ? 0 : (clan.intel || 0);
  var intelPct     = Math.min(100, Math.round((intel / CLAN_INTEL_GOAL) * 100));
  var intelDone    = intel >= CLAN_INTEL_GOAL;
  var timerLeft    = msToNextMonday();

  // Проверяем забрал ли награду
  try { myClaimed = await fetchClanRewardClaimed(clanId, player.id, weekStart); } catch(e) {}

  // Суммарный XP (рейтинг клана)
  var totalXp = 0;
  members.forEach(function(m) {
    if (m.players && m.players.xp) totalXp += m.players.xp;
  });
  var xpDisplay = totalXp > 9999
    ? (totalXp / 1000).toFixed(1) + 'k'
    : totalXp.toLocaleString();

  // ── HTML участников ──────────────────────────────────────────
  var memberRows = members.map(function(m) {
    var pLogin = (m.players && m.players.login) ? m.players.login : '—';
    var pXp    = (m.players && m.players.xp)
      ? Number(m.players.xp).toLocaleString() + ' XP'
      : '0 XP';
    var isMe   = m.player_id === player.id;

    var actions = '';
    if (isLeader && !isMe && m.role !== 'leader') {
      var toggleRole  = m.role === 'officer' ? 'member' : 'officer';
      var toggleLabel = m.role === 'officer' ? 'Снять офицера' : 'Назначить офицером';
      actions = '<div style="display:flex;gap:6px;margin-top:7px">' +
        '<button onclick="doSetClanRole(\'' + m.player_id + '\',\'' + clanEsc(pLogin) + '\',\'' + toggleRole + '\')" ' +
        'style="flex:1;padding:6px 8px;background:var(--surface-2);color:var(--text);border:none;' +
        'border-radius:var(--radius-sm);font-size:11px;font-weight:650;cursor:pointer;font-family:inherit">' +
        toggleLabel + '</button>' +
        '<button onclick="doKickMember(\'' + m.player_id + '\',\'' + clanEsc(pLogin) + '\')" ' +
        'style="flex:1;padding:6px 8px;background:var(--surface-2);color:#e05252;border:none;' +
        'border-radius:var(--radius-sm);font-size:11px;font-weight:650;cursor:pointer;font-family:inherit">' +
        'Исключить</button>' +
        '</div>';
    } else if (myRole === 'officer' && !isMe && m.role === 'member') {
      actions = '<div style="margin-top:7px">' +
        '<button onclick="doKickMember(\'' + m.player_id + '\',\'' + clanEsc(pLogin) + '\')" ' +
        'style="width:100%;padding:6px 8px;background:var(--surface-2);color:#e05252;border:none;' +
        'border-radius:var(--radius-sm);font-size:11px;font-weight:650;cursor:pointer;font-family:inherit">' +
        'Исключить</button></div>';
    }

    return '<div style="padding:10px 0;border-bottom:1px solid var(--surface-2)">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
      avatarCircle(pLogin, 36) +
      '<div style="flex:1;min-width:0">' +
      '<div style="font-size:13px;font-weight:700">' + clanEsc(pLogin) +
      (isMe ? ' <span style="font-size:10px;color:var(--accent)">(я)</span>' : '') +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-soft)">' + pXp + '</div>' +
      '</div>' +
      roleTag(m.role) +
      '</div>' + actions + '</div>';
  }).join('');

  // ── HTML заявок ──────────────────────────────────────────────
  var appsHtml = '';
  if (canManage && pendingApps.length > 0) {
    var appRows = pendingApps.map(function(a) {
      var aLogin = (a.players && a.players.login) ? a.players.login : '—';
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--surface-2)">' +
        avatarCircle(aLogin, 32) +
        '<div style="flex:1;font-size:13px;font-weight:600">' + clanEsc(aLogin) + '</div>' +
        '<div style="display:flex;gap:6px">' +
        '<button onclick="doRespondApp(\'' + a.id + '\',\'approve\')" ' +
        'style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">&#10003;</button>' +
        '<button onclick="doRespondApp(\'' + a.id + '\',\'reject\')" ' +
        'style="padding:7px 14px;background:var(--surface-2);color:#e05252;border:none;border-radius:var(--radius-sm);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">&#10005;</button>' +
        '</div></div>';
    }).join('');

    appsHtml = '<div class="card" style="margin-bottom:10px">' +
      '<div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:8px">' +
      '&#128338; Входящие заявки (' + pendingApps.length + ')</div>' +
      appRows +
      '</div>';
  }

  // ── Кнопка награды ───────────────────────────────────────────
  var rewardBtn;
  if (myClaimed) {
    rewardBtn = clanBtn('Награда уже получена &#10003;', 'disabled', '');
  } else if (intelDone) {
    rewardBtn = clanBtn('Забрать ' + CLAN_REWARD_XP + ' ' + ICON_XP + ' &#127881;', 'primary', 'doClaimClanReward()');
  } else {
    rewardBtn = clanBtn('Ещё ' + (CLAN_INTEL_GOAL - intel) + ' " + ICON_ORE + " до награды', 'disabled', '');
  }

  // ── Итоговый HTML ────────────────────────────────────────────
  app.innerHTML =
    // Заголовок
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
    '<button onclick="renderProfile && renderProfile()" ' +
    'style="background:var(--surface-2);color:var(--text);border:none;border-radius:var(--radius-sm);' +
    'padding:8px 12px;font-size:13px;cursor:pointer;font-family:inherit">&#8592; Профиль</button>' +
    '<div style="font-size:15px;font-weight:700">Клан</div>' +
    (canManage && pendingApps.length > 0
      ? '<div style="background:var(--accent);color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;margin-left:auto">' + pendingApps.length + ' заявок</div>'
      : '') +
    '</div>' +

    // Баннер клана (V1: большой TAG по центру)
    '<div style="background:var(--accent);border-radius:var(--radius-sm);padding:18px 16px;text-align:center;margin-bottom:10px">' +
    '<div style="font-size:32px;font-weight:900;color:#fff;letter-spacing:3px;line-height:1">' + clanEsc(clan.tag) + '</div>' +
    '<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.95);margin-top:4px">' + clanEsc(clan.name) + '</div>' +
    (clan.description
      ? '<div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:4px">' + clanEsc(clan.description) + '</div>'
      : '') +
    '</div>' +

    // Три стата (V3: компактная сетка)
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">' +
    '<div class="card" style="padding:10px;text-align:center">' +
    '<div style="font-size:15px;font-weight:700;color:var(--accent)">' + xpDisplay + '</div>' +
    '<div style="font-size:10px;color:var(--text-soft);margin-top:2px">XP клана</div>' +
    '</div>' +
    '<div class="card" style="padding:10px;text-align:center">' +
    '<div style="font-size:15px;font-weight:700;color:var(--text)">' + members.length + '/' + CLAN_MAX_MEMBERS + '</div>' +
    '<div style="font-size:10px;color:var(--text-soft);margin-top:2px">участников</div>' +
    '</div>' +
    '<div class="card" style="padding:10px;text-align:center">' +
    '<div style="font-size:15px;font-weight:700;color:' + (intelDone ? 'var(--accent)' : 'var(--text)') + '">' + intel + '</div>' +
    '<div style="font-size:10px;color:var(--text-soft);margin-top:2px">" + ICON_ORE + " руда</div>' +
    '</div>' +
    '</div>' +

    // Участники (V2: XP и роль видны сразу)
    '<div class="card" style="margin-bottom:10px">' +
    '<div style="font-size:11px;color:var(--text-soft);font-weight:600;text-transform:uppercase;' +
    'letter-spacing:.8px;margin-bottom:4px">Участники</div>' +
    memberRows +
    '</div>' +

    // Заявки на вступление
    appsHtml +

    // Задание недели (V3: числа + прогресс)
    '<div class="card" style="margin-bottom:10px">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">' +
    '<div>' +
    '<div style="font-size:13px;font-weight:700">" + ICON_ORE + " Задание недели</div>' +
    '<div style="font-size:11px;color:var(--text-soft)">сброс через ' + fmtCountdown(timerLeft) + '</div>' +
    '</div>' +
    '<div style="text-align:right">' +
    '<div style="font-size:22px;font-weight:900;color:' + (intelDone ? 'var(--accent)' : 'var(--text)') + '">' + intel + '</div>' +
    '<div style="font-size:10px;color:var(--text-soft)">/ ' + CLAN_INTEL_GOAL + ' " + ICON_ORE + "</div>' +
    '</div>' +
    '</div>' +
    '<div style="background:var(--surface-2);border-radius:6px;height:10px;overflow:hidden;margin-bottom:4px">' +
    '<div style="width:' + intelPct + '%;height:100%;background:var(--accent);border-radius:6px;transition:width .4s"></div>' +
    '</div>' +
    '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-soft);margin-bottom:10px">' +
    '<span>0</span>' +
    '<span style="color:var(--accent);font-weight:700">' + intel + ' " + ICON_ORE + "</span>' +
    '<span>' + CLAN_INTEL_GOAL + '</span>' +
    '</div>' +
    rewardBtn +
    '<div id="clan-reward-msg" style="text-align:center;font-size:12px;margin-top:8px;min-height:16px"></div>' +
    '</div>' +

    // Выход из клана
    '<div class="card">' +
    '<div style="font-size:11px;color:var(--text-soft);margin-bottom:8px">' +
    'При выходе лидера лидерство переходит первому офицеру или участнику.' +
    '</div>' +
    clanBtn('Выйти из клана', 'danger', 'doLeaveClan()') +
    '<div id="clan-leave-msg" style="text-align:center;font-size:12px;margin-top:8px;min-height:16px"></div>' +
    '</div>';
}

// ─── Действие: создать клан ───────────────────────────────────

async function doCreateClan() {
  var player = getCurrentPlayer();
  if (!player) return;

  var nameEl = document.getElementById('clan-name-inp');
  var tagEl  = document.getElementById('clan-tag-inp');
  var descEl = document.getElementById('clan-desc-inp');
  var btn    = document.querySelector('[onclick="doCreateClan()"]');

  if (!nameEl || !tagEl) return;

  var name = nameEl.value.trim();
  var tag  = tagEl.value.trim().replace(/[\[\]\s]/g, '').toUpperCase();
  var desc = descEl ? descEl.value.trim() : '';

  if (!name) { showClanMsg('clan-create-msg', 'Введи название клана', false); return; }
  if (name.length < 2) { showClanMsg('clan-create-msg', 'Минимум 2 символа в названии', false); return; }
  if (!tag) { showClanMsg('clan-create-msg', 'Введи тег клана (2–5 символов)', false); return; }
  if (tag.length < 2 || tag.length > 5) { showClanMsg('clan-create-msg', 'Тег: от 2 до 5 символов', false); return; }

  if (btn) { btn.disabled = true; btn.textContent = '\u0421\u043e\u0437\u0434\u0430\u0451\u043c\u2026'; }

  try {
    var result = await createClan(player.id, name, tag, desc);
    // Обновляем контекст чата
    if (result.clan) setChatClanContext(result.clan.id);
    await renderClans();
  } catch(e) {
    showClanMsg('clan-create-msg', e.message, false);
    if (btn) { btn.disabled = false; btn.textContent = '\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u043a\u043b\u0430\u043d'; }
  }
}

// ─── Действие: подать заявку ─────────────────────────────────

async function doApplyClan(clanId) {
  var player = getCurrentPlayer();
  if (!player) return;

  try {
    await applyClan(player.id, clanId);
    await renderNoClanScreen(player);
  } catch(e) {
    alert(e.message);
  }
}

// ─── Действие: выйти из клана ────────────────────────────────

async function doLeaveClan() {
  var player = getCurrentPlayer();
  if (!player) return;

  if (!confirm('\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u043a\u043b\u0430\u043d\u0430?')) return;

  var btn = document.querySelector('[onclick="doLeaveClan()"]');
  if (btn) { btn.disabled = true; btn.textContent = '\u0412\u044b\u0445\u043e\u0434\u0438\u043c\u2026'; }

  try {
    var res = await leaveClan(player.id);
    setChatClanContext(null);
    if (res.clan_deleted) {
      await renderNoClanScreen(player);
    } else {
      await renderClans();
    }
  } catch(e) {
    showClanMsg('clan-leave-msg', e.message, false);
    if (btn) { btn.disabled = false; btn.textContent = '\u0412\u044b\u0439\u0442\u0438 \u0438\u0437 \u043a\u043b\u0430\u043d\u0430'; }
  }
}

// ─── Действие: исключить участника ───────────────────────────

async function doKickMember(targetId, targetLogin) {
  var player = getCurrentPlayer();
  if (!player) return;

  if (!confirm('\u0418\u0441\u043a\u043b\u044e\u0447\u0438\u0442\u044c ' + targetLogin + '?')) return;

  try {
    await kickMember(player.id, targetId);
    await renderClans();
  } catch(e) { alert(e.message); }
}

// ─── Действие: назначить/снять офицера ───────────────────────

async function doSetClanRole(targetId, targetLogin, newRole) {
  var player = getCurrentPlayer();
  if (!player) return;

  var label = newRole === 'officer'
    ? '\u043d\u0430\u0437\u043d\u0430\u0447\u0438\u0442\u044c \u043e\u0444\u0438\u0446\u0435\u0440\u043e\u043c'
    : '\u0441\u043d\u044f\u0442\u044c \u0441 \u043f\u043e\u0441\u0442\u0430';
  if (!confirm(targetLogin + ': ' + label + '?')) return;

  try {
    await setClanRole(player.id, targetId, newRole);
    await renderClans();
  } catch(e) { alert(e.message); }
}

// ─── Действие: ответить на заявку ────────────────────────────

async function doRespondApp(appId, decision) {
  var player = getCurrentPlayer();
  if (!player) return;

  if (event && event.target) event.target.disabled = true;

  try {
    var res = await respondApplication(player.id, appId, decision);
    await renderClans();
  } catch(e) { alert(e.message); }
}

// ─── Действие: забрать награду за задание ────────────────────

async function doClaimClanReward() {
  var player = getCurrentPlayer();
  if (!player) return;

  var btn = document.querySelector('[onclick="doClaimClanReward()"]');
  if (btn) { btn.disabled = true; btn.textContent = '\u0417\u0430\u0431\u0438\u0440\u0430\u0435\u043c\u2026'; }

  try {
    var result = await claimClanReward(player.id);
    showClanMsg('clan-reward-msg', '+' + CLAN_REWARD_XP + ' ' + ICON_XP + '! Итого: ' + result.xp + ' ' + ICON_XP, true);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '\u041d\u0430\u0433\u0440\u0430\u0434\u0430 \u043f\u043e\u043b\u0443\u0447\u0435\u043d\u0430 \u2713';
      btn.style.background = 'var(--surface-2)';
      btn.style.color      = 'var(--text-soft)';
      btn.style.opacity    = '0.6';
    }
    var xpEl = document.getElementById('r-xp');
    if (xpEl) xpEl.textContent = result.xp;
  } catch(e) {
    showClanMsg('clan-reward-msg', e.message, false);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '\u0417\u0430\u0431\u0440\u0430\u0442\u044c ' + CLAN_REWARD_XP + ' XP &#127881;';
      btn.style.background = 'var(--accent)';
      btn.style.color      = '#fff';
      btn.style.opacity    = '1';
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  ЧАТ-ВИДЖЕТ (плавающий, position:fixed)
// ═══════════════════════════════════════════════════════════════

function initChatWidget(playerClanId) {
  if (document.getElementById('chat-widget-root')) return;
  chatPlayerClanId = playerClanId || null;

  var root = document.createElement('div');
  root.id = 'chat-widget-root';
  root.style.cssText = 'position:fixed;bottom:66px;right:14px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end';

  var hasClan    = !!playerClanId;
  var clanTabOp  = hasClan ? '' : 'opacity:.4;pointer-events:none';
  var clanTabLbl = hasClan ? '&#128737; Клан' : '&#128274; Клан';

  root.innerHTML =
    // Панель чата
    '<div id="chat-panel" style="display:none;width:300px;background:var(--bg);' +
    'border:1px solid var(--border);border-radius:16px;overflow:hidden;' +
    'margin-bottom:8px;flex-direction:column">' +

    // Вкладки
    '<div id="chat-tabs" style="display:flex">' +
    '<button id="chat-tab-gen" onclick="switchChatTab(\'general\')" ' +
    'style="flex:1;padding:10px 0;background:var(--accent);color:#fff;border:none;' +
    'font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">' +
    '&#127758; Общий</button>' +
    '<button id="chat-tab-clan" onclick="switchChatTab(\'clan\')" ' +
    'style="flex:1;padding:10px 0;background:transparent;color:var(--text-soft);border:none;' +
    'font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;' + clanTabOp + '">' +
    clanTabLbl + '</button>' +
    '</div>' +

    // Сообщения
    '<div id="chat-msgs" style="height:300px;overflow-y:auto;padding:10px;' +
    'display:flex;flex-direction:column;gap:8px">' +
    '<div style="text-align:center;color:var(--text-soft);font-size:12px;padding:20px">' +
    'Загружаем\u2026</div>' +
    '</div>' +

    // Ввод сообщения
    '<div style="display:flex;gap:8px;padding:8px;border-top:1px solid var(--border)">' +
    '<input id="chat-inp" placeholder="Сообщение\u2026" maxlength="300" ' +
    'onkeydown="if(event.key===\'Enter\')doSendChatMessage()" ' +
    'style="flex:1;padding:8px 12px;background:var(--surface-2);border:1px solid var(--border);' +
    'border-radius:20px;color:var(--text);font-size:12px;font-family:inherit;outline:none" />' +
    '<button onclick="doSendChatMessage()" ' +
    'style="width:34px;height:34px;background:var(--accent);border:none;border-radius:50%;' +
    'color:#fff;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
    '&#10148;</button>' +
    '</div>' +
    '</div>' +

    // Кнопка-пузырь
    '<div id="chat-toggle-btn" onclick="toggleChatWidget()" ' +
    'style="width:50px;height:50px;background:var(--accent);border-radius:50%;' +
    'display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative">' +
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" ' +
    'stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
    '<div id="chat-badge" style="display:none;position:absolute;top:-3px;right:-3px;' +
    'min-width:18px;height:18px;background:#e05252;border-radius:9px;font-size:10px;' +
    'font-weight:700;color:#fff;align-items:center;justify-content:center;' +
    'border:2px solid var(--bg);padding:0 4px"></div>' +
    '</div>';

  document.body.appendChild(root);
  loadChatMsgs('general');
}

// ─── Переключить видимость виджета ───────────────────────────

function toggleChatWidget() {
  var panel = document.getElementById('chat-panel');
  if (!panel) return;

  chatWidgetOpen = !chatWidgetOpen;

  if (chatWidgetOpen) {
    panel.style.display = 'flex';
    chatNewCount = 0;
    updateChatBadge(0);
    loadChatMsgs(chatActiveCh);
    subscribeToChat(chatActiveCh);
  } else {
    panel.style.display = 'none';
    var sb = getClanSb();
    if (sb && clanRtChannel) { sb.removeChannel(clanRtChannel); clanRtChannel = null; }
  }
}

// ─── Переключить вкладку чата ────────────────────────────────

async function switchChatTab(tab) {
  var newCh;
  if (tab === 'clan') {
    if (!chatPlayerClanId) return;
    newCh = chatPlayerClanId;
  } else {
    newCh = 'general';
  }

  chatActiveCh = newCh;

  // Стиль вкладок
  var tabGen  = document.getElementById('chat-tab-gen');
  var tabClan = document.getElementById('chat-tab-clan');
  if (tabGen) {
    tabGen.style.background = tab === 'general' ? 'var(--accent)' : 'transparent';
    tabGen.style.color      = tab === 'general' ? '#fff' : 'var(--text-soft)';
  }
  if (tabClan) {
    tabClan.style.background = tab === 'clan' ? 'var(--accent)' : 'transparent';
    tabClan.style.color      = tab === 'clan' ? '#fff' : 'var(--text-soft)';
  }

  loadChatMsgs(newCh);
  subscribeToChat(newCh);
}

// ─── Обновить контекст клана в чате ──────────────────────────

function setChatClanContext(clanId) {
  chatPlayerClanId = clanId;
  var tabClan = document.getElementById('chat-tab-clan');
  if (!tabClan) return;

  if (clanId) {
    tabClan.style.opacity       = '1';
    tabClan.style.pointerEvents = 'auto';
    tabClan.innerHTML = '&#128737; Клан';
  } else {
    tabClan.style.opacity       = '0.4';
    tabClan.style.pointerEvents = 'none';
    tabClan.innerHTML = '&#128274; Клан';
    if (chatActiveCh !== 'general') switchChatTab('general');
  }
}

// ─── Загрузить сообщения ─────────────────────────────────────

async function loadChatMsgs(channel) {
  var container = document.getElementById('chat-msgs');
  if (!container) return;

  try {
    var msgs = await fetchMsgsForChannel(channel);
    renderChatMsgs(msgs);
  } catch(e) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-soft);font-size:12px;padding:20px">Не удалось загрузить</div>';
  }
}

// ─── Отрисовать сообщения ────────────────────────────────────

function renderChatMsgs(msgs) {
  var container = document.getElementById('chat-msgs');
  if (!container) return;
  var player = getCurrentPlayer();

  if (!msgs || msgs.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-soft);font-size:12px;padding:20px">' +
      'Пока нет сообщений. Напиши первым!</div>';
    return;
  }

  container.innerHTML = msgs.map(function(m) {
    var isMe = player && m.player_id === player.id;
    var bg   = clanAvatarColor(m.login || '?');
    var ini  = clanInitials(m.login || '?');
    var t    = fmtTime(m.created_at);

    if (isMe) {
      return '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">' +
        '<div style="font-size:10px;color:var(--text-soft)">' + t + '</div>' +
        '<div style="background:var(--accent);color:#fff;border-radius:14px 14px 4px 14px;' +
        'padding:8px 12px;max-width:82%;font-size:12px;line-height:1.4;word-break:break-word">' +
        clanEsc(m.content) + '</div></div>';
    }
    return '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px">' +
      '<div style="display:flex;align-items:center;gap:5px">' +
      '<div style="width:18px;height:18px;border-radius:50%;background:' + bg + ';' +
      'display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:#fff;flex-shrink:0">' + ini + '</div>' +
      '<div style="font-size:10px;color:var(--text-soft)">' + clanEsc(m.login || '?') + ' · ' + t + '</div>' +
      '</div>' +
      '<div style="background:var(--surface-2);color:var(--text);border-radius:4px 14px 14px 14px;' +
      'padding:8px 12px;max-width:82%;font-size:12px;line-height:1.4;word-break:break-word">' +
      clanEsc(m.content) + '</div></div>';
  }).join('');

  container.scrollTop = container.scrollHeight;
}

// ─── Добавить одно новое сообщение ───────────────────────────

function appendChatMsg(msg) {
  var player = getCurrentPlayer();

  if (!chatWidgetOpen) {
    // Виджет закрыт — показываем бейдж
    chatNewCount++;
    updateChatBadge(chatNewCount);
    return;
  }

  var container = document.getElementById('chat-msgs');
  if (!container) return;

  // Убираем заглушку «нет сообщений»
  var placeholder = container.querySelector('[style*="padding:20px"]');
  if (placeholder) container.innerHTML = '';

  var isMe = player && msg.player_id === player.id;
  var bg   = clanAvatarColor(msg.login || '?');
  var ini  = clanInitials(msg.login || '?');
  var t    = fmtTime(msg.created_at);

  var div  = document.createElement('div');
  div.style.cssText = 'display:flex;flex-direction:column;align-items:' + (isMe ? 'flex-end' : 'flex-start') + ';gap:2px';

  if (isMe) {
    div.innerHTML =
      '<div style="font-size:10px;color:var(--text-soft)">' + t + '</div>' +
      '<div style="background:var(--accent);color:#fff;border-radius:14px 14px 4px 14px;' +
      'padding:8px 12px;max-width:82%;font-size:12px;line-height:1.4;word-break:break-word">' +
      clanEsc(msg.content) + '</div>';
  } else {
    div.innerHTML =
      '<div style="display:flex;align-items:center;gap:5px">' +
      '<div style="width:18px;height:18px;border-radius:50%;background:' + bg + ';' +
      'display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;color:#fff;flex-shrink:0">' + ini + '</div>' +
      '<div style="font-size:10px;color:var(--text-soft)">' + clanEsc(msg.login || '?') + ' · ' + t + '</div>' +
      '</div>' +
      '<div style="background:var(--surface-2);color:var(--text);border-radius:4px 14px 14px 14px;' +
      'padding:8px 12px;max-width:82%;font-size:12px;line-height:1.4;word-break:break-word">' +
      clanEsc(msg.content) + '</div>';
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ─── Подписаться на Realtime-канал ───────────────────────────

function subscribeToChat(channel) {
  var sb = getClanSb();
  if (!sb) return;

  if (clanRtChannel) { sb.removeChannel(clanRtChannel); clanRtChannel = null; }

  clanRtChannel = sb
    .channel('chat_' + channel.replace(/-/g, ''))
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'messages',
      filter: 'channel=eq.' + channel,
    }, function(payload) {
      appendChatMsg(payload.new);
    })
    .subscribe();
}

// ─── Отправить сообщение ─────────────────────────────────────

async function doSendChatMessage() {
  var player = getCurrentPlayer();
  if (!player) return;

  var inp = document.getElementById('chat-inp');
  if (!inp) return;

  var content = inp.value.trim();
  if (!content) return;

  inp.value    = '';
  inp.disabled = true;

  try {
    await sendMessage(player.id, chatActiveCh, content);
  } catch(e) {
    inp.value = content;
    alert(e.message);
  } finally {
    inp.disabled = false;
    inp.focus();
  }
}

// ─── Обновить бейдж непрочитанных ────────────────────────────

function updateChatBadge(n) {
  var badge = document.getElementById('chat-badge');
  if (!badge) return;
  if (n > 0) {
    badge.style.display = 'flex';
    badge.textContent   = n > 99 ? '99+' : String(n);
  } else {
    badge.style.display = 'none';
  }
}
