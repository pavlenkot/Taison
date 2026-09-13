"use client";
import { useState } from "react";
import type { Category } from "@/lib/types";
import { isoDate } from "@/lib/format";
import { AccountField } from "./AccountSwitch";
import { DateField } from "./Calendar";
import { CategoryField } from "./CategoryPicker";
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
    financial_account?: string | null;
  };
}) {
  const [kind, setKind] = useState(defaults?.kind ?? "expense");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 flex gap-3">
        {(["expense", "income"] as const).map((k) => (
          <label
            key={k}
            className={
              "chip flex-1 " + (kind === k ? "border-accent" : "text-muted")
            }
          >
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              className="sr-only"
            />
            {k === "expense" ? "Витрата" : "Дохід"}
          </label>
        ))}
      </div>
      <label className="sm:col-span-2">
        <span className="label">Сума, €</span>
        <input
          name="amount"
          required
          inputMode="decimal"
          placeholder="0,00"
          defaultValue={defaults?.amount}
          className="field tabular-nums !text-3xl !py-4"
        />
      </label>
      <AccountField
        value={
          defaults?.financial_account === undefined
            ? "online"
            : defaults.financial_account
        }
        allowUnassigned={defaults?.financial_account === null}
      />
      <CategoryField
        categories={categories}
        kind={kind}
        initial={defaults?.category_id}
      />
      <div>
        <span className="label">Дата</span>
        <DateField
          name="occurred_on"
          defaultValue={defaults?.occurred_on ?? isoDate()}
          required
          label="Дата операції"
        />
      </div>
      <label>
        <span className="label">
          {kind === "expense" ? "Магазин" : "Джерело доходу"}
        </span>
        <input
          name="merchant"
          defaultValue={defaults?.merchant}
          placeholder={
            kind === "expense" ? "Наприклад, ALDI" : "Наприклад, зарплата"
          }
          className="field"
        />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Нотатка</span>
        <input
          name="note"
          defaultValue={defaults?.note}
          placeholder="Необов’язково"
          className="field"
        />
      </label>
    </div>
  );
}
