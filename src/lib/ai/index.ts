import { runClaude } from "./claude";
import { runGemini } from "./gemini";
import { SYSTEM_PROMPT, USER_PROMPT } from "./prompt";
import { DOCUMENT_SYSTEM_PROMPT, DOCUMENT_USER_PROMPT } from "./documentPrompt";
import { ReceiptExtractionSchema, normalizeExtraction, type Extraction } from "./schema";
import {
  DocumentExtractionSchema,
  normalizeDocument,
  type DocumentExtraction,
} from "./documentSchema";
import type * as z from "zod/v4";

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
  const result =
    provider === "claude"
      ? await runClaude(schema, system, user, base64, mime, maxTokens)
      : await runGemini(schema, system, user, base64, mime);

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
