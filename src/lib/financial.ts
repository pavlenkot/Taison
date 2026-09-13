import type { Transaction, Kind } from "./types";

export const ACCOUNTS = [
  {
    key: "online",
    label: "Онлайн",
    accent: "#7D8FFF",
    glow: "#102B5B",
    base: "#0C1A2C",
  },
  {
    key: "cash",
    label: "Готівка",
    accent: "#81D8D0",
    glow: "#0B4E50",
    base: "#0B3033",
  },
  {
    key: "gewerbe",
    label: "Gewerbe",
    accent: "#FF944D",
    glow: "#6B321D",
    base: "#301B17",
  },
  {
    key: "investments",
    label: "Інвестиції",
    accent: "#69DAB0",
    glow: "#0E4D3B",
    base: "#102B27",
  },
] as const;
export type FinancialSection = (typeof ACCOUNTS)[number]["key"];
export type FinancialAccount = Exclude<FinancialSection, "investments">;
export type AccountFilter = FinancialAccount | "unassigned";
export function financialSection(value?: string | null): FinancialSection {
  return ACCOUNTS.some((a) => a.key === value)
    ? (value as FinancialSection)
    : "online";
}
export function accountFilter(value?: string | null): AccountFilter {
  return value === "cash" || value === "gewerbe" || value === "unassigned"
    ? value
    : "online";
}
export function accountLabel(value?: string | null): string {
  return ACCOUNTS.find((a) => a.key === value)?.label ?? "Без розділу";
}
export function formAccount(
  value: FormDataEntryValue | null,
): FinancialAccount | null {
  if (value === "unassigned") return null;
  if (value === "online" || value === "cash" || value === "gewerbe")
    return value;
  throw new Error("Оберіть фінансовий розділ");
}
export function transactionTotals(rows: Transaction[]) {
  return rows
    .filter((r) => !r.needs_review)
    .reduce(
      (v, r) => {
        v[r.kind] += Number(r.amount_cents);
        return v;
      },
      { expense: 0, income: 0 },
    );
}
export function categorySlices(rows: Transaction[], kind: Kind) {
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      slug: string;
      icon: string | null;
      cents: number;
      entries: number;
    }
  >();
  for (const row of rows) {
    if (row.needs_review || row.kind !== kind) continue;
    const id = row.category_id ?? "uncategorized";
    const group = groups.get(id) ?? {
      id,
      name: row.categories?.name ?? "Без категорії",
      slug: row.categories?.slug ?? id,
      icon: row.categories?.icon ?? null,
      cents: 0,
      entries: 0,
    };
    group.cents += Number(row.amount_cents);
    group.entries++;
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => b.cents - a.cents);
}
export function buildBuckets(
  from: string,
  to: string,
  monthly = false,
): string[] {
  const dates: string[] = [];
  const cursor = new Date(from + "T12:00:00Z"),
    end = new Date(to + "T12:00:00Z");
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
export function trendPoints(
  rows: Transaction[],
  kind: Kind,
  from: string,
  to: string,
  monthly = false,
) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.needs_review || row.kind !== kind) continue;
    const bucket = monthly
      ? row.occurred_on.slice(0, 7) + "-01"
      : row.occurred_on;
    totals.set(bucket, (totals.get(bucket) ?? 0) + Number(row.amount_cents));
  }
  return buildBuckets(from, to, monthly).map((date) => ({
    date,
    cents: totals.get(date) ?? 0,
  }));
}
