import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatSigned,
  parseAmountToCents,
  centsToInput,
  describeDueDate,
  isoDate,
  validDate,
  plural,
} from "./format";

/** Роздільник тисяч в українській локалі — нерозривний пробіл, не звичайний. */
const flat = (value: string) => value.replace(/\s/g, "");

describe("formatMoney", () => {
  it("друкує символ євро, а не код валюти", () => {
    // Українська локаль за замовчуванням дає «501,10 EUR»: для неї євро
    // чужа валюта. Саме тому у форматувальнику стоїть narrowSymbol.
    expect(formatMoney(50110)).toContain("€");
    expect(formatMoney(50110)).not.toContain("EUR");
  });

  it("ставить кому як десятковий роздільник", () => {
    expect(flat(formatMoney(50110))).toBe("501,10€");
    expect(flat(formatMoney(0))).toBe("0,00€");
    expect(flat(formatMoney(45))).toBe("0,45€");
  });

  it("розділяє тисячі", () => {
    expect(flat(formatMoney(123456789))).toBe("1234567,89€");
  });
});

describe("formatSigned", () => {
  it("позначає витрату мінусом, дохід плюсом", () => {
    expect(formatSigned(1000, "expense").startsWith("−")).toBe(true);
    expect(formatSigned(1000, "income").startsWith("+")).toBe(true);
  });
});

describe("parseAmountToCents", () => {
  it("приймає і кому, і крапку", () => {
    expect(parseAmountToCents("12,34")).toBe(1234);
    expect(parseAmountToCents("12.34")).toBe(1234);
  });

  it("не спотикається на пробілах", () => {
    expect(parseAmountToCents(" 1 234,50 ")).toBe(123450);
  });

  it("округлює до цента без похибки подвійної точності", () => {
    // 0.1 + 0.2 у плавучій арифметиці дає 0.30000000000000004;
    // множення на 100 без округлення дало б 30.000000000000004 центів.
    expect(parseAmountToCents("0,30")).toBe(30);
    expect(parseAmountToCents("19,99")).toBe(1999);
  });

  it("порожній рядок і сміття дають null", () => {
    expect(parseAmountToCents("")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });
});

describe("centsToInput", () => {
  it("повертає рядок для поля вводу", () => {
    expect(centsToInput(1234)).toBe("12.34");
    expect(centsToInput(5)).toBe("0.05");
  });
});

describe("validDate", () => {
  it("пропускає лише формат YYYY-MM-DD", () => {
    expect(validDate("2026-09-12")).toBe("2026-09-12");
    expect(validDate("12.09.2026")).toBeNull();
    expect(validDate("abc")).toBeNull();
    expect(validDate(null)).toBeNull();
    expect(validDate("")).toBeNull();
  });

  it("відкидає неіснуючі дати", () => {
    // Інакше такий рядок пішов би у порівняння з колонкою date,
    // і база відповіла б помилкою замість порожнього результату.
    expect(validDate("2026-02-30")).toBeNull();
    expect(validDate("2026-13-01")).toBeNull();
  });
});

describe("describeDueDate", () => {
  const shift = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return isoDate(d);
  };

  it("називає сьогодні, завтра і прострочення", () => {
    expect(describeDueDate(shift(0)).label).toBe("Сьогодні");
    expect(describeDueDate(shift(1)).label).toBe("Завтра");
    expect(describeDueDate(shift(-3)).label).toContain("Прострочено");
  });

  it("сьогоднішній строк уже терміновий, а не спокійний", () => {
    expect(describeDueDate(shift(0)).tone).toBe("late");
    expect(describeDueDate(shift(-1)).tone).toBe("late");
    expect(describeDueDate(shift(3)).tone).toBe("soon");
    expect(describeDueDate(shift(30)).tone).toBe("ok");
  });
});

describe("isoDate", () => {
  it("бере локальну дату, а не UTC", () => {
    // toISOString() на захід від Гринвіча віддав би попередній день.
    const d = new Date(2026, 8, 12, 23, 30);
    expect(isoDate(d)).toBe("2026-09-12");
  });

  it("доповнює нулями", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("plural", () => {
  it("обирає форму за українськими правилами", () => {
    const word = (n: number) => plural(n, "день", "дні", "днів");
    expect(word(1)).toBe("день");
    expect(word(2)).toBe("дні");
    expect(word(4)).toBe("дні");
    expect(word(5)).toBe("днів");
    expect(word(20)).toBe("днів");
    expect(word(21)).toBe("день");
    expect(word(22)).toBe("дні");
    expect(word(0)).toBe("днів");
  });

  it("11–14 беруть форму «багато», попри закінчення", () => {
    // Найчастіша помилка: 11 дає «день», бо закінчується на 1.
    const word = (n: number) => plural(n, "день", "дні", "днів");
    expect(word(11)).toBe("днів");
    expect(word(12)).toBe("днів");
    expect(word(13)).toBe("днів");
    expect(word(14)).toBe("днів");
    expect(word(111)).toBe("днів");
  });
});
