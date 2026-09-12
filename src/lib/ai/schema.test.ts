import { describe, expect, it } from "vitest";
import { normalizeExtraction, type ReceiptExtraction } from "./schema";

function raw(overrides: Partial<ReceiptExtraction> = {}): ReceiptExtraction {
  return {
    document_kind: "receipt",
    merchant: "REWE",
    purchased_on: "2026-07-05",
    total_cents: 2347,
    currency: "eur",
    category_slug: "groceries",
    confidence: "high",
    summary: "",
    line_items: [{ name: "Молоко", total_cents: 129 }],
    ...overrides,
  };
}

describe("нормалізація чека", () => {
  it("порожні рядки моделі стають null, а не порожнім значенням", () => {
    // Схема навмисно без nullable-типів: обидва рушії стабільніше
    // віддають порожній рядок, ніж null. Перетворення — тут.
    const e = normalizeExtraction(
      raw({ merchant: "  ", purchased_on: "", total_cents: 0 }),
      "gemini",
      "m",
      {},
    );
    expect(e.merchant).toBeNull();
    expect(e.purchasedOn).toBeNull();
    expect(e.totalCents).toBeNull();
  });

  it("дату приймає лише у форматі ISO", () => {
    expect(normalizeExtraction(raw({ purchased_on: "05.07.2026" }), "g", "m", {}).purchasedOn)
      .toBeNull();
    expect(normalizeExtraction(raw(), "g", "m", {}).purchasedOn).toBe("2026-07-05");
  });

  it("валюту зводить до верхнього регістру, а порожню вважає євро", () => {
    expect(normalizeExtraction(raw({ currency: "eur" }), "g", "m", {}).currency).toBe("EUR");
    expect(normalizeExtraction(raw({ currency: "" }), "g", "m", {}).currency).toBe("EUR");
  });

  it("від'ємну або нульову суму не пропускає", () => {
    expect(normalizeExtraction(raw({ total_cents: 0 }), "g", "m", {}).totalCents).toBeNull();
    expect(normalizeExtraction(raw({ total_cents: -100 }), "g", "m", {}).totalCents).toBeNull();
  });

  it("відкидає позиції без назви", () => {
    const e = normalizeExtraction(
      raw({ line_items: [{ name: "Хліб", total_cents: 199 }, { name: "  ", total_cents: 50 }] }),
      "g",
      "m",
      {},
    );
    expect(e.lineItems).toHaveLength(1);
    expect(e.lineItems[0].name).toBe("Хліб");
  });
});
