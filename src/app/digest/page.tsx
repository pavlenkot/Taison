import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatDate } from "@/lib/format";
import { resolvePeriod, type PeriodKind } from "@/lib/periods";
import { buildDigest } from "@/lib/digest";
import type { Transaction } from "@/lib/types";
import { PageHeader, Empty } from "@/components/ui";
import { markDigestSeen } from "../actions";

export const dynamic = "force-dynamic";

const KINDS: PeriodKind[] = ["week", "month"];

async function fetchRange(from: string, to: string): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*, categories (name, icon, slug)")
    .eq("needs_review", false)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false });
  return (data as Transaction[]) ?? [];
}

export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const kind = (KINDS.includes(params.period as PeriodKind) ? params.period : "month") as PeriodKind;
  // Типово показуємо завершений період: підсумок незакінченого місяця
  // мало що означає.
  const offset = params.offset !== undefined ? Number(params.offset) || 0 : -1;

  const period = resolvePeriod(kind, offset);
  const before = resolvePeriod(kind, offset - 1);

  const [current, previous] = await Promise.all([
    fetchRange(period.from, period.to),
    fetchRange(before.from, before.to),
  ]);

  const digest = buildDigest(current, previous, period);
  const small = current
    .filter((t) => t.kind === "expense" && t.amount_cents <= digest.smallThresholdCents)
    .sort((a, b) => b.amount_cents - a.amount_cents);

  return (
    <>
      <PageHeader
        title="Підсумок"
        subtitle={`${period.label} · ${formatDate(period.from)} — ${formatDate(period.to)}`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/digest?period=${k}`}
            className={`chip ${k === kind ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}
          >
            {k === "week" ? "Тиждень" : "Місяць"}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <Link href={`/digest?period=${kind}&offset=${offset - 1}`} className="chip">
            ←
          </Link>
          {offset !== -1 && (
            <Link href={`/digest?period=${kind}`} className="chip">
              Останній
            </Link>
          )}
          {offset < 0 && (
            <Link href={`/digest?period=${kind}&offset=${offset + 1}`} className="chip">
              →
            </Link>
          )}
        </span>
      </div>

      {digest.count === 0 ? (
        <Empty icon="🗒️" text="За цей період витрат не було — підсумовувати нічого" />
      ) : (
        <>
          <div className="card mb-4 text-center">
            <div className="text-xs uppercase tracking-wide text-muted">Витрачено</div>
            <div className="mt-1 text-4xl font-bold tabular-nums">
              {formatMoney(digest.totalCents)}
            </div>
            {digest.deltaPct !== null && (
              <div
                className={`mt-1 text-sm font-medium ${
                  digest.deltaPct > 0 ? "text-negative" : "text-positive"
                }`}
              >
                {digest.deltaPct > 0 ? "▲" : "▼"} {Math.abs(digest.deltaPct)}% до попереднього
              </div>
            )}
          </div>

          <ul className="space-y-3">
            {digest.insights.map((insight) => (
              <li
                key={insight.id}
                className={`card ${
                  insight.tone === "warn"
                    ? "border-warn/40 bg-warn/5"
                    : insight.tone === "good"
                      ? "border-positive/40 bg-positive/5"
                      : ""
                }`}
              >
                <div className="flex gap-3">
                  <span className="text-xl leading-none">{insight.icon}</span>
                  <div className="min-w-0">
                    <div className="font-semibold">{insight.headline}</div>
                    <p className="mt-1 text-sm text-muted">{insight.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {digest.biggest.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                Найбільші витрати
              </h2>
              <ul className="space-y-2">
                {digest.biggest.map((t) => (
                  <li key={t.id} className="card flex items-center gap-3">
                    <span className="text-lg">{t.categories?.icon ?? "📦"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {t.merchant ?? t.categories?.name ?? "Без назви"}
                      </span>
                      <span className="block text-xs text-muted">{formatDate(t.occurred_on)}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(t.amount_cents)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {small.length >= 3 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                Дрібниці, що склалися у {formatMoney(digest.smallTotalCents)}
              </h2>
              <details className="card">
                <summary className="cursor-pointer list-none text-sm font-semibold text-accent marker:content-none">
                  Показати всі {small.length}
                </summary>
                <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                  {small.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 text-sm">
                      <span>{t.categories?.icon ?? "📦"}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {t.merchant ?? t.categories?.name ?? "Без назви"}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {formatDate(t.occurred_on)}
                      </span>
                      <span className="shrink-0 tabular-nums">{formatMoney(t.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}

          <form action={markDigestSeen} className="mt-6">
            <input type="hidden" name="period_kind" value={kind} />
            <input type="hidden" name="period_start" value={period.from} />
            <button type="submit" className="btn-ghost w-full">
              Прочитав — прибрати з головної
            </button>
          </form>
        </>
      )}
    </>
  );
}
