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
};
