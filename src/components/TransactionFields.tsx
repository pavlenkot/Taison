import type { Category } from "@/lib/types";
import { isoDate } from "@/lib/format";

/**
 * Поля операції. Використовуються і для створення, і для редагування —
 * різниця лише в defaults, які передає сторінка.
 */
export function TransactionFields({
  categories,
  defaults,
}: {
  categories: Category[];
  defaults?: {
    kind?: "expense" | "income";
    amount?: string;
    merchant?: string;
    note?: string;
    occurred_on?: string;
    category_id?: string | null;
  };
}) {
  const kind = defaults?.kind ?? "expense";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="kind">
          Тип
        </label>
        <select id="kind" name="kind" defaultValue={kind} className="field">
          <option value="expense">Витрата</option>
          <option value="income">Дохід</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="amount">
          Сума, €
        </label>
        <input
          id="amount"
          name="amount"
          required
          inputMode="decimal"
          placeholder="0,00"
          defaultValue={defaults?.amount}
          className="field tabular-nums"
        />
      </div>

      <div>
        <label className="label" htmlFor="category_id">
          Категорія
        </label>
        <select
          id="category_id"
          name="category_id"
          defaultValue={defaults?.category_id ?? ""}
          className="field"
        >
          <option value="">Без категорії</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name} {c.kind === "income" ? "(дохід)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="occurred_on">
          Дата
        </label>
        <input
          id="occurred_on"
          name="occurred_on"
          type="date"
          defaultValue={defaults?.occurred_on ?? isoDate()}
          className="field"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="merchant">
          Магазин або джерело
        </label>
        <input
          id="merchant"
          name="merchant"
          placeholder="Наприклад, ALDI"
          defaultValue={defaults?.merchant}
          className="field"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="label" htmlFor="note">
          Нотатка
        </label>
        <input
          id="note"
          name="note"
          placeholder="Необов'язково"
          defaultValue={defaults?.note}
          className="field"
        />
      </div>
    </div>
  );
}
