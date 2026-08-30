import { GoogleGenAI } from "@google/genai";
import * as z from "zod/v4";

/**
 * Gemini приймає підмножину JSON Schema. Прибираємо те, чого він не
 * очікує: службовий $schema і числові межі, які zod додає до цілих
 * чисел автоматично й які тут нічого не означають.
 */
function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;

  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node === null || typeof node !== "object") return node;

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$schema" || key === "minimum" || key === "maximum") continue;
      out[key] = strip(value);
    }
    return out;
  };

  return strip(json) as Record<string, unknown>;
}

/** Один виклик Gemini зі структурованою відповіддю за тією самою zod-схемою. */
export async function runGemini<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  data: string,
  mime: string,
): Promise<{ parsed: z.infer<S>; model: string }> {
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
        parts: [{ inlineData: { mimeType: mime, data } }, { text: user }],
      },
    ],
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiSchema(schema),
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

  // Схема Gemini не така сувора, як structured outputs у Claude,
  // тож перевіряємо результат тим самим zod-контрактом.
  return { parsed: schema.parse(json) as z.infer<S>, model };
}
