import { createClient } from "@/lib/supabase/server";
import { isoDate } from "@/lib/format";
import { REPEAT_LABELS, type Task, type TaskRepeat } from "@/lib/types";
import { PageHeader, AddPanel, Empty } from "@/components/ui";
import { TaskRow } from "@/components/TaskRow";
import { addTask } from "../actions";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const supabase = await createClient();
  const today = isoDate();

  const { data } = await supabase
    .from("tasks")
    .select("*")
    .is("archived_at", null)
    .order("due_on");

  const tasks = (data as Task[]) ?? [];
  const overdue = tasks.filter((t) => t.due_on < today);
  const todays = tasks.filter((t) => t.due_on === today);
  const upcoming = tasks.filter((t) => t.due_on > today);

  return (
    <>
      <PageHeader title="Щоденні завдання" subtitle={`${tasks.length} активних`} />

      <AddPanel label="Нове завдання">
        <form action={addTask}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Що зробити</label>
              <input name="title" required placeholder="Наприклад, оплатити інтернет" className="field" />
            </div>
            <div>
              <label className="label">Дата</label>
              <input name="due_on" type="date" defaultValue={today} className="field" />
            </div>
            <div>
              <label className="label">Повтор</label>
              <select name="repeat" defaultValue="none" className="field">
                {(Object.keys(REPEAT_LABELS) as TaskRepeat[]).map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Нотатка</label>
              <input name="note" className="field" />
            </div>
          </div>
          <button type="submit" className="btn-primary mt-4 w-full sm:w-auto">
            Додати
          </button>
        </form>
      </AddPanel>

      {tasks.length === 0 ? (
        <Empty icon="✓" text="Активних завдань немає. Виконані лежать в архіві." />
      ) : (
        <div className="space-y-5">
          {overdue.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-negative">
                Прострочені
              </h2>
              <ul className="space-y-2">
                {overdue.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </section>
          )}

          {todays.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Сьогодні
              </h2>
              <ul className="space-y-2">
                {todays.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </section>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Далі
              </h2>
              <ul className="space-y-2">
                {upcoming.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
