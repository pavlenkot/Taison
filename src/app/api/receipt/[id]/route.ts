import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Віддає скан. Бакет приватний, тож посилання підписується на льоту
 * і живе одну хвилину — рівно щоб відкрити файл.
 * RLS сама не віддасть чужий рядок, окремої перевірки власника не потрібно.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });

  const { data: receipt } = await supabase
    .from("receipts")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  if (!receipt) {
    return NextResponse.json({ error: "Скан не знайдено" }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("receipts")
    .createSignedUrl(receipt.storage_path, 60);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Не вдалося відкрити файл" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
