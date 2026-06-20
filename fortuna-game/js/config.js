// ============================================================
//  config.js — публичные настройки игры.
//  Секреты сюда НЕ кладём (они в Supabase Secrets / на сервере).
// ============================================================

const CONFIG = {
  SUPABASE_URL: "https://rdxoaalzlwbyjxebxtyo.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkeG9hYWx6bHdieWp4ZWJ4dHlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwMDUzOSwiZXhwIjoyMDk3NDc2NTM5fQ.Ww6bHb4_MDNfzilfz2lTTqI9j8Ucrf4PZfRIubfisyg",

  // Edge Function входа по логину/паролю:
  AUTH_PASSWORD_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/auth-password",
};
