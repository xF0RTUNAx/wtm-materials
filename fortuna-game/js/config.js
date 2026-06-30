const CONFIG = {
  SUPABASE_URL: "https://rdxoaalzlwbyjxebxtyo.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkeG9hYWx6bHdieWp4ZWJ4dHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDA1MzksImV4cCI6MjA5NzQ3NjUzOX0.tRaxzqPoXIvouqoCnT5DTCbSA17mrglU4fuL-bTCRrY",

  // Этап 0 — авторизация
  AUTH_PASSWORD_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/auth-password",

  // Этап 1 — завод
  COLLECT_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/collect-resources",
  UPGRADE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/upgrade-factory",

  // Этап 2 — лаборатория и войска
  LAB_UPGRADE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/upgrade-lab",
  TROOP_UPGRADE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/upgrade-troop",

  // Этап 3 — нейросети
  NEURAL_START_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/start-neural",
  NEURAL_COLLECT_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/collect-neural",
  NEURAL_UPGRADE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/upgrade-neural",

  // Этап 4 — битвы и госпиталь
  SAVE_LINEUP_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/save-lineup",
  SEND_HOSPITAL_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/send-to-hospital",
  COLLECT_HOSPITAL_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/collect-hospital",
  UPGRADE_HOSPITAL_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/upgrade-hospital",
  RESOLVE_BATTLE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/resolve-battle",
  MARK_NOTIF_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/mark-notifications-read",

  // Этап 5 — кланы и чат
  CREATE_CLAN_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/create-clan",
  APPLY_CLAN_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/apply-clan",
  RESPOND_APPLICATION_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/respond-application",
  LEAVE_CLAN_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/leave-clan",
  KICK_MEMBER_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/kick-member",
  SET_CLAN_ROLE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/set-clan-role",
  CLAIM_CLAN_REWARD_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/claim-clan-reward",

  // Этап 6 — карта войны
  CAPTURE_TERRITORY_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/capture-territory",
  COLLECT_TAX_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/collect-tax",
  INITIATE_COOP_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/initiate-coop",
  JOIN_COOP_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/join-coop",

  SEND_MESSAGE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/send-message",

  // Боевой пропуск
  INIT_BP_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/init-bp",
  CLAIM_BP_REWARD_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/claim-bp-reward",
  EQUIP_AVATAR_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/equip-avatar",

  // Этап 7 — мини-игры / Аркада
  CLAIM_MG_REWARD_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/claim-minigame-reward",

  // Онлайн-статус
  TOUCH_ONLINE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/touch-online",

  // Рейтинг кланов
  RECALC_CLAN_RATING_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/recalc-clan-rating",

  // Тренировочный бот (всегда доступная цель для атаки)
  RESOLVE_BOT_BATTLE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/resolve-bot-battle",
};

// ── Иконки ресурсов (HTML-img, inline) ──────────────────────
// Используются во всех JS-файлах игры через ${ICON_*} в backtick-строках
var ICON_PARTS = '<img src="res/parts.png" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_RARE  = '<img src="kit/rare.png"  style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_ORE   = '<img src="res/ore.png"   style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_XP    = '<img src="pass/exp.png"  style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_PASS  = '<img src="pass/pass_profile.png" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;margin:-2px 1px 0" alt="" />';
var ICON_CHAT       = '<img src="clans_and_chat/chat.png" style="width:28px;height:28px;object-fit:contain;vertical-align:middle" alt="" />';
var ICON_GLOBAL_CHAT = '<img src="clans_and_chat/global_chat.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin:0 2px -2px" alt="" />';
var ICON_CLAN_CHAT  = '<img src="clans_and_chat/clan_chat.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin:0 2px -2px" alt="" />';
var ICON_CLAN       = '<img src="clans_and_chat/clan.png" style="width:108px;height:108px;object-fit:contain;vertical-align:middle;margin:-24px -12px -24px 0px" alt="" />';

// Этап 6 — карта войны
var ICON_TOKEN = '<img src="clans_and_chat/token.png" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_TAX   = '<img src="clans_and_chat/tax.png"   style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';

// Боевой пропуск — бусты нейросетей
var ICON_BOOST_SPEED = '<img src="pass/season_1/1_hour_boost.png" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_BOOST_EXTRA = '<img src="pass/season_1/extra_task.png"   style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_BOOST_XP    = '<img src="pass/season_1/double_exp.png"   style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';

// ── UI-иконки (inline SVG, fill=currentColor) ───────────────
// Иконки адаптируются под цвет окружающего текста и под обе темы
// автоматически — никаких файлов грузить не нужно.
// Геометрия центрирована в (0,0), viewBox="-32 -32 64 64".

var _SVG = {
  sword:
    'M13.5 -26.45 Q14.25 -27 15.25 -27 L24.4 -27 Q25.35 -27 26.05 -26.45 L26.25 -26.3 Q27 -25.5 27 -24.45 L27 -15.2 Q27 -14.25 26.25 -13.4 L2.2 10.65 4 12.45 4.3 12.1 Q4.45 11.85 4.8 11.8 L5.4 11.65 6.15 11.65 Q7.15 11.65 7.95 12.4 L8.1 12.55 Q8.7 13.3 8.7 14.2 L8.7 20.35 Q8.7 21.3 8.1 22 L7.8 22.3 Q7.05 22.9 6.15 22.9 L0 22.9 Q-2.7 22.9 -2.6 20.35 L-2.6 19.75 Q-2.6 19.05 -2.1 18.6 L-1.65 18.1 -2 17.8 -5.55 14.35 -9.6 18.4 -9.6 24.4 Q-9.6 25.45 -10.4 26.2 -11.15 27 -12.2 27 L-24.35 27 Q-27 27 -27 24.4 L-27 12.15 Q-27 9.55 -24.35 9.55 L-18.45 9.55 -14.4 5.5 -18.15 1.65 -18.65 2.2 Q-19.1 2.55 -19.8 2.55 L-20.3 2.55 Q-23 2.55 -22.95 0 L-22.95 -6.15 Q-22.95 -8.75 -20.3 -8.75 L-14.15 -8.75 Q-13.2 -8.75 -12.35 -7.95 L-12.2 -7.8 Q-11.7 -7.05 -11.7 -6.15 L-11.7 -5.45 Q-11.7 -4.85 -12.15 -4.35 L-12.5 -3.95 -10.7 -2.15 13.35 -26.3 13.5 -26.45',

  award:
    'M9.6 -19.9 Q7.25 -22.85 8.35 -26 L8.65 -26.45 9 -26.65 Q12.25 -27.8 15.1 -25.4 18.2 -22.85 16.25 -19.25 L15.8 -18.8 Q12.25 -16.8 9.6 -19.9 M17.45 -16.35 Q19.65 -20.7 23.85 -21 L24.5 -20.9 24.95 -20.6 Q28 -17.3 26.55 -12.65 25.3 -7.5 20 -8 L19.55 -8.1 19.3 -7.7 Q16.2 -3.5 11.5 -5.8 7.3 -8.05 7 -12.4 L7.1 -13.1 7.35 -13.55 Q10.6 -16.7 15.1 -15.25 L16.85 -14.55 17.45 -16.35 M21.75 -0.75 Q25.25 -3.3 28.9 -1.8 L29.4 -1.45 29.65 -1.1 Q30.85 2.85 27.8 5.95 24.7 9.5 20.5 6.95 L20.15 6.65 19.85 6.9 Q15.6 9 12.6 5.25 10.05 1.6 11.55 -1.85 L11.9 -2.45 12.25 -2.65 Q16.2 -3.85 19.35 -0.85 L20.55 0.45 21.75 -0.75 M-21.75 -0.75 L-20.55 0.45 -19.35 -0.85 Q-16.2 -3.85 -12.25 -2.65 L-11.9 -2.45 -11.55 -1.85 Q-10.05 1.6 -12.6 5.25 -15.6 9 -19.85 6.9 L-20.15 6.65 -20.5 6.95 Q-24.7 9.5 -27.8 5.95 -30.85 2.85 -29.65 -1.1 L-29.4 -1.45 -28.9 -1.8 Q-25.25 -3.3 -21.75 -0.75 M-17.45 -16.35 L-16.85 -14.55 -15.1 -15.25 Q-10.6 -16.7 -7.35 -13.55 L-7.1 -13.1 -7 -12.4 Q-7.3 -8.05 -11.5 -5.8 -16.2 -3.5 -19.3 -7.7 L-19.55 -8.1 -20 -8 Q-25.3 -7.5 -26.55 -12.65 -28 -17.3 -24.95 -20.6 L-24.5 -20.9 -23.85 -21 Q-19.65 -20.7 -17.45 -16.35 M-9.6 -19.9 Q-12.25 -16.8 -15.8 -18.8 L-16.25 -19.25 Q-18.2 -22.85 -15.1 -25.4 -12.25 -27.8 -9 -26.65 L-8.65 -26.45 -8.35 -26 Q-7.25 -22.85 -9.6 -19.9 M15.95 23.4 Q16.85 24.2 17 25.45 17.1 26.65 16.3 27.65 15.5 28.55 14.3 28.7 13.05 28.8 12.1 28 6.85 23.6 0.15 21.4 -6.5 23.6 -11.75 28 -12.75 28.8 -13.95 28.7 -15.2 28.55 -16 27.65 -16.8 26.65 -16.65 25.45 -16.55 24.2 -15.6 23.4 -12.85 21.1 -9.7 19.3 L-13.75 19 Q-14.75 18.95 -15.45 18.4 -18.25 19.95 -21 17.7 -24.45 15.2 -23.9 11.35 L-23.75 10.95 -23.25 10.5 Q-20.15 8.65 -16.45 10.4 -15.65 10.8 -15.1 11.35 L-14.15 9.9 Q-11.7 6.6 -7.8 7.05 L-7.45 7.2 -7.05 7.7 Q-5.25 10.4 -6.45 13.65 L0.2 15.15 Q3.2 14.25 6.5 13.7 5.25 10.45 7.05 7.7 L7.45 7.2 7.8 7.05 Q11.7 6.6 14.15 9.9 L15.1 11.35 Q15.65 10.8 16.45 10.4 20.15 8.65 23.25 10.5 L23.75 10.95 23.9 11.35 Q24.45 15.2 21 17.7 18.35 19.85 15.6 18.5 14.9 18.95 14 19 L10.05 19.3 Q13.15 21.1 15.95 23.4',

  crown:
    'M6 -20 Q6 -18.4 5.3 -17.1 L12.65 -4.8 19 -9.05 Q19 -11.1 20.45 -12.55 21.95 -14 24 -14 26.05 -14 27.5 -12.55 29 -11.05 29 -9 29 -6.95 27.5 -5.5 26.45 -4.4 25.1 -4.1 L22 14.95 21.9 15.35 Q21.2 18.95 14.95 21.45 11.25 22.95 6.7 23.6 L0 24 -6.6 23.6 Q-11.25 22.95 -14.9 21.45 L-14.85 21.45 Q-21.2 18.95 -21.85 15.35 L-21.95 14.95 -25.05 -4.1 Q-26.45 -4.4 -27.55 -5.5 -29 -6.95 -29 -9 -29 -11.05 -27.55 -12.55 -26.05 -14 -24 -14 -21.95 -14 -20.5 -12.55 -19.05 -11.1 -19 -9.05 L-12.65 -4.8 -5.25 -17.1 Q-6 -18.4 -6 -20 -6 -22.45 -4.25 -24.25 -2.45 -26 0 -26 2.5 -26 4.2 -24.25 6 -22.45 6 -20 M-5.4 8.6 Q-6 9.15 -6 10 -6 10.85 -5.4 11.45 L-1.4 15.45 Q-0.85 16 0 16 0.85 16 1.45 15.45 L5.45 11.45 Q6 10.85 6 10 6 9.15 5.45 8.6 L1.45 4.6 Q0.85 4 0 4 -0.85 4 -1.4 4.6 L-5.4 8.6',

  campfire:
    'M11.05 -17.05 Q15.65 -10.55 14.9 -3.95 L14.9 -3.8 Q14 1.55 10.95 5.15 L10.85 5.2 10.8 5.25 Q9.2 7.9 5.8 8.85 L5 8.8 4.35 8.2 Q4.1 7.85 4.15 7.45 L4.4 6.9 Q4.85 5.4 4.25 2.75 1.65 -4.2 -0.5 -6.15 L-0.55 -6.15 -0.65 -6.1 -0.65 -6 -0.65 -5.9 Q-0.55 -2.55 -2.6 0.45 L-2.75 0.55 Q-4.6 2.35 -4.45 4.5 L-4.4 4.75 Q-4.2 6.1 -3.55 7 -3.4 7.35 -3.4 7.8 L-3.55 8.45 -4.2 8.9 -5 8.95 Q-13.4 6.7 -14.9 -1.85 L-14.95 -1.95 Q-15.6 -8.2 -10.55 -13.25 -6.3 -19 -6.5 -25.85 L-6.5 -25.9 Q-6.6 -27.15 -5.85 -27.9 -5.25 -28.9 -4 -29 -2.95 -29.15 -1.95 -28.35 3.85 -23.6 6.6 -17.15 L7.15 -17.75 7.1 -17.65 Q8 -18.4 9.3 -18.15 L9.35 -18.15 Q10.3 -18 11 -17.1 L11.05 -17.05 M18.45 27.05 Q18.05 28.15 16.8 28.7 L14.4 28.8 4.6 25.7 19.6 20.9 19.7 21 Q20.25 22.1 19.85 23.25 L18.45 27.05 M-14.3 9.15 L0 13.75 14.3 9.15 16.8 9.3 Q18 9.85 18.4 11.05 L19.8 14.8 Q20.2 15.95 19.7 17.05 19.05 18.1 17.75 18.5 L0 24.2 -17.75 18.5 Q-19.05 18.1 -19.7 17.05 -20.2 15.95 -19.8 14.8 L-18.4 11.05 Q-18 9.85 -16.8 9.3 L-14.3 9.15 M-18.45 27.05 L-19.85 23.25 Q-20.25 22.1 -19.7 21 L-19.6 20.9 -4.6 25.7 -14.4 28.8 -16.8 28.7 Q-18.05 28.15 -18.45 27.05',

  arrowRotate:
    'M29 -0.8 Q29 8.4 22.5 14.95 15.95 21.45 6.75 21.45 3.35 21.55 -1.45 19.8 L-0.25 22.3 Q0.3 23.4 -0.1 24.6 -0.5 25.75 -1.6 26.3 L-3.9 26.45 Q-5.1 26.05 -5.65 24.95 L-10.35 15.25 -11.25 13.55 -11.4 13.15 -12.15 11.6 Q-12.55 10.75 -12.4 9.9 -12.3 9 -11.7 8.35 -11.15 7.65 -10.3 7.4 L3.45 3.25 Q4.65 2.9 5.75 3.5 6.8 4.05 7.2 5.25 7.5 6.45 6.95 7.55 6.35 8.6 5.15 9 L1.3 10.15 Q4.5 11.35 6.75 11.45 11.85 11.45 15.45 7.9 19 4.3 19 -0.8 L19 -0.85 Q18.7 -2.9 19.95 -4.55 21.2 -6.2 23.25 -6.5 25.3 -6.8 26.95 -5.55 28.6 -4.3 28.9 -2.25 L29 -0.8 M-29 0.7 Q-29 -8.5 -22.45 -15 -15.95 -21.55 -6.75 -21.55 -3.15 -21.65 2.05 -19.65 L0.8 -22.25 Q0.25 -23.35 0.7 -24.5 1.1 -25.7 2.2 -26.25 L4.5 -26.35 Q5.65 -25.95 6.2 -24.85 L12.7 -11.5 Q13.1 -10.7 13 -9.8 12.85 -8.95 12.3 -8.25 11.75 -7.6 10.9 -7.3 L-2.85 -3.15 Q-4.05 -2.8 -5.15 -3.4 -6.25 -4 -6.6 -5.15 -7 -6.35 -6.4 -7.45 -5.8 -8.55 -4.6 -8.9 L-0.85 -10.05 Q-4.35 -11.45 -6.75 -11.55 -11.85 -11.55 -15.4 -7.95 -19 -4.4 -19 0.7 L-19 0.75 Q-18.7 2.8 -19.95 4.45 -21.2 6.1 -23.25 6.4 -25.3 6.7 -26.95 5.45 -28.6 4.2 -28.9 2.15 L-29 0.7',

  puzzle:
    'M25.7 -11.5 L22.95 -1.05 Q25.45 -0.05 26.95 2.55 28.65 5.45 27.75 8.8 26.85 12.05 23.95 13.85 L23.8 13.95 Q21.3 15.3 18.65 14.9 L15.85 25.35 Q15.45 26.8 14.25 27.55 12.95 28.25 11.5 27.9 L2.3 25.4 Q0.85 25.05 0.15 23.75 -0.65 22.5 -0.25 21.05 0.4 18.7 -0.8 16.55 -2.1 14.4 -4.45 13.75 -6.8 13.1 -8.9 14.35 -11.1 15.6 -11.75 17.95 -12.15 19.4 -13.4 20.15 -14.65 20.85 -16.1 20.5 L-25.3 18 Q-26.75 17.65 -27.5 16.35 -28.25 15.1 -27.85 13.65 L-25.4 4.45 Q-25 3 -23.75 2.25 -22.45 1.55 -21 1.9 -18.65 2.55 -16.45 1.3 -14.35 0.05 -13.7 -2.3 -13.1 -4.7 -14.3 -6.8 -15.55 -9 -17.9 -9.65 -19.35 -10 -20.1 -11.25 -20.85 -12.55 -20.45 -14 L-18 -23.2 Q-17.6 -24.65 -16.35 -25.35 -15.05 -26.1 -13.6 -25.75 L-3.15 -22.95 Q-2.15 -25.35 0.3 -26.75 L0.4 -26.85 Q3.35 -28.6 6.65 -27.7 10 -26.8 11.75 -23.75 13.15 -21.35 12.8 -18.65 L23.2 -15.85 Q24.65 -15.5 25.4 -14.15 26.1 -12.95 25.7 -11.5',

  // Этап 10: щит — Защитный состав в редакторе составов (Битвы)
  shield:
    'M22.3 -19.55 Q24.4 -19.35 25.75 -17.75 27.15 -16.2 27 -14.1 26.25 4.45 16.3 16.8 10.2 24.3 2.35 28.05 L0.1 28.5 -2.15 28.05 Q-10.1 24.3 -16.2 16.8 -26.15 4.45 -26.9 -14.1 -27 -16.2 -25.65 -17.75 -24.3 -19.35 -22.2 -19.55 -13.35 -20.4 -4.4 -27 -2.4 -28.4 0.1 -28.4 2.5 -28.4 4.5 -27 13.45 -20.45 22.3 -19.55',

  // Этап 10: стена — бейдж «офицер» в карточках клана
  wall:
    'M26.15 -1.85 L23 1.25 23 20 Q23 21.25 22.15 22.15 21.25 23 20 23 L-20 23 Q-21.25 23 -22.1 22.15 -23 21.25 -23 20 L-23 1.25 -26.1 -1.85 Q-27 -2.75 -27 -4 L-27 -16 Q-27 -17.25 -26.1 -18.1 -25.25 -19 -24 -19 L-16 -19 Q-14.75 -19 -13.85 -18.1 -13 -17.25 -13 -16 L-13 -11 -7 -11 -7 -16 Q-7 -17.25 -6.1 -18.1 -5.25 -19 -4 -19 L4 -19 Q5.25 -19 6.15 -18.1 7 -17.25 7 -16 L7 -11 13 -11 13 -16 Q13 -17.25 13.9 -18.1 14.75 -19 16 -19 L24 -19 Q25.25 -19 26.15 -18.1 27 -17.25 27 -16 L27 -4 Q27 -2.75 26.15 -1.85',
};

// mkSvgIcon(key, w, h, margin) — создаёт inline SVG нужного размера.
// Иконка наследует цвет текста (fill=currentColor): белая на тёмных кнопках,
// акцентная в бейджах, приглушённая в подсказках — всё автоматически.
// w, h — пиксели (по умолчанию 16). margin — строка CSS (по умолчанию '0 2px -2px').
function mkSvgIcon(key, w, h, margin) {
  w = w || 16; h = h || 16;
  var m = (margin !== undefined && margin !== null) ? margin : '0 2px -2px';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-32 -32 64 64"'
    + ' style="width:' + w + 'px;height:' + h + 'px;display:inline-block;'
    + 'vertical-align:middle;margin:' + m + ';flex-shrink:0;">'
    + '<path fill="currentColor" d="' + _SVG[key] + '"/></svg>';
}

// Стандартные UI-иконки (16px) — используются в кнопках, заголовках, бейджах
var ICON_SWORD        = mkSvgIcon('sword');
var ICON_AWARD        = mkSvgIcon('award');
var ICON_CROWN        = mkSvgIcon('crown',       12, 12, '0 2px -1px');
var ICON_CAMPFIRE     = mkSvgIcon('campfire');
var ICON_ARROW_ROTATE = mkSvgIcon('arrowRotate');
var ICON_PUZZLE       = mkSvgIcon('puzzle');
var ICON_SHIELD       = mkSvgIcon('shield');
var ICON_WALL         = mkSvgIcon('wall');

// ── Тренировочный бот ────────────────────────────────────────
// Постоянный id записи-заглушки в players (см. SQL-миграцию бота).
// Используется чтобы исключить бота из рейтингов/поиска соперников
// и чтобы пометить виртуальную карточку бота в списке атаки.
var BOT_PLAYER_ID = "11111111-1111-1111-1111-111111111111";
