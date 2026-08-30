import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Клієнт для серверних компонентів і route handlers. Діє від імені користувача, RLS увімкнено. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list) {
          // У серверних компонентах запис куків заборонений — оновленням
          // сесії там опікується middleware, тож помилку тут глушимо свідомо.
          try {
            for (const { name, value, options } of list) {
              cookieStore.set(name, value, options);
            }
          } catch {
            /* no-op */
          }
        },
      },
    },
  );
}

/** Поточний користувач або null. */
export async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
