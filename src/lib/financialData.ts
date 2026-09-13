import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { financialSection, type AccountFilter } from "./financial";
import type { Transaction } from "./types";

export async function currentSection(value?: string) {
  return financialSection(
    value ?? (await cookies()).get("financial-section")?.value,
  );
}
export async function getTransactions({
  from,
  to,
  account,
  kind,
  category,
  search,
  review = false,
}: {
  from?: string;
  to?: string;
  account?: AccountFilter;
  kind?: string;
  category?: string;
  search?: string;
  review?: boolean;
} = {}) {
  const supabase = await createClient();
  const rows: Transaction[] = [];
  // Supabase обмежує одну відповідь: підсумки не мають губити записи після тисячного.
  for (let start = 0; ; start += 1000) {
    let query = supabase
      .from("transactions")
      .select("*, categories (name, icon, slug)")
      .eq("needs_review", review)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(start, start + 999);
    if (from) query = query.gte("occurred_on", from);
    if (to) query = query.lte("occurred_on", to);
    if (account)
      query =
        account === "unassigned"
          ? query.is("financial_account", null)
          : query.eq("financial_account", account);
    if (kind === "expense" || kind === "income") query = query.eq("kind", kind);
    if (category) query = query.eq("category_id", category);
    const term = search
      ?.replace(/[,()%*\\]/g, " ")
      .trim()
      .slice(0, 60);
    if (term)
      query = query.or(
        "merchant.ilike.%" + term + "%,note.ilike.%" + term + "%",
      );
    const { data, error } = await query;
    if (error)
      throw new Error("Не вдалося завантажити операції. Спробуйте ще раз.");
    rows.push(...((data as Transaction[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function allRows<T>(query: {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
}): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await query.range(start, start + 999);
    if (error) throw new Error("Не вдалося завантажити історію");
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
