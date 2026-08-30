import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompt";
import {
  RECEIPT_JSON_SCHEMA,
  ReceiptExtractionSchema,
  normalizeExtraction,
  type Extraction,
} from "./schema";

export async function extractWithGemini(data: string, mime: string): Promise<Extraction> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY не налаштовано");
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: mime, data } }, { text: USER_PROMPT }],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: RECEIPT_JSON_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini повернув порожню відповідь");
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Gemini повернув невалідний JSON");
  }

  // Схема Gemini не гарантує типи так само жорстко, як structured outputs
  // у Claude, тож перевіряємо результат тим самим zod-контрактом.
  const parsed = ReceiptExtractionSchema.parse(json);
  return normalizeExtraction(parsed, "gemini", model, json);
}
