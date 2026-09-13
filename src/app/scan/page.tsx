import { getCategories } from "@/lib/data";
import { getTransactions, currentSection } from "@/lib/financialData";
import { accountFilter } from "@/lib/financial";
import { centsToInput, formatMoney, formatDate } from "@/lib/format";
import { PageHeader, Empty } from "@/components/ui";
import { Scanner } from "@/components/Scanner";
import { Sheet } from "@/components/Sheet";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { CategoryIcon } from "@/components/Icon";
import { TransactionFields } from "@/components/TransactionFields";
import { updateTransaction, deleteTransaction } from "../actions";
import { aiConfigured } from "@/lib/ai";
export const dynamic = "force-dynamic";
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>;
}) {
  const p = await searchParams;
  const [pending, categories, section] = await Promise.all([
    getTransactions({ review: true }),
    getCategories(true),
    currentSection(),
  ]);
  return (
    <>
      <PageHeader title="Сканування" subtitle="Чеки та документи" />
      {!aiConfigured() && (
        <p className="card mb-4 text-sm text-warn">
          Розпізнавання поки недоступне. Можна додати операцію вручну або
          спробувати пізніше.
        </p>
      )}
      <Scanner />
      <section className="mt-6">
        <h2 className="mb-4">
          Чекають на перевірку{" "}
          <span className="text-muted text-base">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <Empty icon="check" text="Усі скани перевірені" />
        ) : (
          <ul className="space-y-2">
            {pending.map((row) => (
              <li key={row.id}>
                <Sheet
                  title="Перевірка чека"
                  open={p.review === row.id}
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
                        <span className="row-title block truncate">
                          {row.merchant ?? "Магазин не розпізнано"}
                        </span>
                        <span className="row-meta">
                          {formatDate(row.occurred_on)}
                        </span>
                      </span>
                      <strong className="row-amount">
                        {formatMoney(row.amount_cents)}
                      </strong>
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
                      Відкрити оригінал чека
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
                        financial_account:
                          row.financial_account ?? accountFilter(section),
                      }}
                    />
                    <button className="btn-primary mt-5 w-full">
                      Підтвердити
                    </button>
                  </ActionForm>
                  <div className="mt-3">
                    <ConfirmAction
                      action={deleteTransaction}
                      id={row.id}
                      title="Видалити чернетку?"
                      consequence="Операцію буде видалено з черги перевірки. Збережений скан залишиться у списку файлів."
                    />
                  </div>
                </Sheet>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
