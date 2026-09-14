import { createClient } from "npm:@supabase/supabase-js@2";

// service_role-клиент — доступен только внутри Edge Functions, обходит RLS.
// SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY — встроенные переменные окружения,
// Supabase прокидывает их автоматически в каждую функцию, задавать вручную не нужно.
export function supabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
