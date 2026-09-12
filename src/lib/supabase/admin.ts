import { createClient } from "@supabase/supabase-js";

/**
 * Клієнт із ключем service_role — обходить RLS.
 * Використовується ЛИШЕ там, де немає сесії користувача: приймання
 * сканів від Швидкої команди iOS. Ніколи не імпортувати в клієнтський код.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY не налаштовано");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
