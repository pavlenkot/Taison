import { describe, expect, it } from "vitest";
import { buildMediaPart, parseJson } from "./openrouter";

describe("buildMediaPart", () => {
  it("надсилає PDF типом file, щоб доїхали всі сторінки", () => {
    const part = buildMediaPart("QUJD", "application/pdf");
    expect(part.type).toBe("file");
    if (part.type !== "file") throw new Error("очікували file");
    expect(part.file.file_data).toBe("data:application/pdf;base64,QUJD");
  });

  it("картинку надсилає як data-URL із її власним типом", () => {
    const part = buildMediaPart("QUJD", "image/png");
    expect(part.type).toBe("image_url");
    if (part.type !== "image_url") throw new Error("очікували image_url");
    expect(part.image_url.url).toBe("data:image/png;base64,QUJD");
  });
});

describe("parseJson", () => {
  it("розбирає звичайний JSON", () => {
    expect(parseJson('{"total": 12.5}')).toEqual({ total: 12.5 });
  });

  // Моделі часто обгортають відповідь у ```json — без цього кожен такий чек
  // падав би з «не JSON», хоча дані там правильні.
  it("знімає обгортку ```json, якою модель прикрасила відповідь", () => {
    expect(parseJson('```json\n{"total": 12.5}\n```')).toEqual({ total: 12.5 });
  });

  it("знімає обгортку ``` без назви мови", () => {
    expect(parseJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it("не ковтає зіпсований JSON", () => {
    expect(() => parseJson("{зовсім не json")).toThrow();
  });
});
