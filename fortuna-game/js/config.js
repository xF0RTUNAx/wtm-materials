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
  SEND_MESSAGE_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/send-message",
};

// ── Иконки ресурсов (HTML-img, inline 18px) ─────────────────
// Используются во всех JS-файлах игры
var ICON_PARTS = '<img src="res/parts.png" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_RARE  = '<img src="kit/rare.png"  style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_ORE   = '<img src="res/ore.png"   style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_XP    = '<img src="pass/exp.png"  style="width:18px;height:18px;object-fit:contain;vertical-align:middle;margin:0 1px -2px" alt="" />';
var ICON_PASS  = '<img src="pass/pass_profile.png" style="width:22px;height:22px;object-fit:contain;vertical-align:middle;margin:-2px 1px 0" alt="" />';
var ICON_CHAT       = '<img src="clans_and_chat/chat.png" style="width:28px;height:28px;object-fit:contain;vertical-align:middle" alt="" />';
var ICON_GLOBAL_CHAT = '<img src="clans_and_chat/global_chat.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin:0 2px -2px" alt="" />';
var ICON_CLAN_CHAT  = '<img src="clans_and_chat/clan_chat.png" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin:0 2px -2px" alt="" />';
var ICON_CLAN       = '<img src="clans_and_chat/clan.png" style="width:26px;height:26px;object-fit:contain;vertical-align:middle;margin:0 4px -6px" alt="" />';
