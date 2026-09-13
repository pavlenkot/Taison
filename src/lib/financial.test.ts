import { describe, it, expect } from "vitest";
import {
  accountFilter,
  formAccount,
  transactionTotals,
  categorySlices,
  trendPoints,
} from "./financial";
import { categoryColor, categoryGlyph } from "./categoryStyle";
import { calendarDays } from "./calendar";
import { formatSavedAt, savedDateKey } from "./format";
import { buildDigest } from "./digest";
import { resolvePeriod } from "./periods";
import type { Transaction } from "./types";
const row = (extra: Partial<Transaction> = {}): Transaction => ({
  id: "a",
  kind: "expense",
  amount_cents: 10000,
  currency: "EUR",
  category_id: "food",
  merchant: "Shop",
  note: null,
  occurred_on: "2026-09-12",
  source: "manual",
  receipt_id: null,
  needs_review: false,
  created_at: "2026-09-12T08:00:00Z",
  categories: { name: "Їжа", icon: "food", slug: "food" },
  ...extra,
});
describe("Фінансові розділи й підсумки", () => {
  it("залишає давні записи нерозподіленими та відділяє інвестиції від рахунків", () => {
    expect(formAccount("unassigned")).toBeNull();
    expect(formAccount("cash")).toBe("cash");
    expect(() => formAccount("investments")).toThrow();
    expect(() => formAccount(null)).toThrow();
    expect(accountFilter("unassigned")).toBe("unassigned");
  });
  it("не включає непідтверджені чеки та показує доходи окремо", () => {
    const rows = [
      row(),
      row({ id: "b", kind: "income", amount_cents: 50000 }),
      row({ id: "c", needs_review: true, amount_cents: 200000 }),
    ];
    expect(transactionTotals(rows)).toEqual({ expense: 10000, income: 50000 });
    expect(categorySlices(rows, "expense")[0]).toMatchObject({
      cents: 10000,
      entries: 1,
    });
    const digest = buildDigest(
      rows,
      [],
      resolvePeriod("month", 0, new Date(2026, 8, 13)),
    );
    expect(digest).toMatchObject({
      totalCents: 10000,
      incomeCents: 50000,
      differenceCents: 40000,
      entryCount: 2,
    });
  });
  it("розрізняє категорії з однаковими назвами й будує стовпчики всього розділу", () => {
    const rows = [
      row(),
      row({ id: "b", category_id: "other", amount_cents: 5000 }),
    ];
    expect(categorySlices(rows, "expense")).toHaveLength(2);
    const points = trendPoints(rows, "expense", "2026-09-11", "2026-09-13");
    expect(points.map((p) => p.cents)).toEqual([0, 15000, 0]);
    expect(
      trendPoints(rows, "income", "2026-09-11", "2026-09-13").every(
        (p) => p.cents === 0,
      ),
    ).toBe(true);
  });
  it("не губить порожні місяці року", () => {
    const points = trendPoints(
      [row()],
      "expense",
      "2026-01-01",
      "2026-12-31",
      true,
    );
    expect(points).toHaveLength(12);
    expect(points[8].cents).toBe(10000);
    expect(points.reduce((s, p) => s + p.cents, 0)).toBe(10000);
  });
});
describe("Календар, кольори й час", () => {
  it("розміщує вересень2026 та високосний лютий за справжніми датами", () => {
    expect(calendarDays(2026, 8).slice(0, 7)).toEqual([null, 1, 2, 3, 4, 5, 6]);
    expect(calendarDays(2026, 8).slice(-7)).toEqual([
      28,
      29,
      30,
      null,
      null,
      null,
      null,
    ]);
    expect(calendarDays(2024, 1).filter(Boolean)).toHaveLength(29);
  });
  it("дає стабільний колір за ідентичністю й підтримує старі іконки", () => {
    expect(categoryColor({ id: "a", slug: "groceries" })).toBe("#FF944D");
    expect(categoryColor({ id: "a", slug: "custom" })).toBe(
      categoryColor({ id: "renamed", slug: "custom" }),
    );
    expect(categoryGlyph("🛒")).toBe("food");
    expect(categoryGlyph("unknown")).toBe("other");
  });
  it("узгоджує дату групи й час біля півночі та під час зимового часу", () => {
    expect(savedDateKey("2026-09-12T22:15:00Z")).toBe("13.09.2026");
    expect(formatSavedAt("2026-09-12T22:15:00Z")).toBe("13.09.2026 · 00:15");
    expect(formatSavedAt("2026-12-12T23:15:00Z")).toBe("13.12.2026 · 00:15");
  });
});
