import { createClient } from "./supabase/server";
import type { Category } from "./types";

/**
 * @param includeHidden true — для екрана керування категоріями,
 *   де приховані теж треба показати.
 */
export async function getCategories(includeHidden = false): Promise<Category[]> {
  const supabase = await createClient();
  let query = supabase
    .from("categories")
    .select("id, name, slug, icon, kind, sort, hidden")
    .order("sort")
    .order("name");

  if (!includeHidden) query = query.eq("hidden", false);

  const { data } = await query;
  return (data as Category[]) ?? [];
}
