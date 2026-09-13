import { createClient } from "@/lib/supabase/server";
import { getCategories } from "@/lib/data";
import { currentSection } from "@/lib/financialData";
import { accountFilter, accountLabel } from "@/lib/financial";
import {
  formatMoney,
  formatDate,
  describeDueDate,
  centsToInput,
  isoDate,
} from "@/lib/format";
import {
  RECURRENCE_LABELS,
  type Subscription,
  type Recurrence,
} from "@/lib/types";
import { PageHeader, Empty } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { AccountField } from "@/components/AccountSwitch";
import { DateField } from "@/components/Calendar";
import { CategoryField } from "@/components/CategoryPicker";
import { Icon } from "@/components/Icon";
import {
  addSubscription,
  updateSubscription,
  paySubscription,
  deleteSubscription,
} from "../actions";
import Link from "next/link";
export const dynamic = "force-dynamic";
function monthlyCost(s: Subscription) {
  switch (s.recurrence) {
    case "weekly":
      return Math.round((s.amount_cents * 52) / 12);
    case "monthly":
      return Number(s.amount_cents);
    case "quarterly":
      return Math.round(s.amount_cents / 3);
    case "yearly":
      return Math.round(s.amount_cents / 12);
    default:
      return 0;
  }
}
function Fields({
  categories,
  s,
  account,
}: {
  categories: Awaited<ReturnType<typeof getCategories>>;
  s?: Subscription;
  account?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2">
        <span className="label">Назва</span>
        <input
          name="name"
          required
          placeholder="Netflix, оренда, інтернет…"
          defaultValue={s?.name}
          className="field"
        />
      </label>
      <label>
        <span className="label">Сума, €</span>
        <input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={s ? centsToInput(s.amount_cents) : ""}
          placeholder="0,00"
          className="field"
        />
      </label>
      <label>
        <span className="label">Періодичність</span>
        <select
          name="recurrence"
          defaultValue={s?.recurrence ?? "monthly"}
          className="field"
        >
          {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
            <option key={r} value={r}>
              {RECURRENCE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className="label">Наступний платіж</span>
        <DateField
          name="next_due_on"
          defaultValue={s?.next_due_on ?? isoDate()}
          required
          label="Дата платежу"
        />
      </div>
      <AccountField
        value={s ? (s.financial_account ?? null) : account}
        allowUnassigned={!!s && !s.financial_account}
      />
      <div className="sm:col-span-2">
        <CategoryField
          categories={categories}
          initial={s?.category_id}
          kind="expense"
        />
      </div>
      <label className="sm:col-span-2">
        <span className="label">Нотатка</span>
        <input name="notes" defaultValue={s?.notes ?? ""} className="field" />
      </label>
      {s && (
        <label className="sm:col-span-2 flex gap-3 items-center">
          <input
            type="checkbox"
            name="active"
            defaultChecked={s.active}
            className="size-5"
          />
          Активний платіж
        </label>
      )}
    </div>
  );
}
export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const [{ data, error }, categories, section] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*")
      .order("active", { ascending: false })
      .order("next_due_on"),
    getCategories(true),
    currentSection(),
  ]);
  if (error) throw new Error("Не вдалося завантажити платежі");
  const rows = (data as Subscription[]) ?? [],
    active = rows.filter((s) => s.active);
  const groups = new Map<string, Subscription[]>();
  for (const s of active)
    groups.set(s.next_due_on, [...(groups.get(s.next_due_on) ?? []), s]);
  const render = (s: Subscription) => (
    <li key={s.id} className="card">
      <div className="flex gap-3 items-center">
        <span className="icon-circle">
          <Icon name="payments" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block truncate">{s.name}</strong>
          <span className="row-meta">
            {accountLabel(s.financial_account)} ·{" "}
            {RECURRENCE_LABELS[s.recurrence]}
          </span>
        </span>
        <strong className="tabular-nums">{formatMoney(s.amount_cents)}</strong>
      </div>
      <div className="flex gap-3 mt-4 items-center">
        {s.active && (
          <ActionForm action={paySubscription}>
            <input type="hidden" name="id" value={s.id} />
            <button className="btn-primary">
              <Icon name="check" size={18} />
              Оплачено
            </button>
          </ActionForm>
        )}
        <Sheet
          title="Налаштування платежу"
          trigger="Змінити"
          className="btn-ghost"
          icon="payments"
        >
          <ActionForm action={updateSubscription}>
            <input type="hidden" name="id" value={s.id} />
            <Fields categories={categories} s={s} />
            <button className="btn-primary mt-5 w-full">Оновити</button>
          </ActionForm>
          <div className="mt-3">
            <ConfirmAction
              action={deleteSubscription}
              id={s.id}
              title="Видалити платіж?"
              consequence="Запланований платіж і його історія оплат будуть видалені. Записані фінансові операції залишаться."
            />
          </div>
        </Sheet>
      </div>
    </li>
  );
  return (
    <>
      <PageHeader
        title="Підписки та платежі"
        subtitle={active.length + " активних"}
        action={
          <Link
            href="/archive?tab=payments"
            className="icon-button"
            aria-label="Історія оплат"
          >
            <Icon name="archive" />
          </Link>
        }
      />
      <section className="financial-summary !rounded-[28px] mb-5 !p-6">
        <p className="text-sm text-muted">Регулярні витрати на місяць</p>
        <strong className="block text-4xl font-bold tabular-nums mt-3">
          {formatMoney(active.reduce((v, s) => v + monthlyCost(s), 0))}
        </strong>
      </section>
      <div className="mb-5">
        <Sheet title="Додати платіж" icon="payments">
          <ActionForm action={addSubscription}>
            <Fields
              categories={categories}
              account={
                accountFilter(section) === "unassigned"
                  ? "online"
                  : accountFilter(section)
              }
            />
            <button className="btn-primary mt-5 w-full">Зберегти</button>
          </ActionForm>
        </Sheet>
      </div>
      {rows.length === 0 ? (
        <Empty icon="payments" text="Запланованих платежів поки немає" />
      ) : (
        <>
          {[...groups].map(([date, items]) => (
            <section key={date}>
              <h2
                className={
                  "group-label " +
                  (describeDueDate(date).tone === "late" ? "text-negative" : "")
                }
              >
                {formatDate(date)} · {describeDueDate(date).label}
              </h2>
              <ul className="space-y-3">{items.map(render)}</ul>
            </section>
          ))}
          {rows.some((s) => !s.active) && (
            <section className="mt-6">
              <h2 className="group-label">Неактивні</h2>
              <ul className="space-y-3 opacity-60">
                {rows.filter((s) => !s.active).map(render)}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
