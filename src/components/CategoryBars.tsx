import { formatMoney } from "@/lib/format";

export interface CategorySlice {
  name: string;
  cents: number;
  entries: number;
}

const MAX_ROWS = 7;

/**
 * Горизонтальні смуги за категоріями. Одна барва навмисно: категорію називає
 * підпис на осі, тож розфарбовувати 14 категорій у 14 кольорів немає сенсу —
 * це лише зашумило б порівняння довжин.
 */
export function CategoryBars({
  slices,
  title,
  total,
}: {
  slices: CategorySlice[];
  title: string;
  total: number;
}) {
  if (slices.length === 0) {
    return (
      <figure className="card">
        <figcaption className="mb-1 text-sm font-semibold">{title}</figcaption>
        <p className="py-6 text-center text-sm text-muted">Немає даних за цей період</p>
      </figure>
    );
  }

  const sorted = [...slices].sort((a, b) => b.cents - a.cents);
  const head = sorted.slice(0, MAX_ROWS);
  const tail = sorted.slice(MAX_ROWS);

  const rows =
    tail.length > 0
      ? [
          ...head,
          {
            name: `Інше (${tail.length})`,
            cents: tail.reduce((s, r) => s + r.cents, 0),
            entries: tail.reduce((s, r) => s + r.entries, 0),
          },
        ]
      : head;

  const max = Math.max(...rows.map((r) => r.cents), 1);

  return (
    <figure className="card">
      <figcaption className="mb-3 text-sm font-semibold">{title}</figcaption>

      <ul className="space-y-2.5">
        {rows.map((r) => {
          const share = total > 0 ? Math.round((r.cents / total) * 100) : 0;
          return (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.name}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatMoney(r.cents)}
                  <span className="ml-1.5 text-xs font-normal text-muted">{share}%</span>
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((r.cents / max) * 100, 1)}%`,
                    background: "rgb(var(--series-1))",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
