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
};
