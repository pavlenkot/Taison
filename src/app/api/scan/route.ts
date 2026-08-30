import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractReceipt, extractDocument, aiConfigured, activeProvider } from "@/lib/ai";
import { persistDocument } from "@/lib/saveDocument";
import { isoDate } from "@/lib/format";

export const maxDuration = 120;

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

  const wantsDocument = body.kind === "document";

  // Якщо знімали як чек, але це виявився папір — розбираємо ще раз
  // документною підказкою. Зайвий виклик тут дешевший за втрачений документ.
  let receipt = null;
  if (!wantsDocument) {
    try {
      receipt = await extractReceipt(body.imageBase64, body.mime);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Невідома помилка";
      return NextResponse.json({ error: `Не вдалося розпізнати: ${message}` }, { status: 502 });
    }
  }

  const asDocument = wantsDocument || receipt?.documentKind === "document";

  let document = null;
  if (asDocument) {
    try {
      document = await extractDocument(body.imageBase64, body.mime);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Невідома помилка";
      return NextResponse.json({ error: `Не вдалося розпізнати: ${message}` }, { status: 502 });
    }
  }

  const { data: stored, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      user_id: user.id,
      kind: asDocument ? "document" : "receipt",
      storage_path: body.storagePath,
      original_name: body.originalName ?? null,
      mime: body.mime,
      byte_size: body.byteSize ?? null,
      ai_provider: document?.provider ?? receipt?.provider ?? null,
      ai_model: document?.model ?? receipt?.model ?? null,
      ai_raw: (document?.raw ?? receipt?.raw ?? null) as object,
    })
    .select("id")
    .single();

  if (receiptError) {
    return NextResponse.json({ error: receiptError.message }, { status: 500 });
  }

  if (document) {
    try {
      const { id, filing } = await persistDocument(supabase, user.id, stored.id, document, null);
      return NextResponse.json({
        documentKind: "document",
        documentId: id,
        receiptId: stored.id,
        issuer: document.issuer,
        subject: document.subject,
        docType: document.docType,
        referenceNumber: document.referenceNumber,
        deadline: document.deadline,
        summary: document.summary,
        filing,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Невідома помилка";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", receipt!.categorySlug)
    .eq("kind", "expense")
    .maybeSingle();

  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      kind: "expense",
      // Якщо суму не видно, ставимо 1 цент і позначаємо на перевірку:
      // нуль база не приймає, а операція має бути видимою, щоб її виправили.
      amount_cents: receipt!.totalCents ?? 1,
      currency: receipt!.currency,
      category_id: category?.id ?? null,
      merchant: receipt!.merchant,
      note:
        receipt!.lineItems
          .slice(0, 5)
          .map((i) => i.name)
          .join(", ") || null,
      occurred_on: receipt!.purchasedOn ?? isoDate(),
      source: "scan",
      receipt_id: stored.id,
      needs_review: true,
    })
    .select("id")
    .single();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  return NextResponse.json({
    documentKind: "receipt",
    receiptId: stored.id,
    transactionId: transaction.id,
    merchant: receipt!.merchant,
    totalCents: receipt!.totalCents,
    purchasedOn: receipt!.purchasedOn,
    categorySlug: receipt!.categorySlug,
    confidence: receipt!.confidence,
    provider: receipt!.provider,
    model: receipt!.model,
  });
}
