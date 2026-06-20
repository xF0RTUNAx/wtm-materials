// ============================================================
//  config.js — настройки игры (ПУБЛИЧНЫЕ значения)
//  Эти данные безопасно держать в открытом коде сайта:
//   - URL и anon-ключ Supabase публичны при включённом RLS;
//   - адрес моста публичен, списания всё равно защищены ключом
//     на стороне сервера (X-Bridge-Key знает только Edge Function).
//  СЕКРЕТЫ (токен бота, X-Bridge-Key, service_role) сюда НЕ кладём.
// ============================================================

const CONFIG = {
  // --- Supabase ---
  // Project URL: вкладка Project Settings → API → Project URL
  SUPABASE_URL: "https://rdxoaalzlwbyjxebxtyo.supabase.co",

  // anon public key: Project Settings → API → Project API keys → anon public
  // ВПИШИ свой anon-ключ (длинная строка, начинается с eyJ...):
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkeG9hYWx6bHdieWp4ZWJ4dHlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwMDUzOSwiZXhwIjoyMDk3NDc2NTM5fQ.Ww6bHb4_MDNfzilfz2lTTqI9j8Ucrf4PZfRIubfisyg",

  // --- Edge Function проверки входа ---
  // Готовый адрес функции telegram-auth (уже задеплоена):
  AUTH_FUNCTION_URL:
    "https://rdxoaalzlwbyjxebxtyo.supabase.co/functions/v1/telegram-auth",

  // --- Мост валюты (loot_points) ---
  // Адрес HTTPS-моста на твоём сервере:
  BRIDGE_URL: "https://api.fortunawtm.com",

  // --- Telegram ---
  // Username бота БЕЗ символа @ (для Telegram Login Widget):
  TELEGRAM_BOT_USERNAME: "xfortunaxbot",
};
