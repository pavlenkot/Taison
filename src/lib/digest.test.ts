import { describe, expect, it } from "vitest";
import { buildDigest } from "./digest";
import { resolvePeriod } from "./periods";
import type { Transaction } from "./types";

const JULY = resolvePeriod("month", 0, new Date(2026, 6, 20, 12, 0));

let counter = 0;
function tx(cents: number, day: number, category = "Кафе"): Transaction {
  counter += 1;
  return {
    id: `t${counter}`,
    kind: "expense",
    amount_cents: cents,
    currency: "EUR",
    category_id: "c",
    merchant: category === "Техніка" ? "MediaMarkt" : "X",
    note: null,
    occurred_on: `2026-07-${String(day).padStart(2, "0")}`,
    source: "manual",
    receipt_id: null,
    needs_review: false,
    created_at: "",
    categories: { name: category, icon: "🍽️", slug: "x" },
  };
}

/**
 * Набір підібрано так, щоб числа рахувалися на папері:
 * одна велика покупка, дві середні й сім дрібниць.
 * Разом 50 110 центів, медіана 480, дрібних п'ять на 1 680.
 */
const CURRENT = [
  tx(32000, 3, "Техніка"),
  tx(8900, 5, "Продукти"),
  tx(6400, 9, "Продукти"),
  tx(450, 2),
  tx(320, 4),
  tx(280, 6),
  tx(510, 7),
  tx(390, 11),
  tx(620, 12),
  tx(240, 15),
];
const PREVIOUS = [tx(15000, 3, "Продукти"), tx(9000, 8, "Продукти")];

describe("підсумки за період", () => {
  const d = buildDigest(CURRENT, PREVIOUS, JULY);

  it("рахує суму, попередній період і різницю у відсотках", () => {
    expect(d.totalCents).toBe(50110);
    expect(d.previousCents).toBe(24000);
    expect(d.deltaPct).toBe(109);
  });

  it("медіана ділить операції навпіл", () => {
    // Десять значень: середнє з п'ятого й шостого — (450 + 510) / 2.
    expect(d.smallThresholdCents).toBe(480);
    expect(d.smallCount).toBe(5);
    expect(d.smallTotalCents).toBe(1680);
  });

  it("бере три найбільші покупки", () => {
    expect(d.biggest.map((t) => t.amount_cents)).toEqual([32000, 8900, 6400]);
  });

  it("рахує ритм витрат за унікальними днями", () => {
    expect(d.daysWithSpending).toBe(10);
    expect(d.daysInPeriod).toBe(31);
    expect(d.averagePerDayCents).toBe(1616);
  });

  it("знаходить головну категорію", () => {
    expect(d.topCategory?.name).toBe("Техніка");
    expect(d.topCategory?.cents).toBe(32000);
  });
});

describe("формулювання висновків", () => {
  it("відмінює числівники за кількістю дрібних покупок", () => {
    const headline = (small: number, big: number) => {
      const rows = [
        ...Array.from({ length: small }, (_, i) => tx(300, (i % 28) + 1)),
        ...Array.from({ length: big }, (_, i) => tx(5000, (i % 28) + 1)),
      ];
      return buildDigest(rows, [], JULY).insights.find((i) => i.id === "small-sum")?.headline ?? "";
    };

    expect(headline(3, 3)).toContain("3 дрібні покупки склали");
    expect(headline(4, 4)).toContain("4 дрібні покупки склали");
    expect(headline(12, 12)).toContain("12 дрібних покупок склали");
    expect(headline(21, 21)).toContain("21 дрібна покупка склала");
  });

  it("попереджає, коли дрібниці переважили найдорожчу покупку", () => {
    const many = Array.from({ length: 20 }, (_, i) => tx(400, (i % 28) + 1));
    const one = [tx(3000, 5)];
    const insight = buildDigest([...many, ...one], [], JULY).insights.find(
      (i) => i.id === "small-sum",
    );

    expect(insight?.tone).toBe("warn");
    expect(insight?.detail).toContain("більше за найдорожчу окрему покупку");
  });

  it("зростання витрат позначає тривогою, спад — добром", () => {
    const grew = buildDigest([tx(20000, 5)], [tx(10000, 5)], JULY);
    const fell = buildDigest([tx(5000, 5)], [tx(10000, 5)], JULY);
    expect(grew.insights.find((i) => i.id === "total")?.tone).toBe("warn");
    expect(fell.insights.find((i) => i.id === "total")?.tone).toBe("good");
  });
});

describe("межові випадки", () => {
  it("порожній період не падає і не вигадує різницю", () => {
    const d = buildDigest([], [], JULY);
    expect(d.totalCents).toBe(0);
    expect(d.deltaPct).toBeNull();
    expect(d.biggest).toEqual([]);
  });

  it("без попереднього періоду каже, що порівнювати нема з чим", () => {
    const d = buildDigest([tx(1000, 5)], [], JULY);
    expect(d.deltaPct).toBeNull();
    expect(d.insights[0].detail).toContain("1 операція");
  });

  it("на двох-трьох операціях не говорить про непомітні дрібниці", () => {
    // Висновок «половина ваших покупок дешевша за X» на трьох рядках
    // звучав би безглуздо.
    const d = buildDigest([tx(100, 1), tx(200, 2), tx(300, 3)], [], JULY);
    expect(d.insights.find((i) => i.id === "small-sum")).toBeUndefined();
  });

  it("доходи не потрапляють у витрати", () => {
    const income: Transaction = { ...tx(99999, 5), kind: "income" };
    const d = buildDigest([tx(1000, 5), income], [], JULY);
    expect(d.totalCents).toBe(1000);
  });
});
