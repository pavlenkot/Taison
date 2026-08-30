import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import { formatSigned, formatDate, formatMoney, centsToInput } from "@/lib/format";
import { resolvePeriod, type PeriodKind } from "@/lib/periods";
import type { Transaction } from "@/lib/types";
import { PageHeader, AddPanel, Empty } from "@/components/ui";
import { TransactionFields } from "@/components/TransactionFields";
import { addTransaction, updateTransaction, deleteTransaction } from "../actions";

export const dynamic = "force-dynamic";

const KINDS: PeriodKind[] = ["week", "month", "year"];

/**
 * У фільтрі .or() кома, дужки й відсоток мають службове значення —
 * прибираємо їх, щоб пошук за «(20%)» не ламав запит.
 */
function sanitise(term: string): string {
  return term.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
}

interface Params {
  q?: string;
  category?: string;
  kind?: string;
  period?: string;
  offset?: string;
  from?: string;
  to?: string;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  const periodKind = (
    KINDS.includes(params.period as PeriodKind) ? params.period : "month"
  ) as PeriodKind;
  const offset = Number(params.offset ?? 0) || 0;
  const preset = resolvePeriod(periodKind, offset);

  const custom = Boolean(params.from && params.to);
  const from = custom ? params.from! : preset.from;
  const to = custom ? params.to! : preset.to;

  const search = sanitise(params.q ?? "");
  const categoryId = params.category ?? "";
  const kindFilter = params.kind === "expense" || params.kind === "income" ? params.kind : "";

  const supabase = await createClient();

  let query = supabase
    .from("transactions")
    .select("*, categories (name, icon, slug)")
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (search.length > 0) {
    query = query.or(`merchant.ilike.%${search}%,note.ilike.%${search}%`);
  }
  if (categoryId) query = query.eq("category_id", categoryId);
  if (kindFilter) query = query.eq("kind", kindFilter);

  const [{ data }, categories] = await Promise.all([query, getCategories()]);

  const rows = (data as Transaction[]) ?? [];
  const income = rows.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount_cents, 0);
  const expense = rows.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amount_cents, 0);

  const filtered = search.length > 0 || categoryId !== "" || kindFilter !== "";
  const title = custom ? `${formatDate(from)} — ${formatDate(to)}` : preset.label;

  return (
    <>
      <PageHeader
        title="Операції"
        subtitle={`${title} · ${rows.length} записів`}
        action={
          <a
            href={`/api/export?format=xlsx&from=${from}&to=${to}`}
            className="btn-ghost py-2 text-xs"
          >
            Експорт
          </a>
        }
      />

      {!custom && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <Link
              key={k}
              href={`/transactions?period=${k}`}
              className={`chip ${k === periodKind ? "border-accent bg-accent/10 text-accent" : "text-muted"}`}
            >
              {k === "week" ? "Тиждень" : k === "month" ? "Місяць" : "Рік"}
            </Link>
          ))}
          <span className="ml-auto flex items-center gap-2">
            <Link href={`/transactions?period=${periodKind}&offset=${offset - 1}`} className="chip">
              ←
            </Link>
            {offset !== 0 && (
              <Link href={`/transactions?period=${periodKind}`} className="chip">
                Зараз
              </Link>
            )}
            {offset < 0 && (
              <Link
                href={`/transactions?period=${periodKind}&offset=${offset + 1}`}
                className="chip"
              >
                →
              </Link>
            )}
          </span>
        </div>
      )}

      <details open={filtered || custom} className="card mb-4 [&[open]>summary]:mb-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-accent marker:content-none">
          Пошук і фільтри{filtered ? " · увімкнено" : ""}
        </summary>

        <form method="get" className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="q">
              Пошук за магазином і нотаткою
            </label>
            <input
              id="q"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Наприклад, ALDI"
              className="field"
            />
          </div>

          <div>
            <label className="label" htmlFor="category">
              Категорія
            </label>
            <select id="category" name="category" defaultValue={categoryId} className="field">
              <option value="">Усі категорії</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="kind">
              Тип
            </label>
            <select id="kind" name="kind" defaultValue={kindFilter} className="field">
              <option value="">Витрати й доходи</option>
              <option value="expense">Лише витрати</option>
              <option value="income">Лише доходи</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="from">
              Від
            </label>
            <input id="from" name="from" type="date" defaultValue={custom ? from : ""} className="field" />
          </div>

          <div>
            <label className="label" htmlFor="to">
              До
            </label>
            <input id="to" name="to" type="date" defaultValue={custom ? to : ""} className="field" />
          </div>

          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" className="btn-primary">
              Застосувати
            </button>
            <Link href="/transactions" className="btn-ghost">
              Скинути
            </Link>
          </div>

          <p className="text-xs text-muted sm:col-span-2">
            Задайте «Від» і «До» разом, щоб узяти довільний проміжок — кнопка
            «Експорт» вивантажить саме його.
          </p>
        </form>
      </details>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="card">
          <div className="text-xs text-muted">Витрати</div>
          <div className="mt-0.5 font-bold tabular-nums text-negative">{formatMoney(expense)}</div>
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
        <Empty
          icon="🧾"
          text={filtered ? "За такими умовами нічого не знайшлося" : "За цей період операцій немає"}
        />
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

                {t.receipt_id && (
                  <a
                    href={`/api/receipt/${t.receipt_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost mb-3 w-full"
                  >
                    🧾 Подивитися скан чека
                  </a>
                )}

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
