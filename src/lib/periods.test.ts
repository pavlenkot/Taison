import { describe, expect, it } from "vitest";
import { resolvePeriod } from "./periods";

// Субота. Важливо саме не понеділок і не неділя: помилка на межі тижня
// інакше не виявиться.
const SATURDAY = new Date(2026, 8, 12, 12, 0);

describe("тиждень", () => {
  it("починається в понеділок і закінчується в неділю", () => {
    const p = resolvePeriod("week", 0, SATURDAY);
    expect(p.from).toBe("2026-09-07");
    expect(p.to).toBe("2026-09-13");
  });

  it("попередній тиждень зсувається рівно на сім днів", () => {
    const p = resolvePeriod("week", -1, SATURDAY);
    expect(p.from).toBe("2026-08-31");
    expect(p.to).toBe("2026-09-06");
  });

  it("групується по днях", () => {
    expect(resolvePeriod("week", 0, SATURDAY).bucket).toBe("day");
  });
});

describe("місяць", () => {
  it("бере календарні межі", () => {
    const p = resolvePeriod("month", 0, SATURDAY);
    expect(p.from).toBe("2026-09-01");
    expect(p.to).toBe("2026-09-30");
  });

  it("попередній місяць знає, що в серпні 31 день", () => {
    const p = resolvePeriod("month", -1, SATURDAY);
    expect(p.from).toBe("2026-08-01");
    expect(p.to).toBe("2026-08-31");
  });

  it("переходить через межу року", () => {
    const p = resolvePeriod("month", -9, SATURDAY);
    expect(p.from).toBe("2025-12-01");
    expect(p.to).toBe("2025-12-31");
  });

  it("лютий високосного року має 29 днів", () => {
    const p = resolvePeriod("month", 0, new Date(2028, 1, 10, 12, 0));
    expect(p.to).toBe("2028-02-29");
  });
});

describe("рік", () => {
  it("бере календарний рік і групується по місяцях", () => {
    const p = resolvePeriod("year", 0, SATURDAY);
    expect(p.from).toBe("2026-01-01");
    expect(p.to).toBe("2026-12-31");
    expect(p.bucket).toBe("month");
  });
});

describe("підписи", () => {
  it("нульовий і мінус перший періоди називаються словами", () => {
    expect(resolvePeriod("week", 0, SATURDAY).label).toBe("Цей тиждень");
    expect(resolvePeriod("week", -1, SATURDAY).label).toBe("Минулий тиждень");
    expect(resolvePeriod("month", 0, SATURDAY).label).toBe("Цей місяць");
    expect(resolvePeriod("month", -1, SATURDAY).label).toBe("Минулий місяць");
    expect(resolvePeriod("year", 0, SATURDAY).label).toBe("Цей рік");
    expect(resolvePeriod("year", -1, SATURDAY).label).toBe("2025");
  });
});
