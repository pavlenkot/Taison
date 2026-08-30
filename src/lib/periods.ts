import { isoDate } from "./format";

export type PeriodKind = "week" | "month" | "year";

export interface Period {
  kind: PeriodKind;
  /** Зсув відносно поточного: 0 — цей період, -1 — попередній. */
  offset: number;
  from: string;
  to: string;
  label: string;
  /** Кошик для групування в аналітиці. */
  bucket: "day" | "week" | "month";
}

/** Понеділок того тижня, до якого належить дата. */
function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const isoDow = (out.getDay() + 6) % 7; // 0 = понеділок
  out.setDate(out.getDate() - isoDow);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function resolvePeriod(kind: PeriodKind, offset = 0, now = new Date()): Period {
  let from: Date;
  let to: Date;
  let label: string;
  let bucket: Period["bucket"];

  if (kind === "week") {
    from = startOfWeek(now);
    from.setDate(from.getDate() + offset * 7);
    to = new Date(from);
    to.setDate(to.getDate() + 6);
    bucket = "day";
    label =
      offset === 0
        ? "Цей тиждень"
        : offset === -1
          ? "Минулий тиждень"
          : `${from.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })} — ${to.toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}`;
  } else if (kind === "month") {
    from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    bucket = "day";
    label =
      offset === 0
        ? "Цей місяць"
        : offset === -1
          ? "Минулий місяць"
          : from.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  } else {
    from = new Date(now.getFullYear() + offset, 0, 1);
    to = new Date(now.getFullYear() + offset, 11, 31);
    bucket = "month";
    label = offset === 0 ? "Цей рік" : String(now.getFullYear() + offset);
  }

  return { kind, offset, from: isoDate(from), to: isoDate(to), label, bucket };
}

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  week: "Тиждень",
  month: "Місяць",
  year: "Рік",
};
