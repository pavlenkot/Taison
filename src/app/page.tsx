import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getTransactions, currentSection } from "@/lib/financialData";
import { formatMonth, validDate, isoDate } from "@/lib/format";
import { resolvePeriod } from "@/lib/periods";
import { FinancialHome } from "@/components/FinancialHome";
export const dynamic = "force-dynamic";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; month?: string }>;
}) {
  const params = await searchParams;
  const section = await currentSection(params.account);
  const from =
    validDate((params.month ?? isoDate().slice(0, 7)) + "-01") ??
    resolvePeriod("month").from;
  const month = from.slice(0, 7);
  const date = new Date(from + "T12:00:00Z");
  const to = isoDate(
    new Date(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  );
  const supabase = await createClient();
  const lastMonth = resolvePeriod("month", -1),
    lastWeek = resolvePeriod("week", -1);
  const [
    rows,
    { data: investment, error: investmentError },
    review,
    { data: syncRows },
    { data: seenRows },
    monthCount,
    weekCount,
  ] = await Promise.all([
    getTransactions({ from, to }),
    supabase
      .from("monthly_investments")
      .select("amount_cents")
      .eq("month", from)
      .maybeSingle(),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("needs_review", true),
    supabase.rpc("drive_sync_summary"),
    supabase
      .from("digest_views")
      .select("period_kind,period_start")
      .in("period_start", [lastMonth.from, lastWeek.from]),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("needs_review", false)
      .gte("occurred_on", lastMonth.from)
      .lte("occurred_on", lastMonth.to),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("needs_review", false)
      .gte("occurred_on", lastWeek.from)
      .lte("occurred_on", lastWeek.to),
  ]);
  if (investmentError) throw new Error("Не вдалося завантажити інвестиції");
  const seen = new Set(
    (seenRows ?? []).map(
      (r: { period_kind: string; period_start: string }) =>
        r.period_kind + ":" + r.period_start,
    ),
  );
  const digest =
    !seen.has("month:" + lastMonth.from) && (monthCount.count ?? 0) > 0
      ? "month"
      : !seen.has("week:" + lastWeek.from) && (weekCount.count ?? 0) > 0
        ? "week"
        : null;
  const sync = (syncRows ?? [])[0];
  const awaiting = (sync?.pending ?? 0) + (sync?.failed ?? 0);
  const unassigned = rows.filter((r) => !r.financial_account).length;
  const notices = (
    <>
      {unassigned > 0 && (
        <Link
          href="/transactions?account=unassigned"
          className="card text-sm text-muted"
        >
          {unassigned} операцій без фінансового розділу · Розподілити ›
        </Link>
      )}
      {(review.count ?? 0) > 0 && (
        <Link href="/scan" className="card text-sm text-warn">
          {review.count} сканів чекають на перевірку ›
        </Link>
      )}
      {awaiting > 0 && (
        <Link href="/settings" className="card text-sm text-warn">
          {awaiting} файлів чекають на копію в Google Диску ›
        </Link>
      )}
      {digest && (
        <Link href={"/digest?period=" + digest} className="card text-sm">
          Підсумок завершеного {digest === "month" ? "місяця" : "тижня"} готовий
          ›
        </Link>
      )}
    </>
  );
  return (
    <FinancialHome
      section={section}
      rows={rows}
      month={month}
      monthLabel={formatMonth(from)}
      investment={Number(investment?.amount_cents ?? 0)}
      notices={notices}
    />
  );
}
