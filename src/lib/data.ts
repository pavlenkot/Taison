import { createClient } from "./supabase/server";
import type { Category } from "./types";

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, name, slug, icon, kind, sort")
    .order("sort");
  return (data as Category[]) ?? [];
}
