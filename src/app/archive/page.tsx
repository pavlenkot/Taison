import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, formatDate, isoDate } from "@/lib/format";
import { resolvePeriod } from "@/lib/periods";
import type { Task, SubscriptionPayment, Goal } from "@/lib/types";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { reopenTask } from "../actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "tasks", label: "Завдання" },
  { key: "payments", label: "Платежі" },
  { key: "goals", label: "Цілі" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = (TABS.some((t) => t.key === params.tab) ? params.tab : "tasks") as TabKey;

  const supabase = await createClient();
  const week = resolvePeriod("week", 0);
  const month = resolvePeriod("month", 0);

  const [{ data: taskRows }, { data: paymentRows }, { data: goalRows }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .not("archived_at", "is", null)
      .order("done_at", { ascending: false })
      .limit(100),
    supabase
      .from("subscription_payments")
      .select("*, subscriptions (name)")
      .order("paid_on", { ascending: false })
      .limit(100),
    supabase
      .from("goals")
      .select("*")
      .in("status", ["done", "archived"])
      .order("completed_at", { ascending: false })
      .limit(100),
  ]);

  const tasks = (taskRows as Task[]) ?? [];
  const payments = (paymentRows as SubscriptionPayment[]) ?? [];
  const goals = (goalRows as Goal[]) ?? [];

  const doneThisWeek = tasks.filter(
    (t) => t.done_at && t.done_at.slice(0, 10) >= week.from && t.done_at.slice(0, 10) <= week.to,
  ).length;
  const doneThisMonth = tasks.filter(
    (t) => t.done_at && t.done_at.slice(0, 10) >= month.from && t.done_at.slice(0, 10) <= month.to,
  ).length;

  const paidThisMonth = payments
    .filter((p) => p.paid_on >= month.from && p.paid_on <= month.to)
    .reduce((s, p) => s + p.amount_cents, 0);
  const paidTotal = payments.reduce((s, p) => s + p.amount_cents, 0);

  return (
    <>
      <PageHeader title="Архів" subtitle="Нічого не видаляється — усе лишається тут" />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Завдань за тиждень" value={String(doneThisWeek)} />
        <Stat label="Завдань за місяць" value={String(doneThisMonth)} />
        <Stat label="Платежів за місяць" value={formatMoney(paidThisMonth)} />
        <Stat label="Цілей досягнуто" value={String(goals.length)} />
      </div>

      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/archive?tab=${t.key}`}
            className={`chip ${t.key === tab ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "tasks" &&
        (tasks.length === 0 ? (
          <Empty icon="✓" text="Ще немає виконаних завдань" />
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="card flex items-center gap-3">
                <span className="text-positive">✓</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium line-through decoration-line">
                    {t.title}
                  </span>
                  <span className="block text-xs text-muted">
                    {t.done_at ? formatDate(t.done_at.slice(0, 10)) : formatDate(t.due_on)}
                  </span>
                </span>
                <form action={reopenTask}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="shrink-0 text-xs text-muted hover:text-accent">
                    Повернути
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ))}

      {tab === "payments" &&
        (payments.length === 0 ? (
          <Empty icon="🔁" text="Ще немає оплачених платежів" />
        ) : (
          <>
            <ul className="space-y-2">
              {payments.map((p) => (
                <li key={p.id} className="card flex items-center gap-3">
                  <span className="text-positive">✓</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {p.subscriptions?.name ?? "Платіж"}
                    </span>
                    <span className="block text-xs text-muted">
                      Оплачено {formatDate(p.paid_on)}
                      {p.paid_on > p.due_on ? ` · строк був ${formatDate(p.due_on)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(p.amount_cents)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-right text-sm text-muted">
              Разом за {payments.length} останніх платежів:{" "}
              <strong className="text-ink tabular-nums">{formatMoney(paidTotal)}</strong>
            </p>
          </>
        ))}

      {tab === "goals" &&
        (goals.length === 0 ? (
          <Empty icon="◈" text="Ще немає закритих цілей" />
        ) : (
          <ul className="space-y-2">
            {goals.map((g) => (
              <li key={g.id} className="card flex items-center gap-3">
                <span className="text-positive">✓</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{g.title}</span>
                  <span className="block text-xs text-muted">
                    {g.completed_at ? `Досягнуто ${formatDate(g.completed_at.slice(0, 10))}` : "—"}
                  </span>
                </span>
                {g.target_cents && (
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(g.target_cents)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ))}
    </>
  );
}
