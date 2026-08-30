import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { Receipt } from "@/lib/types";
import { PageHeader, Empty } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

function readableSize(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1_048_576;
  return mb >= 1 ? `${mb.toFixed(1)} МБ` : `${Math.round(bytes / 1024)} КБ`;
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  const kind = params.kind === "document" ? "document" : params.kind === "receipt" ? "receipt" : null;

  const supabase = await createClient();
  let query = supabase
    .from("receipts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (kind) query = query.eq("kind", kind);

  const { data } = await query;
  const receipts = (data as Receipt[]) ?? [];

  return (
    <>
      <PageHeader title="Скани" subtitle={`${receipts.length} файлів`} />

      <div className="mb-4 flex gap-2">
        <Link href="/receipts" className={`chip ${!kind ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}>
          Усі
        </Link>
        <Link
          href="/receipts?kind=receipt"
          className={`chip ${kind === "receipt" ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}
        >
          Чеки
        </Link>
        <Link
          href="/receipts?kind=document"
          className={`chip ${kind === "document" ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}
        >
          Документи
        </Link>
      </div>

      {receipts.length === 0 ? (
        <Empty icon="⌷" text="Ще немає жодного скану" />
      ) : (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li key={r.id}>
              <a
                href={`/api/receipt/${r.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="card flex items-center gap-3 transition hover:border-accent/40"
              >
                <span className="text-lg">{r.kind === "document" ? "📄" : "🧾"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {r.original_name ?? (r.kind === "document" ? "Документ" : "Чек")}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {formatDate(r.created_at.slice(0, 10))}
                    {r.byte_size ? ` · ${readableSize(r.byte_size)}` : ""}
                    {r.icloud_path ? ` · iCloud/${r.icloud_path}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-muted">↗</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
