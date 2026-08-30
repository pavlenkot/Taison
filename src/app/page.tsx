import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatSigned, formatDate, describeDueDate, isoDate } from "@/lib/format";
import { resolvePeriod, type PeriodKind } from "@/lib/periods";
import type { Subscription, Task, Transaction, PeriodTotal } from "@/lib/types";
import { Stat, Empty } from "@/components/ui";
import { completeTask, paySubscription } from "./actions";

export const dynamic = "force-dynamic";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Доброї ночі";
  if (h < 12) return "Доброго ранку";
  if (h < 18) return "Доброго дня";
  return "Доброго вечора";
}

export default async function Dashboard() {
  const supabase = await createClient();
  const today = isoDate();
  const month = resolvePeriod("month", 0);
  const prevMonth = resolvePeriod("month", -1);

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);

  const [
    { data: nowTotals },
    { data: prevTotals },
    { data: dueRows },
    { data: taskRows },
    { data: recentRows },
    { data: reviewRows },
  ] = await Promise.all([
    supabase.rpc("period_totals", { p_from: month.from, p_to: month.to, p_bucket: "month" }),
    supabase.rpc("period_totals", {
      p_from: prevMonth.from,
      p_to: prevMonth.to,
      p_bucket: "month",
    }),
    supabase
      .from("subscriptions")
      .select("*, categories (name, icon)")
      .eq("active", true)
      .lte("next_due_on", isoDate(horizon))
      .order("next_due_on"),
    supabase
      .from("tasks")
      .select("*")
      .is("archived_at", null)
      .lte("due_on", today)
      .order("due_on"),
    supabase
      .from("transactions")
      .select("*, categories (name, icon, slug)")
      .eq("needs_review", false)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("transactions")
      .select("id")
      .eq("needs_review", true),
  ]);

  const sum = (rows: PeriodTotal[] | null, kind: "expense" | "income") =>
    (rows ?? []).filter((r) => r.kind === kind).reduce((s, r) => s + Number(r.total_cents), 0);

  const expense = sum(nowTotals as PeriodTotal[], "expense");
  const income = sum(nowTotals as PeriodTotal[], "income");
  const prevExpense = sum(prevTotals as PeriodTotal[], "expense");
  const delta =
    prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null;

  // Підсумок за щойно завершений період: спершу місяць, потім тиждень.
  // Показуємо лише те, що не позначено прочитаним і в чому взагалі є витрати.
  const lastMonth = resolvePeriod("month", -1);
  const lastWeek = resolvePeriod("week", -1);

  const [{ data: seenRows }, monthCount, weekCount] = await Promise.all([
    supabase
      .from("digest_views")
      .select("period_kind, period_start")
      .in("period_start", [lastMonth.from, lastWeek.from]),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("kind", "expense")
      .eq("needs_review", false)
      .gte("occurred_on", lastMonth.from)
      .lte("occurred_on", lastMonth.to),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("kind", "expense")
      .eq("needs_review", false)
      .gte("occurred_on", lastWeek.from)
      .lte("occurred_on", lastWeek.to),
  ]);

  const seen = new Set(
    ((seenRows as { period_kind: string; period_start: string }[]) ?? []).map(
      (row) => `${row.period_kind}:${row.period_start}`,
    ),
  );

  const pendingDigest: { kind: PeriodKind; label: string } | null =
    !seen.has(`month:${lastMonth.from}`) && (monthCount.count ?? 0) > 0
      ? { kind: "month", label: lastMonth.label }
      : !seen.has(`week:${lastWeek.from}`) && (weekCount.count ?? 0) > 0
        ? { kind: "week", label: lastWeek.label }
        : null;

  const due = (dueRows as Subscription[]) ?? [];
  const tasks = (taskRows as Task[]) ?? [];
  const recent = (recentRows as Transaction[]) ?? [];
  const pendingReview = (reviewRows ?? []).length;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{greeting()}</h1>
        <p className="mt-0.5 text-sm text-muted">{month.label}</p>
      </header>

      {pendingDigest && (
        <Link
          href={`/digest?period=${pendingDigest.kind}`}
          className="card mb-4 flex items-center gap-3 border-accent/40 bg-accent/5"
        >
          <span className="text-xl">🗒️</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              Підсумок за {pendingDigest.label.toLowerCase()} готовий
            </span>
            <span className="block text-xs text-muted">
              Куди пішли гроші, найбільші покупки й непомітні дрібниці
            </span>
          </span>
          <span className="text-muted">›</span>
        </Link>
      )}

      {pendingReview > 0 && (
        <Link
          href="/scan"
          className="card mb-4 flex items-center gap-3 border-warn/40 bg-warn/5"
        >
          <span className="text-xl">⌷</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {pendingReview} скан{pendingReview === 1 ? "" : "и"} чекає на перевірку
            </span>
            <span className="block text-xs text-muted">
              Звірте суму й категорію, які розпізнав AI
            </span>
          </span>
          <span className="text-muted">›</span>
        </Link>
      )}

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Витрати" value={formatMoney(expense)} tone="negative" />
        <Stat label="Доходи" value={formatMoney(income)} tone="positive" />
        <Stat
          label="Різниця"
          value={formatMoney(income - expense)}
          tone={income - expense >= 0 ? "positive" : "negative"}
        />
        <Stat
          label="До минулого"
          value={delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
          tone={delta === null ? "neutral" : delta > 0 ? "negative" : "positive"}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Оплатити найближчим часом
            </h2>
            <Link href="/subscriptions" className="text-xs text-accent">
              Усі
            </Link>
          </div>

          {due.length === 0 ? (
            <Empty icon="✓" text="Нічого не горить найближчі два тижні" />
          ) : (
            <ul className="space-y-2">
              {due.map((s) => {
                const d = describeDueDate(s.next_due_on);
                return (
                  <li key={s.id} className="card flex items-center gap-3">
                    <span className="text-lg">{s.categories?.icon ?? "🔁"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span
                        className={`block text-xs ${
                          d.tone === "late"
                            ? "text-negative"
                            : d.tone === "soon"
                              ? "text-warn"
                              : "text-muted"
                        }`}
                      >
                        {d.label}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(s.amount_cents)}
                    </span>
                    <form action={paySubscription}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs">
                        Оплачено
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Завдання на сьогодні
            </h2>
            <Link href="/tasks" className="text-xs text-accent">
              Усі
            </Link>
          </div>

          {tasks.length === 0 ? (
            <Empty icon="✓" text="На сьогодні все зроблено" />
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="card flex items-center gap-3">
                  <form action={completeTask} className="flex">
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      aria-label={`Позначити «${t.title}» виконаним`}
                      className="size-6 shrink-0 rounded-full border-2 border-line transition hover:border-positive hover:bg-positive/10"
                    />
                  </form>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.title}</span>
                    {t.due_on < today && (
                      <span className="block text-xs text-negative">
                        {describeDueDate(t.due_on).label}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Останні операції
          </h2>
          <Link href="/transactions" className="text-xs text-accent">
            Усі
          </Link>
        </div>

        {recent.length === 0 ? (
          <Empty icon="🧾" text="Ще немає жодної операції" />
        ) : (
          <ul className="space-y-2">
            {recent.map((t) => (
              <li key={t.id} className="card flex items-center gap-3">
                <span className="text-lg">{t.categories?.icon ?? "📦"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {t.merchant ?? t.categories?.name ?? "Без назви"}
                  </span>
                  <span className="block text-xs text-muted">{formatDate(t.occurred_on)}</span>
                </span>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${
                    t.kind === "income" ? "text-positive" : ""
                  }`}
                >
                  {formatSigned(t.amount_cents, t.kind)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
