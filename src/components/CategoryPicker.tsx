"use client";
import { useState } from "react";
import type { Category, Kind } from "@/lib/types";
import { CATEGORY_GLYPHS, categoryGlyph } from "@/lib/categoryStyle";
import { Sheet } from "./Sheet";
import { Icon, CategoryIcon } from "./Icon";
export function CategoryField({
  categories,
  kind,
  initial = "",
  name = "category_id",
}: {
  categories: Category[];
  kind?: Kind;
  initial?: string | null;
  name?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const selected = categories.find(
    (c) => c.id === value && (!kind || c.kind === kind),
  );
  const options = categories.filter(
    (c) => (!kind || c.kind === kind) && (!c.hidden || c.id === value),
  );
  return (
    <div>
      <span className="label">Категорія</span>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <Sheet
        title="Категорія"
        className="btn-ghost w-full justify-start"
        trigger={
          <>
            {selected && <CategoryIcon category={selected} size={20} />}
            <span className="flex-1 text-left">
              {selected?.name ??
                (name === "category" ? "Усі категорії" : "Без категорії")}
            </span>
            <Icon name="chevron" size={18} />
          </>
        }
      >
        <div className="space-y-2">
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={(e) => {
              setValue("");
              e.currentTarget.closest("dialog")?.close();
            }}
          >
            {name === "category" ? "Усі категорії" : "Без категорії"}
          </button>
          {options.map((c) => (
            <button
              key={c.id}
              type="button"
              className="transaction-row w-full text-left"
              aria-pressed={value === c.id}
              onClick={(e) => {
                setValue(c.id);
                e.currentTarget.closest("dialog")?.close();
              }}
            >
              <CategoryIcon category={c} />
              <span className="flex-1">{c.name}</span>
              {value === c.id && <Icon name="check" className="text-accent" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
const LABELS: Record<string, string> = {
  food: "Їжа",
  shopping: "Покупки",
  transport: "Транспорт",
  home: "Дім",
  health: "Здоров’я",
  cash: "Гроші",
  gift: "Подарунки",
  work: "Робота",
  travel: "Подорожі",
  education: "Навчання",
  subscriptions: "Підписки",
  other: "Інше",
};
export function GlyphPicker({ initial }: { initial?: string | null }) {
  const [value, setValue] = useState(categoryGlyph(initial));
  return (
    <div>
      <span className="label">Іконка</span>
      <div className="category-picker">
        {CATEGORY_GLYPHS.map((g) => (
          <label key={g}>
            <input
              type="radio"
              name="icon"
              value={g}
              checked={value === g}
              onChange={() => setValue(g)}
            />
            <Icon name={g} />
            <span className="text-[10px] text-muted">{LABELS[g]}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted mt-3">
        Колір призначається автоматично.
      </p>
    </div>
  );
}
