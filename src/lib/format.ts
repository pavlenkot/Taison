const LOCALE = "uk-UA";

const money = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

const moneyCompact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** 123456 центів → «1 234,56 €» */
export function formatMoney(cents: number, compact = false): string {
  const value = cents / 100;
  return (compact ? moneyCompact : money).format(value);
}

/** Знакова сума: витрата зі знаком «−», дохід із «+». */
export function formatSigned(cents: number, kind: "expense" | "income"): string {
  const sign = kind === "expense" ? "−" : "+";
  return `${sign}${formatMoney(Math.abs(cents))}`;
}

/** «12,34» або «12.34» → 1234 центи. Порожній рядок → null. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** 1234 центи → «12.34» для полів вводу. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    day: "2-digit",
    month: "2-digit",
  });
}

export function formatMonth(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(LOCALE, {
    month: "long",
    year: "numeric",
  });
}

/** «Сьогодні», «Завтра», «Прострочено на 3 дн.» — для строків оплати. */
export function describeDueDate(iso: string): { label: string; tone: "ok" | "soon" | "late" } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${iso}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { label: `Прострочено на ${Math.abs(days)} дн.`, tone: "late" };
  if (days === 0) return { label: "Сьогодні", tone: "late" };
  if (days === 1) return { label: "Завтра", tone: "soon" };
  if (days <= 7) return { label: `Через ${days} дн.`, tone: "soon" };
  return { label: formatDate(iso), tone: "ok" };
}

/** Локальна дата у форматі YYYY-MM-DD без зсуву часового поясу. */
export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
