import { extractWithClaude } from "./claude";
import { extractWithGemini } from "./gemini";
import type { Extraction } from "./schema";

export type AiProvider = "claude" | "gemini";

export function activeProvider(): AiProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "claude" ? "claude" : "gemini";
}

/** Чи є ключ для обраного рушія. Дозволяє показати зрозумілу помилку до виклику. */
export function aiConfigured(): boolean {
  return activeProvider() === "claude"
    ? Boolean(process.env.ANTHROPIC_API_KEY)
    : Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Розбирає чек або документ обраним рушієм.
 * Перемикання — змінна AI_PROVIDER, решта застосунку про рушій не знає.
 */
export async function extractReceipt(base64: string, mime: string): Promise<Extraction> {
  return activeProvider() === "claude"
    ? extractWithClaude(base64, mime)
    : extractWithGemini(base64, mime);
}

export type { Extraction };
