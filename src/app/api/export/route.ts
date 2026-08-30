import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod, type PeriodKind } from "@/lib/periods";
import type { Transaction } from "@/lib/types";

export const maxDuration = 60;

const HEADERS = [
  { header: "Дата", key: "date", width: 12 },
  { header: "Тип", key: "kind", width: 10 },
  { header: "Категорія", key: "category", width: 22 },
  { header: "Магазин / джерело", key: "merchant", width: 26 },
  { header: "Нотатка", key: "note", width: 34 },
  { header: "Сума", key: "amount", width: 12 },
  { header: "Валюта", key: "currency", width: 9 },
  { header: "Звідки запис", key: "source", width: 14 },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: "Вручну",
  scan: "Скан",
  shortcut: "Швидка команда",
  subscription: "Підписка",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Дата з рядка запиту приймається лише у форматі YYYY-MM-DD і лише справжня. */
function validDate(value: string | null): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

/**
 * Excel читає дату як дату лише з об'єкта Date; рядок лишається текстом,
 * і тоді у виписці не працюють ні сортування, ні фільтр за періодом.
 * Полудень UTC — щоб зсув поясу в жодному напрямку не переніс день.
 */
function excelDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

/** Захист від формул: рядок, що починається з =, +, -, @, Excel виконає як формулу. */
function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const periodKind = (searchParams.get("period") ?? "year") as PeriodKind;
  const offset = Number(searchParams.get("offset") ?? 0) || 0;

  const explicitFrom = validDate(searchParams.get("from"));
  const explicitTo = validDate(searchParams.get("to"));

  const period = ["week", "month", "year"].includes(periodKind)
    ? resolvePeriod(periodKind, offset)
    : resolvePeriod("year", 0);

  const custom = explicitFrom !== null && explicitTo !== null && explicitFrom <= explicitTo;
  const from = custom ? explicitFrom : period.from;
  const to = custom ? explicitTo : period.to;

  const { data, error } = await supabase
    .from("transactions")
    .select("*, categories (name)")
    .eq("needs_review", false)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data as Transaction[]) ?? []).map((t) => ({
    date: t.occurred_on,
    kind: t.kind === "income" ? "Дохід" : "Витрата",
    category: t.categories?.name ?? "Без категорії",
    merchant: t.merchant ?? "",
    note: t.note ?? "",
    // Витрати від'ємні — так виписка читається як банківська
    amount: (t.kind === "income" ? t.amount_cents : -t.amount_cents) / 100,
    currency: t.currency,
    source: SOURCE_LABELS[t.source] ?? t.source,
  }));

  const filename = `taison_${from}_${to}`;

  if (format === "csv") {
    const lines = [HEADERS.map((h) => h.header).join(";")];
    for (const r of rows) {
      lines.push(
        [
          r.date,
          r.kind,
          r.category,
          r.merchant,
          r.note,
          // Кома як десятковий роздільник — так Excel з українською/німецькою
          // локаллю одразу бачить число, а не текст
          r.amount.toFixed(2).replace(".", ","),
          r.currency,
          r.source,
        ]
          .map((v) => `"${safeCell(String(v)).replace(/"/g, '""')}"`)
          .join(";"),
      );
    }

    // BOM, щоб Excel відкрив UTF-8 без крякозябр
    const body = `﻿${lines.join("\r\n")}`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Taison";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Операції", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = HEADERS;

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEFEFEF" },
  };

  for (const r of rows) {
    sheet.addRow({
      ...r,
      date: excelDate(r.date),
      category: safeCell(r.category),
      merchant: safeCell(r.merchant),
      note: safeCell(r.note),
    });
  }

  sheet.getColumn("amount").numFmt = '#,##0.00 "€"';
  sheet.getColumn("date").numFmt = "yyyy-mm-dd";
  sheet.autoFilter = { from: "A1", to: "H1" };

  // Підсумковий аркуш: скільки й на що пішло за період
  const summary = workbook.addWorksheet("Підсумок");
  summary.columns = [
    { header: "Категорія", key: "category", width: 26 },
    { header: "Операцій", key: "count", width: 11 },
    { header: "Витрати", key: "expense", width: 14 },
    { header: "Доходи", key: "income", width: 14 },
  ];
  summary.getRow(1).font = { bold: true };

  const byCategory = new Map<string, { count: number; expense: number; income: number }>();
  for (const r of rows) {
    const cur = byCategory.get(r.category) ?? { count: 0, expense: 0, income: 0 };
    cur.count += 1;
    if (r.amount < 0) cur.expense += -r.amount;
    else cur.income += r.amount;
    byCategory.set(r.category, cur);
  }

  for (const [category, v] of [...byCategory.entries()].sort(
    (a, b) => b[1].expense - a[1].expense,
  )) {
    summary.addRow({
      category: safeCell(category),
      count: v.count,
      expense: v.expense,
      income: v.income,
    });
  }

  const totalExpense = rows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
  const totalIncome = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);

  summary.addRow({});
  const totalRow = summary.addRow({
    category: "Разом",
    count: rows.length,
    expense: totalExpense,
    income: totalIncome,
  });
  totalRow.font = { bold: true };

  summary.getColumn("expense").numFmt = '#,##0.00 "€"';
  summary.getColumn("income").numFmt = '#,##0.00 "€"';

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
