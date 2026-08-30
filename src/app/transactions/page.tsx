import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import { formatSigned, formatDate, formatMoney, centsToInput } from "@/lib/format";
import { resolvePeriod, type PeriodKind } from "@/lib/periods";
import type { Transaction } from "@/lib/types";
import { PageHeader, AddPanel, Empty } from "@/components/ui";
import { TransactionFields } from "@/components/TransactionFields";
import { addTransaction, updateTransaction, deleteTransaction } from "../actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

const KINDS: PeriodKind[] = ["week", "month", "year"];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const kind = (KINDS.includes(params.period as PeriodKind) ? params.period : "month") as PeriodKind;
  const offset = Number(params.offset ?? 0) || 0;
  const period = resolvePeriod(kind, offset);

  const supabase = await createClient();
  const [{ data }, categories] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, categories (name, icon, slug)")
      .gte("occurred_on", period.from)
      .lte("occurred_on", period.to)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    getCategories(),
  ]);

  const rows = (data as Transaction[]) ?? [];
  const income = rows.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount_cents, 0);
  const expense = rows.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amount_cents, 0);

  return (
    <>
      <PageHeader title="Операції" subtitle={`${period.label} · ${rows.length} записів`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link
            key={k}
            href={`/transactions?period=${k}`}
            className={`chip ${k === kind ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}
          >
            {k === "week" ? "Тиждень" : k === "month" ? "Місяць" : "Рік"}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <Link href={`/transactions?period=${kind}&offset=${offset - 1}`} className="chip">
            ←
          </Link>
          {offset !== 0 && (
            <Link href={`/transactions?period=${kind}`} className="chip">
              Зараз
            </Link>
          )}
          {offset < 0 && (
            <Link href={`/transactions?period=${kind}&offset=${offset + 1}`} className="chip">
              →
            </Link>
          )}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="card">
          <div className="text-xs text-muted">Витрати</div>
          <div className="mt-0.5 font-bold tabular-nums text-negative">
            {formatMoney(expense)}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Доходи</div>
          <div className="mt-0.5 font-bold tabular-nums text-positive">{formatMoney(income)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Різниця</div>
          <div
            className={`mt-0.5 font-bold tabular-nums ${
              income - expense >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {formatMoney(income - expense)}
          </div>
        </div>
      </div>

      <AddPanel label="Додати операцію">
        <form action={addTransaction}>
          <TransactionFields categories={categories} />
          <button type="submit" className="btn-primary mt-4 w-full sm:w-auto">
            Зберегти
          </button>
        </form>
      </AddPanel>

      {rows.length === 0 ? (
        <Empty icon="🧾" text="За цей період операцій немає" />
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => (
            <li key={t.id}>
              <details className="card [&[open]>summary]:mb-4">
                <summary className="flex cursor-pointer list-none items-center gap-3 marker:content-none">
                  <span className="text-lg">{t.categories?.icon ?? "📦"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {t.merchant ?? t.categories?.name ?? "Без назви"}
                      {t.needs_review && (
                        <span className="ml-2 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                          перевірити
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {formatDate(t.occurred_on)}
                      {t.categories?.name ? ` · ${t.categories.name}` : ""}
                      {t.note ? ` · ${t.note}` : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-semibold tabular-nums ${
                      t.kind === "income" ? "text-positive" : "text-ink"
                    }`}
                  >
                    {formatSigned(t.amount_cents, t.kind)}
                  </span>
                </summary>

                <form action={updateTransaction} className="border-t border-line pt-4">
                  <input type="hidden" name="id" value={t.id} />
                  <TransactionFields
                    categories={categories}
                    defaults={{
                      kind: t.kind,
                      amount: centsToInput(t.amount_cents),
                      merchant: t.merchant ?? "",
                      note: t.note ?? "",
                      occurred_on: t.occurred_on,
                      category_id: t.category_id,
                    }}
                  />
                  <div className="mt-4 flex gap-2">
                    <button type="submit" className="btn-primary">
                      Оновити
                    </button>
                    <button
                      type="submit"
                      formAction={deleteTransaction}
                      className="btn-ghost text-negative"
                    >
                      Видалити
                    </button>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
