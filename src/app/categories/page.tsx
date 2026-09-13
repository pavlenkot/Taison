import Link from "next/link";
import { getCategories } from "@/lib/data";
import type { Category, Kind } from "@/lib/types";
import { PageHeader, Empty } from "@/components/ui";
import { Sheet } from "@/components/Sheet";
import { ActionForm, ConfirmAction } from "@/components/ActionForm";
import { GlyphPicker } from "@/components/CategoryPicker";
import { CategoryIcon } from "@/components/Icon";
import {
  addCategory,
  updateCategory,
  toggleCategoryHidden,
  deleteCategory,
} from "../actions";
export const dynamic = "force-dynamic";
function Group({ items }: { items: Category[] }) {
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.id} className={c.hidden ? "opacity-60" : ""}>
          <Sheet
            title="Редагування категорії"
            className="transaction-row w-full text-left"
            trigger={
              <>
                <CategoryIcon category={c} />
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-muted">
                  {c.hidden ? "Прихована" : "›"}
                </span>
              </>
            }
          >
            <ActionForm action={updateCategory}>
              <input type="hidden" name="id" value={c.id} />
              <label className="block mb-4">
                <span className="label">Назва</span>
                <input
                  name="name"
                  required
                  defaultValue={c.name}
                  className="field"
                />
              </label>
              <GlyphPicker initial={c.icon} />
              <label className="block mt-4">
                <span className="label">Порядок</span>
                <input
                  name="sort"
                  type="number"
                  defaultValue={c.sort}
                  className="field"
                />
              </label>
              <label className="flex gap-3 items-center mt-4">
                <input
                  type="checkbox"
                  name="hidden"
                  defaultChecked={c.hidden}
                  className="size-5"
                />
                Приховати зі списків вибору
              </label>
              <button className="btn-primary mt-5 w-full">Зберегти</button>
            </ActionForm>
            <div className="mt-3">
              <ConfirmAction
                action={deleteCategory}
                id={c.id}
                title="Видалити категорію?"
                consequence="Минулі операції залишаться без цієї категорії. Можна приховати її зі списків вибору, зберігши історію."
              />
            </div>
          </Sheet>
          <ActionForm
            action={toggleCategoryHidden}
            closeOnSuccess={false}
            className="mt-1"
          >
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="hidden" value={String(c.hidden)} />
            <button className="min-h-11 px-3 text-xs text-muted">
              {c.hidden ? "Повернути до списків" : "Приховати"}
            </button>
          </ActionForm>
        </li>
      ))}
    </ul>
  );
}
export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const p = await searchParams;
  const kind: Kind = p.kind === "income" ? "income" : "expense";
  const categories = await getCategories(true);
  const rows = categories.filter((c) => c.kind === kind);
  return (
    <>
      <PageHeader
        title="Категорії"
        subtitle={
          categories.filter((c) => !c.hidden).length + " у списках вибору"
        }
      />
      <div className="flex gap-3 mb-5">
        {(["expense", "income"] as const).map((k) => (
          <Link
            key={k}
            href={"/categories?kind=" + k}
            className={
              "chip flex-1 " + (k === kind ? "border-accent" : "text-muted")
            }
          >
            {k === "expense" ? "Витрати" : "Доходи"}
          </Link>
        ))}
      </div>
      <div className="mb-5">
        <Sheet title="Нова категорія" icon="categories">
          <ActionForm action={addCategory}>
            <label className="block mb-4">
              <span className="label">Назва</span>
              <input
                name="name"
                required
                placeholder="Назва категорії"
                className="field"
              />
            </label>
            <label className="block mb-4">
              <span className="label">Тип</span>
              <select name="kind" defaultValue={kind} className="field">
                <option value="expense">Витрата</option>
                <option value="income">Дохід</option>
              </select>
            </label>
            <GlyphPicker />
            <button className="btn-primary mt-5 w-full">Створити</button>
          </ActionForm>
        </Sheet>
      </div>
      {rows.length === 0 ? (
        <Empty icon="categories" text="Категорій поки немає" />
      ) : (
        <>
          <Group items={rows.filter((c) => !c.hidden)} />
          {rows.some((c) => c.hidden) && (
            <section className="mt-6">
              <h2 className="group-label">Приховані</h2>
              <Group items={rows.filter((c) => c.hidden)} />
            </section>
          )}
        </>
      )}
    </>
  );
}
