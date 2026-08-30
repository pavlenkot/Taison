import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, describeDueDate } from "@/lib/format";
import { DOC_TYPE_LABELS, DOC_TYPES, type DocType } from "@/lib/ai/documentSchema";
import type { Document, DocumentFolder } from "@/lib/types";
import { PageHeader, Empty } from "@/components/ui";
import { Scanner } from "@/components/Scanner";

export const dynamic = "force-dynamic";

interface Params {
  q?: string;
  type?: string;
  folder?: string;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const typeFilter = DOC_TYPES.includes(params.type as DocType) ? (params.type as DocType) : null;
  const folderFilter = params.folder ?? null;

  const supabase = await createClient();

  // Пошук іде через функцію в базі: там і повнотекстовий індекс,
  // і добір за частковим збігом. Фільтри накладаються поверх результату.
  let documents: Document[];
  if (query.length > 0) {
    const { data } = await supabase.rpc("search_documents", { p_query: query });
    documents = (data as Document[]) ?? [];
    if (typeFilter) documents = documents.filter((d) => d.doc_type === typeFilter);
    if (folderFilter) documents = documents.filter((d) => d.issuer_slug === folderFilter);
  } else {
    let select = supabase
      .from("documents")
      .select("*")
      .order("document_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (typeFilter) select = select.eq("doc_type", typeFilter);
    if (folderFilter) select = select.eq("issuer_slug", folderFilter);

    const { data } = await select;
    documents = (data as Document[]) ?? [];
  }

  const { data: folderRows } = await supabase.rpc("document_folders");
  const folders = (folderRows as DocumentFolder[]) ?? [];

  const withDeadline = documents
    .filter((d) => d.deadline)
    .sort((a, b) => (a.deadline! < b.deadline! ? -1 : 1));

  const activeFolder = folders.find((f) => f.issuer_slug === folderFilter);
  const filtered = query.length > 0 || typeFilter !== null || folderFilter !== null;

  const link = (extra: Partial<Params>) => {
    const next = new URLSearchParams();
    const merged = { q: query, type: typeFilter ?? "", folder: folderFilter ?? "", ...extra };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, String(value));
    }
    const qs = next.toString();
    return qs ? `/documents?${qs}` : "/documents";
  };

  return (
    <>
      <PageHeader
        title="Документи"
        subtitle={
          activeFolder
            ? `${activeFolder.issuer} · ${documents.length} документів`
            : `${documents.length} документів`
        }
      />

      <form method="get" className="mb-4">
        {typeFilter && <input type="hidden" name="type" value={typeFilter} />}
        {folderFilter && <input type="hidden" name="folder" value={folderFilter} />}
        <div className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Пошук: Finanzamt, номер справи, будь-яке слово з тексту"
            className="field"
            aria-label="Пошук по документах"
          />
          <button type="submit" className="btn-primary shrink-0">
            Знайти
          </button>
        </div>
      </form>

      {filtered && (
        <div className="mb-4">
          <Link href="/documents" className="chip text-muted">
            ✕ Скинути фільтри
          </Link>
        </div>
      )}

      {withDeadline.length > 0 && !filtered && (
        <div className="card mb-4 border-warn/40 bg-warn/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-warn">
            Документи зі строком
          </div>
          <ul className="mt-2 space-y-1.5">
            {withDeadline.slice(0, 5).map((d) => {
              const due = describeDueDate(d.deadline!);
              return (
                <li key={d.id}>
                  <Link href={`/documents/${d.id}`} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {d.issuer ?? "Документ"}
                      {d.subject ? ` — ${d.subject}` : ""}
                    </span>
                    <span
                      className={`shrink-0 ${due.tone === "late" ? "text-negative" : "text-warn"}`}
                    >
                      {due.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {folders.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
            Теки адресатів
          </h2>
          <div className="flex flex-wrap gap-2">
            {folders.map((f) => (
              <Link
                key={f.issuer_slug}
                href={link({ folder: f.issuer_slug === folderFilter ? "" : f.issuer_slug })}
                className={`chip ${
                  f.issuer_slug === folderFilter
                    ? "border-accent bg-accent/10 text-accent"
                    : "text-muted"
                }`}
              >
                📁 {f.issuer}
                <span className="ml-1 opacity-60">{f.documents}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Категорії
        </h2>
        <div className="flex flex-wrap gap-2">
          {DOC_TYPES.map((t) => (
            <Link
              key={t}
              href={link({ type: t === typeFilter ? "" : t })}
              className={`chip ${
                t === typeFilter ? "border-accent bg-accent/10 text-accent" : "text-muted"
              }`}
            >
              {DOC_TYPE_LABELS[t].icon} {DOC_TYPE_LABELS[t].title}
            </Link>
          ))}
        </div>
      </section>

      <div className="mb-5">
        <Scanner fixedKind="document" />
      </div>

      {documents.length === 0 ? (
        <Empty
          icon="📄"
          text={
            filtered
              ? "За такими умовами нічого не знайшлося"
              : "Ще немає жодного документа — відскануйте перший"
          }
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => {
            const label = DOC_TYPE_LABELS[(d.doc_type as DocType) ?? "other"] ?? DOC_TYPE_LABELS.other;
            const due = d.deadline ? describeDueDate(d.deadline) : null;

            return (
              <li key={d.id}>
                <Link href={`/documents/${d.id}`} className="card flex gap-3 transition hover:border-accent/40">
                  <span className="text-xl leading-none">{label.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {d.subject ?? d.issuer ?? "Без назви"}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {d.issuer ? `${d.issuer} · ` : ""}
                      {label.title}
                      {d.document_date ? ` · ${formatDate(d.document_date)}` : ""}
                      {d.reference_number ? ` · № ${d.reference_number}` : ""}
                    </span>
                    {due && (
                      <span
                        className={`mt-1 inline-block text-xs font-medium ${
                          due.tone === "late"
                            ? "text-negative"
                            : due.tone === "soon"
                              ? "text-warn"
                              : "text-muted"
                        }`}
                      >
                        Строк: {due.label}
                      </span>
                    )}
                  </span>
                  {d.amount_cents && (
                    <span className="shrink-0 self-start font-semibold tabular-nums">
                      {formatMoney(d.amount_cents)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
