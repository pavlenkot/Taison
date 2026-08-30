import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractReceipt, aiConfigured, activeProvider } from "@/lib/ai";
import { isoDate } from "@/lib/format";

export const maxDuration = 60;

/** Порівняння без ранньої зупинки — щоб час відповіді не підказував правильний префікс. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Приймає скан від Швидкої команди iOS.
 * Сесії тут немає, тож автентифікація — за спільним токеном у заголовку,
 * а користувач визначається змінною INGEST_OWNER_EMAIL.
 */
export async function POST(request: Request) {
  const expected = process.env.INGEST_TOKEN;
  const ownerEmail = process.env.INGEST_OWNER_EMAIL;

  if (!expected || !ownerEmail) {
    return NextResponse.json(
      { error: "Приймання сканів не налаштоване (INGEST_TOKEN / INGEST_OWNER_EMAIL)" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-ingest-token") ?? "";
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Невірний токен" }, { status: 401 });
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      { error: `Рушій ${activeProvider()} не налаштовано` },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const icloudPath = form.get("icloud_path");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Бракує файлу у полі file" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: userList, error: userError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  const owner = userList.users.find(
    (u) => u.email?.toLowerCase() === ownerEmail.toLowerCase(),
  );
  if (!owner) {
    return NextResponse.json(
      { error: `Користувача ${ownerEmail} не знайдено. Спершу увійдіть у застосунок.` },
      { status: 404 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  const extension = mime === "application/pdf" ? "pdf" : mime.split("/")[1] || "jpg";
  const storagePath = `${owner.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(storagePath, bytes, { contentType: mime, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  let extraction;
  try {
    extraction = await extractReceipt(bytes.toString("base64"), mime);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Невідома помилка";
    return NextResponse.json({ error: `Не вдалося розпізнати: ${message}` }, { status: 502 });
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      user_id: owner.id,
      kind: extraction.documentKind,
      storage_path: storagePath,
      original_name: file.name,
      mime,
      byte_size: bytes.byteLength,
      icloud_path: typeof icloudPath === "string" ? icloudPath : null,
      ai_provider: extraction.provider,
      ai_model: extraction.model,
      ai_raw: extraction.raw as object,
    })
    .select("id")
    .single();

  if (receiptError) {
    return NextResponse.json({ error: receiptError.message }, { status: 500 });
  }

  if (extraction.documentKind === "document") {
    return NextResponse.json({
      ok: true,
      kind: "document",
      message: extraction.summary || "Документ збережено",
    });
  }

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", owner.id)
    .eq("slug", extraction.categorySlug)
    .eq("kind", "expense")
    .maybeSingle();

  const { error: txError } = await supabase.from("transactions").insert({
    user_id: owner.id,
    kind: "expense",
    amount_cents: extraction.totalCents ?? 1,
    currency: extraction.currency,
    category_id: category?.id ?? null,
    merchant: extraction.merchant,
    note:
      extraction.lineItems
        .slice(0, 5)
        .map((i) => i.name)
        .join(", ") || null,
    occurred_on: extraction.purchasedOn ?? isoDate(),
    source: "shortcut",
    receipt_id: receipt.id,
    needs_review: true,
  });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  const euro = extraction.totalCents ? (extraction.totalCents / 100).toFixed(2) : "?";

  return NextResponse.json({
    ok: true,
    kind: "receipt",
    message: `${extraction.merchant ?? "Чек"} · ${euro} € · чекає на перевірку`,
    merchant: extraction.merchant,
    totalCents: extraction.totalCents,
    confidence: extraction.confidence,
  });
}
