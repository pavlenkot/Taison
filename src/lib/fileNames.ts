import { safeFileName } from "./slug";

/**
 * Імена файлів на Диску будуються в трьох місцях: під час сканування,
 * під час приймання від Швидкої команди і коли довантажуємо те, що не
 * доїхало з першого разу. Якби кожне рахувало по-своєму, один документ
 * після повтору отримав би на Диску друге ім'я.
 */

export function documentFolderName(issuer: string | null): string {
  return (issuer ? safeFileName(issuer, 40) : "") || "Без адресата";
}

/** Ім'я читається як картка документа: за ним його видно в списку файлів. */
export function documentFileName(parts: {
  documentDate: string | null;
  issuer: string | null;
  subject: string | null;
  referenceNumber: string | null;
}): string {
  const name = safeFileName(
    [parts.documentDate, parts.issuer, parts.subject, parts.referenceNumber]
      .filter((part): part is string => Boolean(part && part.length > 0))
      .join(" · "),
    110,
  );
  return name || "Документ";
}

export function receiptFileName(parts: {
  occurredOn: string;
  merchant: string | null;
  totalCents: number | null;
}): string {
  const euro = parts.totalCents ? `${(parts.totalCents / 100).toFixed(2)} EUR` : "";
  const name = safeFileName(
    [parts.occurredOn, parts.merchant ?? "Чек", euro]
      .filter((part) => part.length > 0)
      .join(" · "),
    110,
  );
  return name || "Чек";
}
