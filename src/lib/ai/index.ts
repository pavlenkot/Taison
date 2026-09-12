import { runClaude } from "./claude";
import { runGemini } from "./gemini";
import { runOpenRouter } from "./openrouter";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompt";
import { DOCUMENT_SYSTEM_PROMPT, DOCUMENT_USER_PROMPT } from "./documentPrompt";
import { ReceiptExtractionSchema, normalizeExtraction, type Extraction } from "./schema";
import {
  DocumentExtractionSchema,
  normalizeDocument,
  type DocumentExtraction,
} from "./documentSchema";
import type * as z from "zod/v4";

export type AiProvider = "claude" | "gemini" | "openrouter";

export function activeProvider(): AiProvider {
  const name = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (name === "claude") return "claude";
  if (name === "openrouter") return "openrouter";
  return "gemini";
}

/** Чи є ключ для обраного рушія. Дозволяє показати зрозумілу помилку до виклику. */
export function aiConfigured(): boolean {
  switch (activeProvider()) {
    case "claude":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    // Модель тут так само обов'язкова: без неї OpenRouter не знає, кого питати.
    case "openrouter":
      return Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL);
    default:
      return Boolean(process.env.GEMINI_API_KEY);
  }
}

/**
 * Єдина точка, де вирішується, який рушій працює.
 * Схема й підказка описані один раз і йдуть в обидва.
 */
async function run<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  base64: string,
  mime: string,
  maxTokens?: number,
): Promise<{ parsed: z.infer<S>; model: string; provider: AiProvider }> {
  const provider = activeProvider();
  const engine =
    provider === "claude" ? runClaude : provider === "openrouter" ? runOpenRouter : runGemini;
  const result = await engine(schema, system, user, base64, mime, maxTokens);

  return { ...result, provider };
}

export async function extractReceipt(base64: string, mime: string): Promise<Extraction> {
  const { parsed, model, provider } = await run(
    ReceiptExtractionSchema,
    SYSTEM_PROMPT,
    USER_PROMPT,
    base64,
    mime,
  );
  return normalizeExtraction(parsed, provider, model, parsed);
}

export async function extractDocument(
  base64: string,
  mime: string,
): Promise<DocumentExtraction> {
  // Повний текст документа — довга відповідь, тож стеля вища, ніж для чека.
  const { parsed, model, provider } = await run(
    DocumentExtractionSchema,
    DOCUMENT_SYSTEM_PROMPT,
    DOCUMENT_USER_PROMPT,
    base64,
    mime,
    16000,
  );
  return normalizeDocument(parsed, provider, model, parsed);
}

export type { Extraction, DocumentExtraction };
