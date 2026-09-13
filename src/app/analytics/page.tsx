import Link from "next/link";
import { getTransactions, currentSection } from "@/lib/financialData";
import { accountFilter, transactionTotals } from "@/lib/financial";
import { resolvePeriod, PERIOD_LABELS, type PeriodKind } from "@/lib/periods";
import { formatMoney } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";
import { AccountSwitch } from "@/components/AccountSwitch";
import { AnalyticsPlot } from "@/components/AnalyticsPlot";
export const dynamic = "force-dynamic";
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    period?: string;
    offset?: string;
    kind?: string;
  }>;
}) {
  const p = await searchParams;
  const account = accountFilter(p.account ?? (await currentSection()));
  const period = (
    ["week", "month", "year"].includes(p.period ?? "") ? p.period : "month"
  ) as PeriodKind;
  const offset = Number.isFinite(Number(p.offset)) ? Number(p.offset) : 0;
  const now = resolvePeriod(period, offset),
    before = resolvePeriod(period, offset - 1);
  const [rows, previous] = await Promise.all([
    getTransactions({ account, from: now.from, to: now.to }),
    getTransactions({ account, from: before.from, to: before.to }),
  ]);
  const totals = transactionTotals(rows),
    prev = transactionTotals(previous);
  const delta =
    prev.expense > 0
      ? Math.round(((totals.expense - prev.expense) / prev.expense) * 100)
      : null;
  const keep = { account, period, offset: String(offset) };
  const href = (extra: Record<string, string>) =>
    "/analytics?" + new URLSearchParams({ ...keep, ...extra });
  return (
    <>
      <PageHeader title="Аналітика" subtitle={now.label} />
      <AccountSwitch
        value={account}
        base="/analytics"
        params={keep}
        unassigned
      />
      <div className="flex flex-wrap gap-2 mb-5">
        {(["week", "month", "year"] as const).map((k) => (
          <Link
            key={k}
            href={href({ period: k, offset: "0" })}
            className={
              "chip " + (period === k ? "border-accent" : "text-muted")
            }
          >
            {PERIOD_LABELS[k]}
          </Link>
        ))}
        <Link
          className="chip ml-auto"
          href={href({ offset: String(offset - 1) })}
          aria-label="Попередній період"
        >
          ‹
        </Link>
        <Link
          className="chip"
          href={href({ offset: String(offset + 1) })}
          aria-label="Наступний період"
        >
          ›
        </Link>
      </div>
      <AnalyticsPlot
        key={account + period + offset}
        rows={rows}
        from={now.from}
        to={now.to}
        monthly={now.bucket === "month"}
        initialKind={p.kind === "income" ? "income" : "expense"}
        exportBase={
          "/api/export?" +
          new URLSearchParams({
            account,
            from: now.from,
            to: now.to,
            format: "xlsx",
          })
        }
      />
      <div className="grid grid-cols-2 gap-3 mt-6 sm:grid-cols-4">
        <Stat
          label="Витрати"
          value={formatMoney(totals.expense)}
          tone="negative"
        />
        <Stat
          label="Доходи"
          value={formatMoney(totals.income)}
          tone="positive"
        />
        <Stat
          label="Різниця"
          value={formatMoney(totals.income - totals.expense)}
        />
        <Stat
          label="До попереднього періоду"
          value={delta === null ? "—" : (delta > 0 ? "+" : "") + delta + "%"}
          hint={formatMoney(prev.expense)}
        />
      </div>
    </>
  );
}
