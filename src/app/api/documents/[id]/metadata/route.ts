import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { metadataSidecar, type DocType } from "@/lib/ai/documentSchema";
import { safeFileName } from "@/lib/slug";
import type { Document } from "@/lib/types";

/**
 * Текстовий супутник документа. Його можна покласти поруч із PDF
 * в iCloud Drive — тоді пошук iOS знаходить документ за будь-яким
 * словом із метаданих, не відкриваючи сам файл.
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

  const { data } = await supabase.from("documents").select("*").eq("id", id).maybeSingle();
  if (!data) {
    return NextResponse.json({ error: "Документ не знайдено" }, { status: 404 });
  }

  const doc = data as Document;

  // Формат супутника описаний один раз — у metadataSidecar(), щоб текст
  // із Швидкої команди і текст, завантажений тут, не розходилися.
  const body = metadataSidecar({
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

  const name = safeFileName(
    [doc.document_date ?? "", doc.issuer ?? "", doc.subject ?? ""]
      .filter((part) => part.length > 0)
      .join(" · "),
    110,
  ) || "Документ";

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${name}.txt`)}`,
    },
  });
}
