import Link from "next/link";
import { getCategories } from "@/lib/data";
import { getTransactions, currentSection } from "@/lib/financialData";
import { accountFilter, transactionTotals } from "@/lib/financial";
import {
  formatSigned,
  formatDate,
  formatMoney,
  centsToInput,
  validDate,
} from "@/lib/format";
import { resolvePeriod, PERIOD_LABELS, type PeriodKind } from "@/lib/periods";
import { PageHeader, Empty, Stat } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { AccountSwitch } from "@/components/AccountSwitch";
import { CalendarRange } from "@/components/Calendar";
import { CategoryField } from "@/components/CategoryPicker";
import { CategoryIcon, Icon } from "@/components/Icon";
import { TransactionFields } from "@/components/TransactionFields";
import {
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from "../actions";
export const dynamic = "force-dynamic";
interface Params {
  q?: string;
  category?: string;
  kind?: string;
  period?: string;
  offset?: string;
  from?: string;
  to?: string;
  account?: string;
  add?: string;
  edit?: string;
}
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const account = accountFilter(params.account ?? (await currentSection()));
  const periodKind = (
    ["week", "month", "year"].includes(params.period ?? "")
      ? params.period
      : "month"
  ) as PeriodKind;
  const offset = Number.isFinite(Number(params.offset))
    ? Number(params.offset)
    : 0;
  const preset = resolvePeriod(periodKind, offset);
  const f = validDate(params.from),
    t = validDate(params.to);
  const custom = !!f && !!t && f <= t;
  const from = custom ? f! : preset.from,
    to = custom ? t! : preset.to;
  const [rows, categories] = await Promise.all([
    getTransactions({
      from,
      to,
      account,
      kind: params.kind,
      category: params.category,
      search: params.q,
    }),
    getCategories(true),
  ]);
  const totals = transactionTotals(rows);
  const keep: Record<string, string> = {
    account,
    period: periodKind,
    offset: String(offset),
  };
  for (const k of ["q", "kind", "category"] as const)
    if (params[k]) keep[k] = params[k]!;
  if (custom) {
    keep.from = from;
    keep.to = to;
  }
  const href = (extra: Record<string, string>) =>
    "/transactions?" + new URLSearchParams({ ...keep, ...extra });
  const exportHref =
    "/api/export?" + new URLSearchParams({ ...keep, from, to, format: "xlsx" });
  const grouped = new Map<string, typeof rows>();
  for (const row of rows)
    grouped.set(row.occurred_on, [
      ...(grouped.get(row.occurred_on) ?? []),
      row,
    ]);
  return (
    <>
      <PageHeader
        title="Операції"
        subtitle={
          (custom ? formatDate(from) + " — " + formatDate(to) : preset.label) +
          " · " +
          rows.length +
          " записів"
        }
        action={
          <a
            className="icon-button"
            href={exportHref}
            aria-label="Експорт операцій"
          >
            <Icon name="download" />
          </a>
        }
      />
      <AccountSwitch
        value={account}
        base="/transactions"
        params={keep}
        unassigned
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["week", "month", "year"] as const).map((k) => (
          <Link
            key={k}
            href={href({ period: k, offset: "0", from: "", to: "" })}
            className={
              "chip " +
              (!custom && k === periodKind ? "border-accent" : "text-muted")
            }
          >
            {PERIOD_LABELS[k]}
          </Link>
        ))}
        <Link
          href={href({ offset: String(offset - 1), from: "", to: "" })}
          className="icon-button ml-auto"
          aria-label="Попередній період"
        >
          <Icon name="chevron" className="rotate-180" />
        </Link>
        <Link
          href={href({ offset: String(offset + 1), from: "", to: "" })}
          className="icon-button"
          aria-label="Наступний період"
        >
          <Icon name="chevron" />
        </Link>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["", "Усі"],
          ["expense", "Витрати"],
          ["income", "Доходи"],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={href({ kind: k })}
            className={
              "chip " +
              ((params.kind ?? "") === k ? "border-accent" : "text-muted")
            }
          >
            {label}
          </Link>
        ))}
        <Sheet
          title={
            "Фільтри · " +
            (account === "cash"
              ? "Готівка"
              : account === "gewerbe"
                ? "Gewerbe"
                : account === "unassigned"
                  ? "Без розділу"
                  : "Онлайн")
          }
          className="btn-ghost ml-auto"
          trigger={
            <>
              <Icon name="filter" size={18} />
              Фільтри
            </>
          }
          icon="filter"
        >
          <form method="get" className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="account" value={account} />
            <input type="hidden" name="period" value={periodKind} />
            <input type="hidden" name="offset" value={offset} />
            <label className="sm:col-span-2">
              <span className="label">Пошук</span>
              <input
                name="q"
                defaultValue={params.q}
                placeholder="Назва або нотатка"
                className="field"
              />
            </label>
            <CategoryField
              name="category"
              categories={categories}
              initial={params.category}
            />
            <label>
              <span className="label">Тип</span>
              <select
                name="kind"
                defaultValue={params.kind ?? ""}
                className="field"
              >
                <option value="">Витрати й доходи</option>
                <option value="expense">Витрати</option>
                <option value="income">Доходи</option>
              </select>
            </label>
            <CalendarRange
              initialFrom={custom ? from : ""}
              initialTo={custom ? to : ""}
            />
            <div className="flex gap-3 sm:col-span-2">
              <Link
                href={"/transactions?account=" + account}
                className="btn-outline"
              >
                Скинути
              </Link>
              <button className="btn-primary flex-1">Застосувати</button>
            </div>
          </form>
        </Sheet>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-5">
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
      </div>
      <div className="mb-5">
        <Sheet title="Додати операцію" open={params.add === "1"} icon="plus">
          <ActionForm action={addTransaction}>
            <TransactionFields
              categories={categories}
              defaults={{
                financial_account:
                  account === "unassigned" ? "online" : account,
              }}
            />
            <button className="btn-primary mt-5 w-full">Зберегти</button>
          </ActionForm>
        </Sheet>
      </div>
      {rows.length === 0 ? (
        <Empty
          icon="receipts"
          text={
            params.q || params.category
              ? "За такими умовами нічого не знайдено"
              : "За цей період операцій немає"
          }
        />
      ) : (
        [...grouped].map(([date, items]) => (
          <section key={date}>
            <h2 className="group-label">{formatDate(date)}</h2>
            <ul className="space-y-2">
              {items.map((row) => (
                <li key={row.id}>
                  <Sheet
                    title="Операція"
                    open={params.edit === row.id}
                    className="transaction-row w-full text-left"
                    trigger={
                      <>
                        <CategoryIcon
                          category={{
                            ...row.categories,
                            id: row.category_id ?? undefined,
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block row-title truncate">
                            {row.merchant ??
                              row.categories?.name ??
                              "Без назви"}
                          </span>
                          <span className="block row-meta truncate">
                            {row.categories?.name ?? "Без категорії"}
                            {row.note ? " · " + row.note : ""}
                          </span>
                        </span>
                        <span className={"row-amount " + row.kind}>
                          {formatSigned(row.amount_cents, row.kind)}
                        </span>
                      </>
                    }
                  >
                    {row.receipt_id && (
                      <a
                        href={"/api/receipt/" + row.receipt_id}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost mb-4 w-full"
                      >
                        <Icon name="receipts" size={20} />
                        Відкрити скан
                      </a>
                    )}
                    <ActionForm action={updateTransaction}>
                      <input type="hidden" name="id" value={row.id} />
                      <TransactionFields
                        categories={categories}
                        defaults={{
                          kind: row.kind,
                          amount: centsToInput(row.amount_cents),
                          merchant: row.merchant ?? "",
                          note: row.note ?? "",
                          occurred_on: row.occurred_on,
                          category_id: row.category_id,
                          financial_account: row.financial_account ?? null,
                        }}
                      />
                      <button className="btn-primary mt-5 w-full">
                        Оновити
                      </button>
                    </ActionForm>
                    <div className="mt-3">
                      <ConfirmAction
                        action={deleteTransaction}
                        id={row.id}
                        title="Видалити операцію?"
                        consequence="Цей запис буде видалено з операцій та фінансових підсумків."
                      />
                    </div>
                  </Sheet>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
