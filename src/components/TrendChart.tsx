"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/format";

export interface TrendPoint {
  label: string;
  fullLabel: string;
  cents: number;
}

/**
 * Стовпчики витрат за період. Одна серія, тому легенда не потрібна —
 * заголовок сам називає, що показано. Значення підписані вибірково:
 * найбільший стовпчик, щоб дати шкалу, решта — у підказці на наведення.
 */
export function TrendChart({ points, title }: { points: TrendPoint[]; title: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(...points.map((p) => p.cents), 1);
  const peak = points.reduce((best, p, i) => (p.cents > points[best].cents ? i : best), 0);
  const active = hover === null ? null : points[hover];

  // Підписи під віссю прорідили так, щоб вони не наїжджали один на одного.
  const labelEvery = Math.ceil(points.length / 8);

  return (
    <figure className="card">
      <figcaption className="mb-1 text-sm font-semibold">{title}</figcaption>

      <div className="h-5 text-xs tabular-nums text-muted">
        {active ? (
          <span>
            <span className="text-ink">{active.fullLabel}</span> · {formatMoney(active.cents)}
          </span>
        ) : (
          <span>Максимум: {formatMoney(points[peak]?.cents ?? 0)}</span>
        )}
      </div>

      <div
        className="mt-2 flex h-36 items-end gap-[2px]"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`${title}. Максимум ${formatMoney(points[peak]?.cents ?? 0)}.`}
      >
        {points.map((p, i) => {
          const pct = (p.cents / max) * 100;
          return (
            <div
              key={i}
              className="flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={-1}
            >
              <div
                className="w-full rounded-t transition-opacity"
                style={{
                  // Нульові значення лишають ледь помітний слід — видно, що день був
                  height: p.cents > 0 ? `${Math.max(pct, 2)}%` : "2px",
                  background:
                    p.cents > 0 ? "rgb(var(--series-1))" : "rgb(var(--line))",
                  opacity: hover === null || hover === i ? 1 : 0.45,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-[2px] text-[10px] text-muted">
        {points.map((p, i) => (
          <div key={i} className="flex-1 overflow-hidden text-center">
            {i % labelEvery === 0 ? p.label : ""}
          </div>
        ))}
      </div>
    </figure>
  );
}
