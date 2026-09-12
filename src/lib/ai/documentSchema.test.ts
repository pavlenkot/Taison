import { describe, expect, it } from "vitest";
import {
  normalizeDocument,
  metadataSidecar,
  type DocumentExtractionRaw,
} from "./documentSchema";

function raw(overrides: Partial<DocumentExtractionRaw> = {}): DocumentExtractionRaw {
  return {
    doc_type: "tax",
    issuer: "Finanzamt",
    subject: "Рішення про податок за 2025",
    reference_number: "AZ-2025/4471-B",
    document_date: "2026-03-15",
    deadline: "2026-04-15",
    amount_cents: 128400,
    keywords: ["Steuerbescheid", "  податкове рішення  ", "", "Finanzamt"],
    language: "de",
    body_text: "Steuerbescheid für das Jahr 2025. Nachzahlung 1284,00 EUR.",
    summary: "Податкове рішення за 2025 рік із доплатою.",
    ...overrides,
  };
}

describe("нормалізація документа", () => {
  const d = normalizeDocument(raw(), "gemini", "m", {});

  it("виводить слаг адресата для групування в теки", () => {
    expect(d.issuerSlug).toBe("finanzamt");
  });

  it("чистить ключові слова від порожніх і зайвих пробілів", () => {
    expect(d.keywords).toEqual(["Steuerbescheid", "податкове рішення", "Finanzamt"]);
  });

  it("складає ім'я файлу як картку документа", () => {
    // За цим іменем документ знаходиться пошуком у Файлах, не відкриваючись.
    expect(d.fileName).toContain("2026-03-15");
    expect(d.fileName).toContain("Finanzamt");
    expect(d.fileName).toContain("4471");
  });

  it("прибирає з імені файлу скісну риску з номера справи", () => {
    // Інакше «AZ-2025/4471-B» перетворив би ім'я на вкладений шлях.
    expect(d.fileName).not.toContain("/");
  });
});

describe("документ без даних", () => {
  const d = normalizeDocument(
    raw({
      issuer: "",
      subject: "",
      reference_number: "",
      document_date: "",
      deadline: "",
      amount_cents: 0,
      keywords: [],
      body_text: "",
    }),
    "gemini",
    "m",
    {},
  );

  it("порожні поля стають null", () => {
    expect(d.issuer).toBeNull();
    expect(d.referenceNumber).toBeNull();
    expect(d.documentDate).toBeNull();
    expect(d.deadline).toBeNull();
    expect(d.amountCents).toBeNull();
    expect(d.bodyText).toBeNull();
  });

  it("тека без адресата має назву, а не порожній рядок", () => {
    // Порожня назва теки на Диску створила б файл просто в корені.
    expect(d.folderName).toBe("Без адресата");
    expect(d.fileName.length).toBeGreaterThan(0);
  });
});

describe("неправильна дата від моделі", () => {
  it("відкидається, а не підставляється як є", () => {
    const d = normalizeDocument(raw({ document_date: "15.03.2026" }), "g", "m", {});
    expect(d.documentDate).toBeNull();
  });
});

describe("текстовий супутник", () => {
  const text = metadataSidecar(normalizeDocument(raw(), "g", "m", {}));

  it("містить усе, за чим шукатимуть", () => {
    // Пошук iOS і Google Диска читає вміст цього файлу, тож у ньому
    // мають бути і номер справи, і строк, і повний текст.
    expect(text).toContain("Finanzamt");
    expect(text).toContain("AZ-2025/4471-B");
    expect(text).toContain("2026-04-15");
    expect(text).toContain("Steuerbescheid");
    expect(text).toContain("Nachzahlung");
  });

  it("показує суму в звичному вигляді, а не в центах", () => {
    expect(text).toContain("1284.00");
  });
});
