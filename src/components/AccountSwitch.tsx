"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ACCOUNTS,
  type FinancialSection,
  type AccountFilter,
} from "@/lib/financial";
export function AccountSwitch({
  value,
  base,
  params = {},
  investments = false,
  unassigned = false,
}: {
  value: FinancialSection | AccountFilter;
  base: string;
  params?: Record<string, string>;
  investments?: boolean;
  unassigned?: boolean;
}) {
  const options: { key: string; label: string; accent: string }[] =
    ACCOUNTS.filter((a) => investments || a.key !== "investments");
  if (unassigned)
    options.push({
      key: "unassigned",
      label: "Без розділу",
      accent: "#ADADAD",
    });
  return (
    <nav className="account-switch" aria-label="Фінансовий розділ">
      {options.map((a) => (
        <Link
          key={a.key}
          href={base + "?" + new URLSearchParams({ ...params, account: a.key })}
          aria-current={a.key === value ? "true" : undefined}
          style={{ "--section-accent": a.accent } as CSSProperties}
          onClick={(e) => {
            e.currentTarget.closest("dialog")?.close();
            if (a.key !== "unassigned")
              document.cookie =
                "financial-section=" +
                a.key +
                ";path=/;max-age=31536000;SameSite=Lax";
          }}
        >
          {a.label}
        </Link>
      ))}
    </nav>
  );
}
export function AccountField({
  value = "online",
  allowUnassigned = false,
}: {
  value?: string | null;
  allowUnassigned?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">Фінансовий розділ</span>
      <select
        name="financial_account"
        defaultValue={value ?? "unassigned"}
        required
        className="field"
      >
        {allowUnassigned && <option value="unassigned">Без розділу</option>}
        {ACCOUNTS.filter((a) => a.key !== "investments").map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
      </select>
    </label>
  );
}
