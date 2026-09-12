import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import { formatMoney, describeDueDate, centsToInput, isoDate } from "@/lib/format";
import { RECURRENCE_LABELS, type Subscription, type Recurrence } from "@/lib/types";
import { PageHeader, AddPanel, Empty } from "@/components/ui";
import {
  addSubscription,
  updateSubscription,
  paySubscription,
  deleteSubscription,
} from "../actions";

export const dynamic = "force-dynamic";

/** Скільки підписка коштує на місяць — щоб показати сумарне навантаження. */
function monthlyCost(s: Subscription): number {
  switch (s.recurrence) {
    case "weekly":
      return Math.round((s.amount_cents * 52) / 12);
    case "monthly":
      return s.amount_cents;
    case "quarterly":
      return Math.round(s.amount_cents / 3);
    case "yearly":
      return Math.round(s.amount_cents / 12);
    default:
      return 0; // одноразові платежі не входять у регулярне навантаження
  }
}

function Fields({
  categories,
  s,
}: {
  categories: Awaited<ReturnType<typeof getCategories>>;
  s?: Subscription;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Назва</label>
        <input
          name="name"
          required
          placeholder="Netflix, оренда, страхування…"
          defaultValue={s?.name}
          className="field"
        />
      </div>
      <div>
        <label className="label">Сума, €</label>
        <input
          name="amount"
          required
          inputMode="decimal"
          placeholder="0,00"
          defaultValue={s ? centsToInput(s.amount_cents) : ""}
          className="field tabular-nums"
        />
      </div>
      <div>
        <label className="label">Періодичність</label>
        <select name="recurrence" defaultValue={s?.recurrence ?? "monthly"} className="field">
          {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Наступний платіж</label>
        <input
          name="next_due_on"
          type="date"
          required
          defaultValue={s?.next_due_on ?? isoDate()}
          className="field"
        />
      </div>
      <div>
        <label className="label">Категорія</label>
        <select name="category_id" defaultValue={s?.category_id ?? ""} className="field">
          <option value="">Без категорії</option>
          {categories
            .filter((c) => c.kind === "expense")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Нотатка</label>
        <input name="notes" defaultValue={s?.notes ?? ""} className="field" />
      </div>
      {s && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={s.active} className="size-4" />
          Активна
        </label>
      )}
    </div>
  );
}

export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const [{ data }, categories] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*, categories (name, icon)")
      .order("active", { ascending: false })
      .order("next_due_on"),
    getCategories(),
  ]);

  const subs = (data as Subscription[]) ?? [];
  const active = subs.filter((s) => s.active);
  const inactive = subs.filter((s) => !s.active);
  const perMonth = active.reduce((sum, s) => sum + monthlyCost(s), 0);

  const today = isoDate();
  const dueSoon = active.filter((s) => {
    const days = (new Date(s.next_due_on).getTime() - new Date(today).getTime()) / 86_400_000;
    return days <= 7;
  });

  return (
    <>
      <PageHeader
        title="Підписки та платежі"
        subtitle={`${active.length} активних · ${formatMoney(perMonth)} на місяць`}
      />

      {dueSoon.length > 0 && (
        <div className="card mb-4 border-warn/40 bg-warn/5">
          <div className="text-xs font-semibold uppercase tracking-wide text-warn">
            Оплатити найближчим часом
          </div>
          <ul className="mt-2 space-y-1.5">
            {dueSoon.map((s) => {
              const due = describeDueDate(s.next_due_on);
              return (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  <span className={due.tone === "late" ? "text-negative" : "text-warn"}>
                    {due.label}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(s.amount_cents)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AddPanel label="Додати підписку або рахунок">
        <form action={addSubscription}>
          <Fields categories={categories} />
          <button type="submit" className="btn-primary mt-4 w-full sm:w-auto">
            Зберегти
          </button>
        </form>
      </AddPanel>

      {subs.length === 0 ? (
        <Empty icon="🔁" text="Ще немає жодної підписки" />
      ) : (
        <ul className="space-y-2">
          {[...active, ...inactive].map((s) => {
            const due = describeDueDate(s.next_due_on);
            return (
              <li key={s.id}>
                <div className={`card ${s.active ? "" : "opacity-55"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{s.categories?.icon ?? "🔁"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block text-xs text-muted">
                        {RECURRENCE_LABELS[s.recurrence]} ·{" "}
                        <span
                          className={
                            due.tone === "late"
                              ? "text-negative"
                              : due.tone === "soon"
                                ? "text-warn"
                                : ""
                          }
                        >
                          {s.active ? due.label : "Неактивна"}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {formatMoney(s.amount_cents)}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                    {s.active && (
                      <form action={paySubscription}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="btn-primary py-2 text-xs">
                          Оплачено
                        </button>
                      </form>
                    )}
                    <details className="w-full [&[open]>summary]:mb-3">
                      <summary className="btn-ghost inline-flex cursor-pointer list-none py-2 text-xs marker:content-none">
                        Змінити
                      </summary>
                      <form action={updateSubscription} className="border-t border-line pt-3">
                        <input type="hidden" name="id" value={s.id} />
                        <Fields categories={categories} s={s} />
                        <div className="mt-4 flex gap-2">
                          <button type="submit" className="btn-primary">
                            Оновити
                          </button>
                          <button
                            type="submit"
                            formAction={deleteSubscription}
                            className="btn-ghost text-negative"
                          >
                            Видалити
                          </button>
                        </div>
                      </form>
                    </details>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
