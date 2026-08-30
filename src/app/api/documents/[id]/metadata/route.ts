import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DOC_TYPE_LABELS, type DocType } from "@/lib/ai/documentSchema";
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
  const label = DOC_TYPE_LABELS[(doc.doc_type as DocType) ?? "other"] ?? DOC_TYPE_LABELS.other;

  const lines = [
    `Документ: ${doc.subject ?? "без назви"}`,
    `Від кого: ${doc.issuer ?? "не визначено"}`,
    `Категорія: ${label.title}`,
    `Дата документа: ${doc.document_date ?? "не визначено"}`,
  ];

  if (doc.reference_number) lines.push(`Номер справи: ${doc.reference_number}`);
  if (doc.deadline) lines.push(`Строк: ${doc.deadline}`);
  if (doc.amount_cents) lines.push(`Сума: ${(doc.amount_cents / 100).toFixed(2)} EUR`);
  if (doc.keywords.length > 0) lines.push(`Ключові слова: ${doc.keywords.join(", ")}`);
  if (doc.body_text) lines.push("", "Повний текст:", doc.body_text);

  const name = safeFileName(
    [doc.document_date ?? "", doc.issuer ?? "", doc.subject ?? ""]
      .filter((part) => part.length > 0)
      .join(" · "),
    110,
  ) || "Документ";

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${name}.txt`)}`,
    },
  });
}
