import { Sheet } from "@/components/Sheet";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { DateField } from "@/components/Calendar";
import { Icon } from "@/components/Icon";
import { createClient } from "@/lib/supabase/server";
import {
  formatMoney,
  formatDate,
  describeDueDate,
  isoDate,
} from "@/lib/format";
import type { Goal, GoalContribution } from "@/lib/types";
import { PageHeader, AddPanel, Empty } from "@/components/ui";
import { addGoal, addContribution, completeGoal, deleteGoal } from "../actions";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const supabase = await createClient();
  const [{ data: goalRows }, { data: contribRows }] = await Promise.all([
    supabase
      .from("goals")
      .select("*")
      .eq("status", "active")
      .order("created_at"),
    supabase.from("goal_contributions").select("goal_id, amount_cents"),
  ]);

  const goals = (goalRows as Goal[]) ?? [];
  const contributions =
    (contribRows as Pick<GoalContribution, "goal_id" | "amount_cents">[]) ?? [];

  const savedByGoal = new Map<string, number>();
  for (const c of contributions) {
    savedByGoal.set(
      c.goal_id,
      (savedByGoal.get(c.goal_id) ?? 0) + c.amount_cents,
    );
  }

  return (
    <>
      <PageHeader title="Цілі" subtitle={`${goals.length} активних`} />

      <AddPanel label="Нова ціль">
        <ActionForm action={addGoal}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Назва</label>
              <input
                name="title"
                required
                placeholder="Відпустка, новий ноутбук, подушка безпеки…"
                className="field"
              />
            </div>
            <div>
              <label className="label">Цільова сума, € (необов'язково)</label>
              <input
                name="target"
                inputMode="decimal"
                placeholder="0,00"
                className="field tabular-nums"
              />
            </div>
            <div>
              <label className="label">Дедлайн (необов'язково)</label>
              <DateField name="due_on" label="Строк цілі" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Нотатка</label>
              <input name="notes" className="field" />
            </div>
          </div>
          <button type="submit" className="btn-primary mt-4 w-full sm:w-auto">
            Створити
          </button>
        </ActionForm>
      </AddPanel>

      {goals.length === 0 ? (
        <Empty icon="◈" text="Ще немає жодної цілі" />
      ) : (
        <ul className="space-y-3">
          {goals.map((g) => {
            const saved = savedByGoal.get(g.id) ?? 0;
            const pct = g.target_cents
              ? Math.min(100, Math.round((saved / g.target_cents) * 100))
              : null;
            const due = g.due_on ? describeDueDate(g.due_on) : null;

            return (
              <li key={g.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="icon-circle">
                        <Icon name="goals" />
                      </span>
                      <span className="font-semibold">{g.title}</span>
                    </div>
                    {g.notes && (
                      <div className="text-xs text-muted">{g.notes}</div>
                    )}
                    {due && (
                      <div
                        className={`text-xs ${
                          due.tone === "late"
                            ? "text-negative"
                            : due.tone === "soon"
                              ? "text-warn"
                              : "text-muted"
                        }`}
                      >
                        Дедлайн: {formatDate(g.due_on!)}
                      </div>
                    )}
                  </div>
                  {
                    <div className="shrink-0 text-right">
                      <div className="font-bold tabular-nums">
                        {formatMoney(saved)}
                      </div>
                      <div className="text-xs text-muted tabular-nums">
                        {g.target_cents
                          ? "з " + formatMoney(g.target_cents)
                          : "Накопичено"}
                      </div>
                    </div>
                  }
                </div>

                {pct !== null && (
                  <div className="mt-3">
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-line"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Прогрес цілі «${g.title}»`}
                    >
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 text-right text-xs text-muted tabular-nums">
                      {pct}%
                    </div>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                  <Sheet
                    title="Поповнити ціль"
                    trigger="Поповнити"
                    icon="goals"
                  >
                    <ActionForm action={addContribution}>
                      <input type="hidden" name="goal_id" value={g.id} />
                      <p className="mb-4 text-muted">{g.title}</p>
                      <div className="min-w-0 flex-1">
                        <label className="label">Поповнити на, €</label>
                        <input
                          name="amount"
                          required
                          inputMode="decimal"
                          placeholder="0,00"
                          className="field tabular-nums"
                        />
                      </div>
                      <div className="mt-3">
                        <label className="label">Дата поповнення</label>
                        <DateField
                          name="made_on"
                          label="Дата поповнення"
                          defaultValue={isoDate()}
                          required
                        />
                      </div>
                      <div className="mt-3">
                        <label className="label">Нотатка</label>
                        <input name="note" className="field" />
                      </div>
                      <button type="submit" className="btn-primary mt-4 w-full">
                        Додати
                      </button>
                    </ActionForm>
                  </Sheet>

                  <ActionForm action={completeGoal}>
                    <input type="hidden" name="id" value={g.id} />
                    <button type="submit" className="btn-ghost text-positive">
                      Готово
                    </button>
                  </ActionForm>

                  <ConfirmAction
                    action={deleteGoal}
                    id={g.id}
                    title="Видалити ціль?"
                    consequence="Ціль і записи її поповнення буде видалено. Операції у фінансових розділах залишаться без змін."
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
