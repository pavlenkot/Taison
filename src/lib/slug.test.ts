import { describe, expect, it } from "vitest";
import { slugify, safeFileName } from "./slug";

describe("slugify", () => {
  it("різні написання однієї установи дають однаковий слаг", () => {
    // На цьому тримається злиття тек адресатів: «Finanzamt» і «FINANZAMT»
    // мають бути однією текою, а не двома рядками з одним слагом.
    expect(slugify("Finanzamt")).toBe(slugify("FINANZAMT"));
    expect(slugify("Finanzamt")).toBe("finanzamt");
  });

  it("транслітерує кирилицю", () => {
    expect(slugify("Продукти")).toBe("produkty");
    expect(slugify("Житло")).toBe("zhytlo");
  });

  it("розкладає німецькі умляути", () => {
    expect(slugify("Bäckerei Müller")).toBe("baeckerei_mueller");
    expect(slugify("Straße")).toBe("strasse");
  });

  it("ніколи не повертає слаг, що починається з підкреслення", () => {
    // Тека «без адресата» позначена сентинелом '_none'. Якби slugify міг
    // видати щось із підкреслення на початку, справжній адресат зіткнувся б
    // із сентинелом і документи перемішалися б.
    for (const input of ["   Finanzamt", "!!!Jobcenter", "___AOK", "- - -", "@@@"]) {
      expect(slugify(input).startsWith("_")).toBe(false);
    }
  });

  it("порожній результат замінює запасним іменем із префіксом", () => {
    const slug = slugify("!!!", "issuer");
    expect(slug.startsWith("issuer_")).toBe(true);
  });
});

describe("safeFileName", () => {
  it("прибирає символи, недопустимі у шляху", () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).not.toMatch(/[/\\:*?"<>|]/);
  });

  it("стискає пробіли й переноси рядків", () => {
    expect(safeFileName("Finanzamt\n  Steuer\tbescheid")).toBe("Finanzamt Steuer bescheid");
  });

  it("обрізає до заданої довжини", () => {
    expect(safeFileName("x".repeat(200), 20).length).toBe(20);
  });
});
