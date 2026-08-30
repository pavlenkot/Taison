import { getCategories } from "@/lib/data";
import type { Category, Kind } from "@/lib/types";
import { PageHeader, AddPanel } from "@/components/ui";
import {
  addCategory,
  updateCategory,
  toggleCategoryHidden,
  deleteCategory,
} from "../actions";

export const dynamic = "force-dynamic";

function Group({ title, items }: { title: string; items: Category[] }) {
  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.id}>
            <details className={`card [&[open]>summary]:mb-4 ${c.hidden ? "opacity-55" : ""}`}>
              <summary className="flex cursor-pointer list-none items-center gap-3 marker:content-none">
                <span className="text-lg">{c.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {c.hidden ? "Прихована" : `Порядок ${c.sort}`}
                  </span>
                </span>
              </summary>

              <form action={updateCategory} className="border-t border-line pt-4">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="sm:col-span-2">
                    <label className="label">Назва</label>
                    <input name="name" required defaultValue={c.name} className="field" />
                  </div>
                  <div>
                    <label className="label">Значок</label>
                    <input name="icon" defaultValue={c.icon ?? "📦"} className="field text-center" />
                  </div>
                  <div>
                    <label className="label">Порядок</label>
                    <input
                      name="sort"
                      type="number"
                      defaultValue={c.sort}
                      className="field tabular-nums"
                    />
                  </div>
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="hidden" defaultChecked={c.hidden} className="size-4" />
                  Приховати зі списків вибору
                </label>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="submit" className="btn-primary">
                    Зберегти
                  </button>
                  <button
                    type="submit"
                    formAction={deleteCategory}
                    className="btn-ghost text-negative"
                  >
                    Видалити
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Видалення прибирає категорію з усіх минулих операцій — вони стануть
                  «без категорії». Якщо категорія просто більше не потрібна, надійніше
                  приховати: історія залишиться цілою.
                </p>
              </form>
            </details>

            <form action={toggleCategoryHidden} className="mt-1 pl-1">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="hidden" value={String(c.hidden)} />
              <button type="submit" className="text-xs text-muted hover:text-accent">
                {c.hidden ? "Повернути до списків" : "Приховати"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function CategoriesPage() {
  const categories = await getCategories(true);

  const byKind = (kind: Kind) => categories.filter((c) => c.kind === kind);

  return (
    <>
      <PageHeader
        title="Категорії"
        subtitle={`${categories.filter((c) => !c.hidden).length} у списках вибору`}
      />

      <AddPanel label="Нова категорія">
        <form action={addCategory}>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="label">Назва</label>
              <input name="name" required placeholder="Наприклад, Домашні тварини" className="field" />
            </div>
            <div>
              <label className="label">Значок</label>
              <input name="icon" placeholder="🐈" defaultValue="📦" className="field text-center" />
            </div>
            <div>
              <label className="label">Тип</label>
              <select name="kind" defaultValue="expense" className="field">
                <option value="expense">Витрата</option>
                <option value="income">Дохід</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary mt-4 w-full sm:w-auto">
            Створити
          </button>
        </form>
      </AddPanel>

      <Group title="Витрати" items={byKind("expense")} />
      <Group title="Доходи" items={byKind("income")} />

      <p className="text-xs text-muted">
        Категорії, які AI підставляє після сканування чека, підбираються за
        службовим кодом. Перейменування і значок на це не впливають — можна
        називати як зручно.
      </p>
    </>
  );
}
