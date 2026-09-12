import * as z from "zod/v4";

/**
 * Слаги категорій мають збігатися з seed_default_categories у supabase/schema.sql.
 * Модель зобов'язана обрати рівно один зі списку.
 */
export const CATEGORY_SLUGS = [
  "groceries",
  "dining",
  "auto",
  "transport",
  "electronics",
  "housing",
  "health",
  "clothing",
  "fun",
  "subs",
  "travel",
  "education",
  "gifts",
  "other",
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

/**
 * Порожній рядок замість null і 0 замість «невідомо» — свідомий вибір:
 * обидва рушії стабільніше віддають такі схеми, ніж nullable-типи.
 * Нормалізація в справжні null відбувається у normalizeExtraction().
 */
export const ReceiptExtractionSchema = z.object({
  document_kind: z.enum(["receipt", "document"]),
  merchant: z.string(),
  purchased_on: z.string(),
  total_cents: z.number().int(),
  currency: z.string(),
  category_slug: z.enum(CATEGORY_SLUGS),
  confidence: z.enum(["high", "medium", "low"]),
  summary: z.string(),
  line_items: z.array(z.object({ name: z.string(), total_cents: z.number().int() })),
});

export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

/** Результат після нормалізації — те, що бачить решта застосунку. */
export interface Extraction {
  documentKind: "receipt" | "document";
  merchant: string | null;
  purchasedOn: string | null;
  totalCents: number | null;
  currency: string;
  categorySlug: CategorySlug;
  confidence: "high" | "medium" | "low";
  summary: string;
  lineItems: { name: string; totalCents: number }[];
  provider: string;
  model: string;
  raw: unknown;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeExtraction(
  parsed: ReceiptExtraction,
  provider: string,
  model: string,
  raw: unknown,
): Extraction {
  const merchant = parsed.merchant.trim();
  const date = parsed.purchased_on.trim();

  return {
    documentKind: parsed.document_kind,
    merchant: merchant.length > 0 ? merchant : null,
    purchasedOn: ISO_DATE.test(date) ? date : null,
    totalCents: parsed.total_cents > 0 ? parsed.total_cents : null,
    currency: parsed.currency.trim().toUpperCase() || "EUR",
    categorySlug: parsed.category_slug,
    confidence: parsed.confidence,
    summary: parsed.summary.trim(),
    lineItems: parsed.line_items
      .filter((i) => i.name.trim().length > 0)
      .map((i) => ({ name: i.name.trim(), totalCents: i.total_cents })),
    provider,
    model,
    raw,
  };
}
