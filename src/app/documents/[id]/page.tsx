import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, describeDueDate, centsToInput } from "@/lib/format";
import { DOC_TYPE_LABELS, DOC_TYPES, type DocType } from "@/lib/ai/documentSchema";
import type { Document } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { updateDocument, deleteDocument } from "../../actions";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <span className="shrink-0 text-sm text-muted">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("documents")
    .select("*, receipts (storage_path, mime)")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const doc = data as Document;
  const type = (doc.doc_type as DocType) ?? "other";
  const label = DOC_TYPE_LABELS[type] ?? DOC_TYPE_LABELS.other;
  const due = doc.deadline ? describeDueDate(doc.deadline) : null;

  return (
    <>
      <div className="mb-3">
        <Link href="/documents" className="text-sm text-accent">
          ‹ Усі документи
        </Link>
      </div>

      <PageHeader
        title={doc.subject ?? doc.issuer ?? "Документ"}
        subtitle={`${label.icon} ${label.title}${doc.issuer ? ` · ${doc.issuer}` : ""}`}
      />

      {due && (
        <div
          className={`card mb-4 ${
            due.tone === "late"
              ? "border-negative/40 bg-negative/5"
              : due.tone === "soon"
                ? "border-warn/40 bg-warn/5"
                : ""
          }`}
        >
          <div className="text-sm font-semibold">
            Строк: {due.label}
            <span className="ml-2 font-normal text-muted">{formatDate(doc.deadline!)}</span>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {doc.receipt_id && (
          <a
            href={`/api/receipt/${doc.receipt_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary"
          >
            Відкрити скан
          </a>
        )}
        <a href={`/api/documents/${doc.id}/metadata`} className="btn-ghost">
          Завантажити метадані (.txt)
        </a>
      </div>

      <div className="card mb-4">
        <Row label="Від кого" value={doc.issuer} />
        <Row label="Категорія" value={`${label.icon} ${label.title}`} />
        <Row label="Дата документа" value={doc.document_date ? formatDate(doc.document_date) : null} />
        <Row label="Номер справи" value={doc.reference_number} />
        <Row label="Сума" value={doc.amount_cents ? formatMoney(doc.amount_cents) : null} />
        <Row label="Мова" value={doc.language} />
        <Row label="Тека в iCloud" value={doc.icloud_path} />
      </div>

      {doc.keywords.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Ключові слова
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {doc.keywords.map((word) => (
              <Link key={word} href={`/documents?q=${encodeURIComponent(word)}`} className="chip text-muted">
                {word}
              </Link>
            ))}
          </div>
        </section>
      )}

      {doc.body_text && (
        <details className="card mb-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-accent marker:content-none">
            Повний текст документа
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap border-t border-line pt-3 text-sm leading-relaxed">
            {doc.body_text}
          </pre>
        </details>
      )}

      <details className="card">
        <summary className="cursor-pointer list-none text-sm font-semibold text-accent marker:content-none">
          Виправити дані
        </summary>

        <form action={updateDocument} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="id" value={doc.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Про що документ</label>
              <input name="subject" defaultValue={doc.subject ?? ""} className="field" />
            </div>
            <div>
              <label className="label">Від кого</label>
              <input name="issuer" defaultValue={doc.issuer ?? ""} className="field" />
            </div>
            <div>
              <label className="label">Категорія</label>
              <select name="doc_type" defaultValue={type} className="field">
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DOC_TYPE_LABELS[t].icon} {DOC_TYPE_LABELS[t].title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Номер справи</label>
              <input
                name="reference_number"
                defaultValue={doc.reference_number ?? ""}
                className="field"
              />
            </div>
            <div>
              <label className="label">Сума, €</label>
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={doc.amount_cents ? centsToInput(doc.amount_cents) : ""}
                className="field tabular-nums"
              />
            </div>
            <div>
              <label className="label">Дата документа</label>
              <input
                name="document_date"
                type="date"
                defaultValue={doc.document_date ?? ""}
                className="field"
              />
            </div>
            <div>
              <label className="label">Строк</label>
              <input name="deadline" type="date" defaultValue={doc.deadline ?? ""} className="field" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Ключові слова, через кому</label>
              <input name="keywords" defaultValue={doc.keywords.join(", ")} className="field" />
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button type="submit" className="btn-primary">
              Зберегти
            </button>
            <button type="submit" formAction={deleteDocument} className="btn-ghost text-negative">
              Видалити
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Зміна поля «Від кого» перекладає документ до іншої теки адресата.
            Видалення прибирає і сам файл зі сховища застосунку; копія в iCloud
            залишиться недоторканою.
          </p>
        </form>
      </details>
    </>
  );
}
