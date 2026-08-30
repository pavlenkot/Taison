import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentExtraction } from "./ai";
import { metadataSidecar } from "./ai/documentSchema";

/** Те, що потрібно Швидкій команді, щоб розкласти файли в iCloud Drive. */
export interface FilingPlan {
  /** Тека адресата всередині теки документів: «Finanzamt», «Jobcenter». */
  folder: string;
  /** Ім'я файлу без розширення — уже підписане датою, адресатом і номером. */
  filename: string;
  /** Вміст текстового супутника для пошуку через Spotlight. */
  metadata: string;
}

export async function persistDocument(
  supabase: SupabaseClient,
  userId: string,
  receiptId: string,
  doc: DocumentExtraction,
  icloudPath: string | null,
): Promise<{ id: string; filing: FilingPlan }> {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      receipt_id: receiptId,
      doc_type: doc.docType,
      issuer: doc.issuer,
      issuer_slug: doc.issuerSlug,
      subject: doc.subject,
      reference_number: doc.referenceNumber,
      document_date: doc.documentDate,
      deadline: doc.deadline,
      amount_cents: doc.amountCents,
      keywords: doc.keywords,
      body_text: doc.bodyText,
      language: doc.language,
      icloud_path: icloudPath,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    id: data.id as string,
    filing: {
      folder: doc.folderName,
      filename: doc.fileName,
      metadata: metadataSidecar(doc),
    },
  };
}
