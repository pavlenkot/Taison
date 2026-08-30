import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatDateShort, formatMonth } from "@/lib/format";
import { resolvePeriod, PERIOD_LABELS, type PeriodKind } from "@/lib/periods";
import type { PeriodTotal } from "@/lib/types";
import { PageHeader, Stat } from "@/components/ui";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { CategoryBars } from "@/components/CategoryBars";

export const dynamic = "force-dynamic";

const KINDS: PeriodKind[] = ["week", "month", "year"];

async function fetchTotals(from: string, to: string, bucket: string): Promise<PeriodTotal[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("period_totals", {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  });
  return (data as PeriodTotal[]) ?? [];
}

/** Усі кошики періоду, включно з порожніми — інакше графік бреше про пропуски. */
function buildBuckets(from: string, to: string, bucket: "day" | "week" | "month"): string[] {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  while (cursor <= end) {
    if (bucket === "month") {
      out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`);
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      out.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
          cursor.getDate(),
        ).padStart(2, "0")}`,
      );
      cursor.setDate(cursor.getDate() + (bucket === "week" ? 7 : 1));
    }
  }
  return out;
}

function sumOf(rows: PeriodTotal[], kind: "expense" | "income"): number {
  return rows.filter((r) => r.kind === kind).reduce((s, r) => s + Number(r.total_cents), 0);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const kind = (KINDS.includes(params.period as PeriodKind) ? params.period : "month") as PeriodKind;

  const current = resolvePeriod(kind, 0);
  const previous = resolvePeriod(kind, -1);

  const [now, before] = await Promise.all([
    fetchTotals(current.from, current.to, current.bucket),
    fetchTotals(previous.from, previous.to, previous.bucket),
  ]);

  const expense = sumOf(now, "expense");
  const income = sumOf(now, "income");
  const prevExpense = sumOf(before, "expense");

  const delta = prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null;

  // Часовий ряд витрат
  const byBucket = new Map<string, number>();
  for (const r of now) {
    if (r.kind !== "expense") continue;
    byBucket.set(r.bucket, (byBucket.get(r.bucket) ?? 0) + Number(r.total_cents));
  }

  const points: TrendPoint[] = buildBuckets(current.from, current.to, current.bucket).map((b) => ({
    label: current.bucket === "month" ? formatMonth(b).slice(0, 3) : formatDateShort(b),
    fullLabel: current.bucket === "month" ? formatMonth(b) : formatDateShort(b),
    cents: byBucket.get(b) ?? 0,
  }));

  // Розріз за категоріями
  const byCategory = new Map<string, { cents: number; entries: number }>();
  for (const r of now) {
    if (r.kind !== "expense") continue;
    const prev = byCategory.get(r.category_name) ?? { cents: 0, entries: 0 };
    byCategory.set(r.category_name, {
      cents: prev.cents + Number(r.total_cents),
      entries: prev.entries + Number(r.entries),
    });
  }

  const slices = [...byCategory.entries()].map(([name, v]) => ({
    name,
    cents: v.cents,
    entries: v.entries,
  }));

  return (
    <>
      <PageHeader
        title="Аналітика"
        subtitle={current.label}
        action={
          <Link href="/api/export?format=xlsx" className="btn-ghost py-2 text-xs">
            Експорт
          </Link>
        }
      />

      <div className="mb-4 flex gap-2">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/analytics?period=${k}`}
            className={`chip ${k === kind ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}
          >
            {PERIOD_LABELS[k]}
          </Link>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Витрати" value={formatMoney(expense)} tone="negative" />
        <Stat label="Доходи" value={formatMoney(income)} tone="positive" />
        <Stat
          label="Різниця"
          value={formatMoney(income - expense)}
          tone={income - expense >= 0 ? "positive" : "negative"}
        />
        <Stat
          label={`Проти: ${previous.label.toLowerCase()}`}
          value={delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
          tone={delta === null ? "neutral" : delta > 0 ? "negative" : "positive"}
          hint={formatMoney(prevExpense)}
        />
      </div>

      <div className="space-y-4">
        <TrendChart points={points} title={`Витрати · ${current.label.toLowerCase()}`} />
        <CategoryBars slices={slices} title="Куди пішли гроші" total={expense} />

        {slices.length > 0 && (
          <details className="card">
            <summary className="cursor-pointer list-none text-sm font-semibold text-accent marker:content-none">
              Показати таблицею
            </summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase text-muted">
                    <th className="pb-2 font-medium">Категорія</th>
                    <th className="pb-2 text-right font-medium">Операцій</th>
                    <th className="pb-2 text-right font-medium">Сума</th>
                    <th className="pb-2 text-right font-medium">Частка</th>
                  </tr>
                </thead>
                <tbody>
                  {[...slices]
                    .sort((a, b) => b.cents - a.cents)
                    .map((s) => (
                      <tr key={s.name} className="border-b border-line/60 last:border-0">
                        <td className="py-2">{s.name}</td>
                        <td className="py-2 text-right tabular-nums text-muted">{s.entries}</td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {formatMoney(s.cents)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted">
                          {expense > 0 ? Math.round((s.cents / expense) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    </>
  );
}
