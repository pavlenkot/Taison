import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import { centsToInput, formatDate } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { PageHeader, Empty } from "@/components/ui";
import { Scanner } from "@/components/Scanner";
import { TransactionFields } from "@/components/TransactionFields";
import { updateTransaction, deleteTransaction } from "../actions";
import { activeProvider, aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const supabase = await createClient();
  const [{ data }, categories] = await Promise.all([
    supabase
      .from("transactions")
      .select("*, categories (name, icon, slug)")
      .eq("needs_review", true)
      .order("created_at", { ascending: false }),
    getCategories(),
  ]);

  const pending = (data as Transaction[]) ?? [];
  const provider = activeProvider();
  const configured = aiConfigured();

  return (
    <>
      <PageHeader
        title="Сканування"
        subtitle={configured ? `Розпізнає ${provider === "claude" ? "Claude" : "Gemini"}` : undefined}
      />

      {!configured && (
        <div className="card mb-4 border-warn/40 bg-warn/5 text-sm">
          <div className="font-semibold text-warn">AI не налаштовано</div>
          <p className="mt-1 text-muted">
            Обрано рушій <strong>{provider}</strong>, але ключа немає. Додайте{" "}
            <code>{provider === "claude" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY"}</code> у змінні
            середовища. Знімок усе одно збережеться, але дані доведеться ввести вручну.
          </p>
        </div>
      )}

      <Scanner />

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Чекають на перевірку
          {pending.length > 0 && (
            <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs text-warn">
              {pending.length}
            </span>
          )}
        </h2>

        {pending.length === 0 ? (
          <Empty icon="✓" text="Усі скани звірені" />
        ) : (
          <ul className="space-y-2">
            {pending.map((t) => (
              <li key={t.id}>
                <details open className="card [&[open]>summary]:mb-4">
                  <summary className="flex cursor-pointer list-none items-center gap-3 marker:content-none">
                    <span className="text-lg">{t.categories?.icon ?? "🧾"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {t.merchant ?? "Магазин не розпізнано"}
                      </span>
                      <span className="block text-xs text-muted">
                        {formatDate(t.occurred_on)} ·{" "}
                        {t.source === "shortcut" ? "Швидка команда" : "Скан у застосунку"}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {centsToInput(t.amount_cents)} €
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
                        Підтвердити
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
      </section>
    </>
  );
}
