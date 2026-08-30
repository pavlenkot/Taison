import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractReceipt, extractDocument, aiConfigured, activeProvider } from "@/lib/ai";
import { persistDocument } from "@/lib/saveDocument";
import { isoDate } from "@/lib/format";
import { safeFileName } from "@/lib/slug";

export const maxDuration = 120;

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
 *
 * Для документа у відповіді приходить план розкладки: тека адресата,
 * підписане ім'я файлу і текст супутника. Швидка команда зберігає файли
 * уже за цим планом, тому теки на кшталт «Finanzamt» створюються самі.
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
  const declaredKind = form.get("kind");

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
  const base64 = bytes.toString("base64");

  const wantsDocument = declaredKind === "document";

  let receipt = null;
  if (!wantsDocument) {
    try {
      receipt = await extractReceipt(base64, mime);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Невідома помилка";
      return NextResponse.json({ error: `Не вдалося розпізнати: ${message}` }, { status: 502 });
    }
  }

  const asDocument = wantsDocument || receipt?.documentKind === "document";

  let document = null;
  if (asDocument) {
    try {
      document = await extractDocument(base64, mime);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Невідома помилка";
      return NextResponse.json({ error: `Не вдалося розпізнати: ${message}` }, { status: 502 });
    }
  }

  const extension = mime === "application/pdf" ? "pdf" : mime.split("/")[1] || "jpg";
  const storagePath = `${owner.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("receipts")
    .upload(storagePath, bytes, { contentType: mime, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: stored, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      user_id: owner.id,
      kind: asDocument ? "document" : "receipt",
      storage_path: storagePath,
      original_name: file.name,
      mime,
      byte_size: bytes.byteLength,
      icloud_path: typeof icloudPath === "string" ? icloudPath : null,
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
      const { filing } = await persistDocument(
        supabase,
        owner.id,
        stored.id,
        document,
        typeof icloudPath === "string" ? icloudPath : null,
      );

      return NextResponse.json({
        ok: true,
        kind: "document",
        // Швидка команда читає саме ці три поля
        folder: filing.folder,
        filename: filing.filename,
        metadata: filing.metadata,
        message:
          `${document.issuer ?? "Документ"} · ${document.subject ?? "збережено"}` +
          (document.deadline ? ` · строк до ${document.deadline}` : ""),
        issuer: document.issuer,
        subject: document.subject,
        deadline: document.deadline,
        referenceNumber: document.referenceNumber,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Невідома помилка";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", owner.id)
    .eq("slug", receipt!.categorySlug)
    .eq("kind", "expense")
    .maybeSingle();

  const { error: txError } = await supabase.from("transactions").insert({
    user_id: owner.id,
    kind: "expense",
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
    source: "shortcut",
    receipt_id: stored.id,
    needs_review: true,
  });

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  const euro = receipt!.totalCents ? (receipt!.totalCents / 100).toFixed(2) : "?";

  return NextResponse.json({
    ok: true,
    kind: "receipt",
    folder: "",
    // Через safeFileName: назву магазину читає модель, а вона може
    // повернути «/» чи «:», які зламали б шлях у кроці «Зберегти файл».
    filename: safeFileName(
      `${receipt!.purchasedOn ?? isoDate()} ${receipt!.merchant ?? "Чек"}`,
      80,
    ),
    metadata: "",
    message: `${receipt!.merchant ?? "Чек"} · ${euro} € · чекає на перевірку`,
    merchant: receipt!.merchant,
    totalCents: receipt!.totalCents,
    confidence: receipt!.confidence,
  });
}
