import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractReceipt, aiConfigured, activeProvider } from "@/lib/ai";
import { isoDate } from "@/lib/format";

export const maxDuration = 60;

interface Body {
  storagePath: string;
  imageBase64: string;
  mime: string;
  kind: "receipt" | "document";
  originalName?: string;
  byteSize?: number;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });
  }

  if (!aiConfigured()) {
    return NextResponse.json(
      {
        error: `Рушій ${activeProvider()} не налаштовано — бракує ключа API. Перевірте змінні середовища.`,
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некоректний запит" }, { status: 400 });
  }

  if (!body.storagePath || !body.imageBase64) {
    return NextResponse.json({ error: "Бракує файлу" }, { status: 400 });
  }

  // Файл має лежати у власній теці користувача — інакше це чужий шлях.
  if (!body.storagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Недоступний шлях" }, { status: 403 });
  }

  let extraction;
  try {
    extraction = await extractReceipt(body.imageBase64, body.mime);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Невідома помилка";
    return NextResponse.json({ error: `Не вдалося розпізнати: ${message}` }, { status: 502 });
  }

  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      user_id: user.id,
      kind: extraction.documentKind,
      storage_path: body.storagePath,
      original_name: body.originalName ?? null,
      mime: body.mime,
      byte_size: body.byteSize ?? null,
      ai_provider: extraction.provider,
      ai_model: extraction.model,
      ai_raw: extraction.raw as object,
    })
    .select("id")
    .single();

  if (receiptError) {
    return NextResponse.json({ error: receiptError.message }, { status: 500 });
  }

  // Документ (договір, поліс) витратою не є — зберігаємо лише сам файл.
  if (extraction.documentKind === "document") {
    return NextResponse.json({
      documentKind: "document",
      receiptId: receipt.id,
      summary: extraction.summary,
    });
  }

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", extraction.categorySlug)
    .eq("kind", "expense")
    .maybeSingle();

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      kind: "expense",
      // Якщо суму не видно, ставимо 1 цент і позначаємо на перевірку:
      // нуль база не приймає, а операція має бути видимою, щоб її виправили.
      amount_cents: extraction.totalCents ?? 1,
      currency: extraction.currency,
      category_id: category?.id ?? null,
      merchant: extraction.merchant,
      note: extraction.lineItems
        .slice(0, 5)
        .map((i) => i.name)
        .join(", ") || null,
      occurred_on: extraction.purchasedOn ?? isoDate(),
      source: "scan",
      receipt_id: receipt.id,
      needs_review: true,
    })
    .select("id")
    .single();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  return NextResponse.json({
    documentKind: "receipt",
    receiptId: receipt.id,
    transactionId: transaction.id,
    merchant: extraction.merchant,
    totalCents: extraction.totalCents,
    purchasedOn: extraction.purchasedOn,
    categorySlug: extraction.categorySlug,
    confidence: extraction.confidence,
    provider: extraction.provider,
    model: extraction.model,
  });
}
