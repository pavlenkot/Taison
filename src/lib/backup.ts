import { accountLabel } from "./financial";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Повна копія даних однією книгою: не виписка за період, а все, що
 * застосунок про вас знає. Саме це робить Google-акаунт справжньою
 * копією — з такої книги дані можна прочитати й без застосунку.
 */
interface SheetSpec {
  title: string;
  table: string;
  select: string;
  columns: { header: string; key: string; width: number }[];
  order?: { column: string; ascending: boolean };
  map: (row: Record<string, unknown>) => Record<string, unknown>;
}

const cents = (value: unknown): number | null =>
  typeof value === "number" ? value / 100 : null;

const SHEETS: SheetSpec[] = [
  {
    title: "Операції",
    table: "transactions",
    select: "*, categories (name)",
    order: { column: "occurred_on", ascending: true },
    columns: [
      { header: "Фінансовий розділ", key: "account", width: 20 },
      { header: "Дата", key: "date", width: 12 },
      { header: "Тип", key: "kind", width: 10 },
      { header: "Категорія", key: "category", width: 22 },
      { header: "Магазин", key: "merchant", width: 24 },
      { header: "Нотатка", key: "note", width: 32 },
      { header: "Сума", key: "amount", width: 12 },
      { header: "Звідки", key: "source", width: 14 },
    ],
    map: (r) => ({
      account: accountLabel(
        typeof r.financial_account === "string" ? r.financial_account : null,
      ),
      date: r.occurred_on,
      kind: r.kind === "income" ? "Дохід" : "Витрата",
      category:
        (r.categories as { name?: string } | null)?.name ?? "Без категорії",
      merchant: r.merchant ?? "",
      note: r.note ?? "",
      amount:
        r.kind === "income"
          ? cents(r.amount_cents)
          : -(cents(r.amount_cents) ?? 0),
      source: r.source,
    }),
  },
  {
    title: "Підписки",
    table: "subscriptions",
    select: "*",
    order: { column: "next_due_on", ascending: true },
    columns: [
      { header: "Фінансовий розділ", key: "account", width: 20 },
      { header: "Назва", key: "name", width: 24 },
      { header: "Сума", key: "amount", width: 12 },
      { header: "Періодичність", key: "recurrence", width: 16 },
      { header: "Наступний платіж", key: "due", width: 18 },
      { header: "Активна", key: "active", width: 10 },
      { header: "Нотатка", key: "notes", width: 30 },
    ],
    map: (r) => ({
      account: accountLabel(
        typeof r.financial_account === "string" ? r.financial_account : null,
      ),
      name: r.name,
      amount: cents(r.amount_cents),
      recurrence: r.recurrence,
      due: r.next_due_on,
      active: r.active ? "так" : "ні",
      notes: r.notes ?? "",
    }),
  },
  {
    title: "Цілі",
    table: "goals",
    select: "*",
    order: { column: "created_at", ascending: true },
    columns: [
      { header: "Ціль", key: "title", width: 30 },
      { header: "Сума", key: "target", width: 12 },
      { header: "Дедлайн", key: "due", width: 14 },
      { header: "Стан", key: "status", width: 12 },
      { header: "Досягнуто", key: "done", width: 16 },
    ],
    map: (r) => ({
      title: r.title,
      target: cents(r.target_cents),
      due: r.due_on ?? "",
      status: r.status,
      done:
        typeof r.completed_at === "string" ? r.completed_at.slice(0, 10) : "",
    }),
  },
  {
    title: "Завдання",
    table: "tasks",
    select: "*",
    order: { column: "due_on", ascending: true },
    columns: [
      { header: "Завдання", key: "title", width: 34 },
      { header: "Дата", key: "due", width: 12 },
      { header: "Повтор", key: "repeat", width: 12 },
      { header: "Виконано", key: "done", width: 16 },
    ],
    map: (r) => ({
      title: r.title,
      due: r.due_on,
      repeat: r.repeat,
      done: typeof r.done_at === "string" ? r.done_at.slice(0, 10) : "",
    }),
  },
  {
    title: "Документи",
    table: "documents",
    select:
      "doc_type, issuer, subject, reference_number, document_date, deadline, amount_cents, keywords, drive_link, summary",
    order: { column: "document_date", ascending: false },
    columns: [
      { header: "Короткий зміст", key: "summary", width: 50 },
      { header: "Дата", key: "date", width: 12 },
      { header: "Від кого", key: "issuer", width: 22 },
      { header: "Про що", key: "subject", width: 36 },
      { header: "Категорія", key: "type", width: 16 },
      { header: "Номер справи", key: "reference", width: 22 },
      { header: "Строк", key: "deadline", width: 12 },
      { header: "Сума", key: "amount", width: 12 },
      { header: "Ключові слова", key: "keywords", width: 40 },
      { header: "Файл на Диску", key: "link", width: 40 },
    ],
    map: (r) => ({
      summary: r.summary ?? "",
      date: r.document_date ?? "",
      issuer: r.issuer ?? "",
      subject: r.subject ?? "",
      type: r.doc_type,
      reference: r.reference_number ?? "",
      deadline: r.deadline ?? "",
      amount: cents(r.amount_cents),
      keywords: Array.isArray(r.keywords)
        ? (r.keywords as string[]).join(", ")
        : "",
      link: r.drive_link ?? "",
    }),
  },
  {
    title: "Категорії",
    table: "categories",
    select: "*",
    order: { column: "sort", ascending: true },
    columns: [
      { header: "Назва", key: "name", width: 24 },
      { header: "Тип", key: "kind", width: 12 },
      { header: "Значок", key: "icon", width: 10 },
      { header: "Прихована", key: "hidden", width: 12 },
    ],
    map: (r) => ({
      name: r.name,
      kind: r.kind === "income" ? "дохід" : "витрата",
      icon: r.icon ?? "",
      hidden: r.hidden ? "так" : "ні",
    }),
  },
  {
    title: "Інвестиції",
    table: "monthly_investments",
    select: "*",
    order: { column: "month", ascending: true },
    columns: [
      { header: "Місяць", key: "month", width: 14 },
      { header: "Інвестовано", key: "amount", width: 16 },
    ],
    map: (r) => ({ month: r.month, amount: cents(r.amount_cents) }),
  },
];

/** Формули в Excel виконуються — рядок, що починається з =, знешкоджуємо. */
function safeCell(value: unknown): unknown {
  return typeof value === "string" && /^[=+\-@\t\r]/.test(value)
    ? `'${value}`
    : value;
}

export async function buildBackupWorkbook(
  supabase: SupabaseClient,
): Promise<{ buffer: Buffer; rows: number }> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Taison";
  workbook.created = new Date();

  let total = 0;

  for (const spec of SHEETS) {
    let query = supabase.from(spec.table).select(spec.select);
    if (spec.order) {
      query = query.order(spec.order.column, {
        ascending: spec.order.ascending,
        nullsFirst: false,
      });
    }

    const { data, error } = await query;
    if (error) throw new Error(`${spec.title}: ${error.message}`);

    const sheet = workbook.addWorksheet(spec.title, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = spec.columns;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFEFEF" },
    };

    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
      const mapped = spec.map(row);
      for (const key of Object.keys(mapped))
        mapped[key] = safeCell(mapped[key]);
      sheet.addRow(mapped);
      total += 1;
    }

    for (const key of ["amount", "target"]) {
      const column = spec.columns.find((c) => c.key === key);
      if (column) sheet.getColumn(key).numFmt = '#,##0.00 "€"';
    }

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: spec.columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), rows: total };
}
