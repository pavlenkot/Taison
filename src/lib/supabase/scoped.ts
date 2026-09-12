import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Клієнт service_role, у якого кожен select примусово звужений до одного
 * користувача.
 *
 * Збірка резервної книги покладається на RLS, а в крона сесії немає.
 * Віддати йому звичайний адмін-клієнт означало б скласти в одну книгу дані
 * ВСІХ користувачів і покласти її на чужий Диск, тож той самий відбір
 * робимо руками. Політика в схемі всюди однакова — using (user_id =
 * auth.uid()), — тому .eq('user_id', …) дає рівно ті самі рядки.
 *
 * Підробка вміє лише from().select() навмисно. Якщо збірка книги колись
 * піде іншим шляхом — rpc, storage, — запит впаде з помилкою, а не мовчки
 * віддасть зайве: зламана копія помітна, тиха підміна чужими даними — ні.
 */
export function scopedToUser(admin: SupabaseClient, userId: string): SupabaseClient {
  const from = (table: string) => {
    const builder = admin.from(table);
    return {
      select: (columns?: string, options?: { head?: boolean; count?: "exact" }) =>
        builder.select(columns ?? "*", options).eq("user_id", userId),
    };
  };
  return { from } as unknown as SupabaseClient;
}
