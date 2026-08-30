import * as z from "zod/v4";
import { slugify, safeFileName } from "../slug";

export const DOC_TYPES = [
  "government",
  "tax",
  "insurance",
  "employment",
  "housing",
  "banking",
  "medical",
  "education",
  "vehicle",
  "contract",
  "warranty",
  "personal",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, { title: string; icon: string }> = {
  government: { title: "Держустанови", icon: "🏛️" },
  tax: { title: "Податки", icon: "🧾" },
  insurance: { title: "Страхування", icon: "🛡️" },
  employment: { title: "Робота", icon: "💼" },
  housing: { title: "Житло", icon: "🏠" },
  banking: { title: "Банк і фінанси", icon: "🏦" },
  medical: { title: "Медицина", icon: "⚕️" },
  education: { title: "Освіта", icon: "🎓" },
  vehicle: { title: "Авто", icon: "🚗" },
  contract: { title: "Договори", icon: "📝" },
  warranty: { title: "Гарантії", icon: "🔧" },
  personal: { title: "Особисті", icon: "🪪" },
  other: { title: "Інше", icon: "📄" },
};

/**
 * Порожній рядок замість null і 0 замість «невідомо» — обидва рушії
 * стабільніше віддають такі схеми. Нормалізація нижче.
 */
export const DocumentExtractionSchema = z.object({
  doc_type: z.enum(DOC_TYPES),
  issuer: z.string(),
  subject: z.string(),
  reference_number: z.string(),
  document_date: z.string(),
  deadline: z.string(),
  amount_cents: z.number().int(),
  keywords: z.array(z.string()),
  language: z.string(),
  body_text: z.string(),
  summary: z.string(),
});

export type DocumentExtractionRaw = z.infer<typeof DocumentExtractionSchema>;

export interface DocumentExtraction {
  docType: DocType;
  issuer: string | null;
  issuerSlug: string | null;
  subject: string | null;
  referenceNumber: string | null;
  documentDate: string | null;
  deadline: string | null;
  amountCents: number | null;
  keywords: string[];
  language: string | null;
  bodyText: string | null;
  summary: string;
  /** Тека в iCloud Drive: людська назва адресата. */
  folderName: string;
  /** Ім'я файлу, за яким документ знайдеться просто у Файлах. */
  fileName: string;
  provider: string;
  model: string;
  raw: unknown;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function date(value: string): string | null {
  const trimmed = value.trim();
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

export function normalizeDocument(
  parsed: DocumentExtractionRaw,
  provider: string,
  model: string,
  raw: unknown,
): DocumentExtraction {
  const issuer = clean(parsed.issuer);
  const subject = clean(parsed.subject);
  const reference = clean(parsed.reference_number);
  const documentDate = date(parsed.document_date);

  const folderName = issuer ? safeFileName(issuer, 40) : "Без адресата";

  // Ім'я файлу читається як картка документа: дата, від кого, про що, номер.
  // Саме за ним документ знаходиться пошуком у Файлах без відкривання.
  const fileName = safeFileName(
    [documentDate ?? "", issuer ?? "", subject ?? "", reference ?? ""]
      .filter((part) => part.length > 0)
      .join(" · "),
    110,
  ) || "Документ";

  return {
    docType: parsed.doc_type,
    issuer,
    issuerSlug: issuer ? slugify(issuer, "issuer") : null,
    subject,
    referenceNumber: reference,
    documentDate,
    deadline: date(parsed.deadline),
    amountCents: parsed.amount_cents > 0 ? parsed.amount_cents : null,
    keywords: parsed.keywords
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .slice(0, 25),
    language: clean(parsed.language),
    bodyText: clean(parsed.body_text),
    summary: parsed.summary.trim(),
    folderName,
    fileName,
    provider,
    model,
    raw,
  };
}

/** Мінімум полів для супутника: підходить і свіжому розбору, і рядку з бази. */
export interface SidecarFields {
  docType: DocType;
  issuer: string | null;
  subject: string | null;
  documentDate: string | null;
  referenceNumber: string | null;
  deadline: string | null;
  amountCents: number | null;
  keywords: string[];
  bodyText: string | null;
  /** Є лише одразу після розбору — у базі стислий зміст не зберігається. */
  summary?: string;
}

/**
 * Текстовий супутник до PDF. Швидка команда кладе його поруч у ту саму
 * теку, і тоді пошук iOS та Spotlight знаходить документ за будь-яким
 * словом із нього, не відкриваючи сам PDF. Той самий текст віддає
 * /api/documents/[id]/metadata, тож формат описаний тут один раз.
 */
export function metadataSidecar(doc: SidecarFields): string {
  const label = DOC_TYPE_LABELS[doc.docType] ?? DOC_TYPE_LABELS.other;

  const lines = [
    `Документ: ${doc.subject ?? "без назви"}`,
    `Від кого: ${doc.issuer ?? "не визначено"}`,
    `Категорія: ${label.title}`,
    `Дата документа: ${doc.documentDate ?? "не визначено"}`,
  ];

  if (doc.referenceNumber) lines.push(`Номер справи: ${doc.referenceNumber}`);
  if (doc.deadline) lines.push(`Строк: ${doc.deadline}`);
  if (doc.amountCents) lines.push(`Сума: ${(doc.amountCents / 100).toFixed(2)} EUR`);
  if (doc.keywords.length > 0) lines.push(`Ключові слова: ${doc.keywords.join(", ")}`);

  if (doc.summary) lines.push("", "Стислий зміст:", doc.summary);
  if (doc.bodyText) lines.push("", "Повний текст:", doc.bodyText);

  return lines.join("\n");
}
