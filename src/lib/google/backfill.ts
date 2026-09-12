import type { SupabaseClient } from "@supabase/supabase-js";
import { fileReceiptToDrive, fileDocumentToDrive } from "./sync";
import { metadataSidecar, type DocType } from "../ai/documentSchema";
import { documentFolderName, documentFileName, receiptFileName } from "../fileNames";

export interface SyncOutcome {
  synced: number;
  failed: number;
  skipped: number;
}

interface PendingRow {
  id: string;
  kind: "receipt" | "document";
  storage_path: string;
  mime: string | null;
  created_at: string;
}

/**
 * Довозить на Диск те, що туди не доїхало.
 *
 * Вивантаження під час сканування — найкраще зусилля: якщо Диск не
 * відповів, скан усе одно зберігається, бо втратити його гірше. Ціна
 * цього рішення — розбіжність між тим, що людина бачить у застосунку,
 * і тим, що лежить на Диску. Ця функція її закриває.
 */
export async function syncPendingToDrive(
  supabase: SupabaseClient,
  userId: string,
  limit = 25,
): Promise<SyncOutcome> {
  const { data, error } = await supabase
    .from("receipts")
    .select("id, kind, storage_path, mime, created_at")
    .neq("drive_sync_status", "synced")
    // Спершу ті, які ще майже не пробували: безнадійний файл не має
    // з'їдати всю пачку на кожному повторі.
    .order("drive_attempts", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data as PendingRow[]) ?? [];
  const outcome: SyncOutcome = { synced: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    try {
      const uploaded = await syncOne(supabase, userId, row);
      if (uploaded) outcome.synced += 1;
      else outcome.skipped += 1;
    } catch (e) {
      outcome.failed += 1;
      await markFailed(supabase, row.id, e instanceof Error ? e.message : "Невідома помилка");
    }
  }

  return outcome;
}

/** true — доїхало; false — Диск не підключено, і це не помилка. */
async function syncOne(
  supabase: SupabaseClient,
  userId: string,
  row: PendingRow,
): Promise<boolean> {
  const { data: file, error } = await supabase.storage
    .from("receipts")
    .download(row.storage_path);

  if (error || !file) {
    throw new Error(error?.message ?? "Файл не знайдено у сховищі застосунку");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = row.mime ?? "application/pdf";

  return row.kind === "document"
    ? syncDocument(supabase, userId, row, bytes, mimeType)
    : syncReceipt(supabase, userId, row, bytes, mimeType);
}

async function syncDocument(
  supabase: SupabaseClient,
  userId: string,
  row: PendingRow,
  bytes: Buffer,
  mimeType: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("documents")
    .select(
      "id, doc_type, issuer, subject, document_date, reference_number, deadline, amount_cents, keywords, body_text",
    )
    .eq("receipt_id", row.id)
    .maybeSingle();

  if (!data) {
    throw new Error("Скан позначено документом, але картки документа немає");
  }

  const doc = data as {
    id: string;
    doc_type: string;
    issuer: string | null;
    subject: string | null;
    document_date: string | null;
    reference_number: string | null;
    deadline: string | null;
    amount_cents: number | null;
    keywords: string[] | null;
    body_text: string | null;
  };

  // Стислий зміст у базі не зберігається — у супутнику його просто не буде.
  const metadata = metadataSidecar({
    docType: (doc.doc_type as DocType) ?? "other",
    issuer: doc.issuer,
    subject: doc.subject,
    documentDate: doc.document_date,
    referenceNumber: doc.reference_number,
    deadline: doc.deadline,
    amountCents: doc.amount_cents,
    keywords: doc.keywords ?? [],
    bodyText: doc.body_text,
  });

  const filed = await fileDocumentToDrive(userId, {
    data: bytes,
    mimeType,
    metadata,
    folderName: documentFolderName(doc.issuer),
    fileName: documentFileName({
      documentDate: doc.document_date,
      issuer: doc.issuer,
      subject: doc.subject,
      referenceNumber: doc.reference_number,
    }),
  });

  if (!filed) {
    await markSkipped(supabase, row.id);
    return false;
  }

  await supabase
    .from("documents")
    .update({
      drive_file_id: filed.file.id,
      drive_link: filed.file.link ?? null,
      drive_meta_file_id: filed.meta?.id ?? null,
    })
    .eq("id", doc.id);

  await markSynced(supabase, row.id, filed.file.id, filed.file.link ?? null);
  return true;
}

async function syncReceipt(
  supabase: SupabaseClient,
  userId: string,
  row: PendingRow,
  bytes: Buffer,
  mimeType: string,
): Promise<boolean> {
  // Дату, магазин і суму беремо з операції, а не з самого скана:
  // людина могла їх виправити після розпізнавання, і на Диску має
  // опинитися виправлене ім'я.
  const { data } = await supabase
    .from("transactions")
    .select("occurred_on, merchant, amount_cents")
    .eq("receipt_id", row.id)
    .maybeSingle();

  const tx = data as { occurred_on: string; merchant: string | null; amount_cents: number } | null;
  const occurredOn = tx?.occurred_on ?? row.created_at.slice(0, 10);

  const filed = await fileReceiptToDrive(userId, {
    data: bytes,
    mimeType,
    fileName: receiptFileName({
      occurredOn,
      merchant: tx?.merchant ?? null,
      totalCents: tx?.amount_cents ?? null,
    }),
    occurredOn,
  });

  if (!filed) {
    await markSkipped(supabase, row.id);
    return false;
  }

  await markSynced(supabase, row.id, filed.id, filed.link ?? null);
  return true;
}

async function markSynced(
  supabase: SupabaseClient,
  receiptId: string,
  fileId: string,
  link: string | null,
): Promise<void> {
  await supabase
    .from("receipts")
    .update({
      drive_file_id: fileId,
      drive_link: link,
      drive_sync_status: "synced",
      drive_synced_at: new Date().toISOString(),
      drive_error: null,
    })
    .eq("id", receiptId);
}

async function markSkipped(supabase: SupabaseClient, receiptId: string): Promise<void> {
  await supabase
    .from("receipts")
    .update({ drive_sync_status: "skipped", drive_error: null })
    .eq("id", receiptId);
}

async function markFailed(
  supabase: SupabaseClient,
  receiptId: string,
  message: string,
): Promise<void> {
  const { data } = await supabase
    .from("receipts")
    .select("drive_attempts")
    .eq("id", receiptId)
    .maybeSingle();

  await supabase
    .from("receipts")
    .update({
      drive_sync_status: "failed",
      drive_error: message.slice(0, 500),
      drive_attempts: ((data as { drive_attempts: number } | null)?.drive_attempts ?? 0) + 1,
    })
    .eq("id", receiptId);
}

/**
 * Записує наслідок вивантаження одразу після сканування.
 * Виклик під час сканування не кидає помилку далі — скан важливіший за
 * копію, — але наслідок має лишитися в базі, інакше про розбіжність
 * ніхто не дізнається.
 */
export async function recordDriveOutcome(
  supabase: SupabaseClient,
  receiptId: string,
  filed: { id: string; link?: string | null } | null,
  error: string | null,
): Promise<void> {
  if (filed) {
    await markSynced(supabase, receiptId, filed.id, filed.link ?? null);
  } else if (error) {
    await markFailed(supabase, receiptId, error);
  } else {
    await markSkipped(supabase, receiptId);
  }
}
