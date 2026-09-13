"use client";
import { useState, useId, type CSSProperties } from "react";
import type { Kind, Transaction } from "@/lib/types";
import {
  categorySlices,
  trendPoints,
  transactionTotals,
} from "@/lib/financial";
import { categoryColor, categoryGlyph } from "@/lib/categoryStyle";
import { formatMoney, formatDateShort } from "@/lib/format";
import { Icon, CategoryIcon } from "./Icon";

function sector(start: number, portion: number) {
  const angle = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [180 + r * Math.cos(a), 180 + r * Math.sin(a)];
  };
  const end = start + Math.min(portion, 359.999);
  const a = angle(start, 160),
    b = angle(end, 160),
    c = angle(end, 90),
    d = angle(start, 90);
  return (
    "M" +
    a.join(",") +
    " A160,160 0 " +
    (portion > 180 ? 1 : 0) +
    " 1 " +
    b.join(",") +
    " L" +
    c.join(",") +
    " A90,90 0 " +
    (portion > 180 ? 1 : 0) +
    " 0 " +
    d.join(",") +
    " Z"
  );
}
export function AnalyticsPlot({
  rows,
  from,
  to,
  monthly,
  initialKind = "expense",
  exportBase,
}: {
  rows: Transaction[];
  from: string;
  to: string;
  monthly: boolean;
  initialKind?: Kind;
  exportBase: string;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [view, setView] = useState<"ring" | "bars">("ring");
  const [selected, setSelected] = useState<string | null>(null);
  const [bar, setBar] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");
  const slices = categorySlices(rows, kind);
  const active = slices.find((s) => s.id === selected) ?? slices[0];
  const totals = transactionTotals(rows),
    total = totals[kind];
  const points = trendPoints(rows, kind, from, to, monthly);
  const peak = Math.max(1, ...points.map((p) => p.cents));
  const color = active ? categoryColor(active) : "#7D8FFF";
  let angle = 0;
  return (
    <>
      <div className="flex gap-2 mb-4">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={
              "chip flex-1 " + (k === kind ? "border-accent" : "text-muted")
            }
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setSelected(null);
              setBar(null);
            }}
          >
            {k === "expense" ? "Витрати" : "Доходи"}
          </button>
        ))}
      </div>
      <div className="chart-tabs">
        <button
          type="button"
          aria-pressed={view === "ring"}
          onClick={() => setView("ring")}
        >
          <Icon name="analytics" size={20} /> Кільце
        </button>
        <button
          type="button"
          aria-pressed={view === "bars"}
          onClick={() => setView("bars")}
        >
          <Icon name="bars" size={20} /> Стовпчики
        </button>
      </div>
      <div className="chart-layout">
        <figure
          className="chart-view"
          style={
            {
              "--chart-color": view === "ring" ? color : "#7D8FFF",
            } as CSSProperties
          }
        >
          <figcaption className="text-center">
            <strong className="text-4xl font-bold tabular-nums">
              {formatMoney(view === "ring" ? (active?.cents ?? 0) : total)}
            </strong>
            <p
              className="mt-2 text-sm"
              style={{ color: view === "ring" ? color : "#ADADAD" }}
            >
              {view === "ring"
                ? (active?.name ?? "Операцій поки немає")
                : "Динаміка всього розділу"}
            </p>
          </figcaption>
          {view === "ring" ? (
            <div className="donut">
              <svg viewBox="0 0 360 360" aria-label="Розподіл за категоріями">
                <defs>
                  <linearGradient
                    id={id + "-gradient"}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0"
                      stopColor={
                        active && /food|grocer|restaurant/.test(active.slug)
                          ? "#FF7E48"
                          : color
                      }
                    />
                    <stop
                      offset="1"
                      stopColor={
                        active && /food|grocer|restaurant/.test(active.slug)
                          ? "#FF9900"
                          : color
                      }
                      stopOpacity=".8"
                    />
                  </linearGradient>
                </defs>
                {slices.length === 0 ? (
                  <circle
                    cx="180"
                    cy="180"
                    r="125"
                    fill="none"
                    stroke="#434349"
                    strokeWidth="70"
                  />
                ) : (
                  slices.map((s) => {
                    const portion = (s.cents / total) * 360;
                    const path = sector(angle, portion);
                    angle += portion;
                    return (
                      <path
                        key={s.id}
                        d={path}
                        fill={
                          s.id === active?.id
                            ? "url(#" + id + "-gradient)"
                            : "#434349"
                        }
                        stroke="#15191F"
                        strokeWidth="1.5"
                        role="button"
                        tabIndex={0}
                        aria-label={
                          s.name +
                          " " +
                          formatMoney(s.cents) +
                          " " +
                          Math.round((s.cents / total) * 100) +
                          "%"
                        }
                        aria-pressed={s.id === active?.id}
                        onClick={() => setSelected(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(s.id);
                          }
                        }}
                      />
                    );
                  })
                )}
              </svg>
              <div className="donut-center">
                <Icon
                  name={categoryGlyph(active?.icon, active?.slug)}
                  size={56}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="chart-bars">
                {points.map((p, i) => (
                  <button
                    key={p.date}
                    type="button"
                    aria-label={p.date + " " + formatMoney(p.cents)}
                    aria-pressed={bar === i}
                    onClick={() => setBar(i)}
                    onMouseEnter={() => setBar(i)}
                    onFocus={() => setBar(i)}
                  >
                    <span style={{ height: (p.cents / peak) * 100 + "%" }} />
                  </button>
                ))}
              </div>
              <div className="flex text-[10px] text-muted mt-2">
                {points.map((p, i) => (
                  <span
                    key={p.date}
                    className="flex-1 text-center overflow-hidden"
                  >
                    {i % Math.max(1, Math.ceil(points.length / 7)) === 0
                      ? monthly
                        ? p.date.slice(5, 7)
                        : p.date.slice(8)
                      : ""}
                  </span>
                ))}
              </div>
              <p className="mt-4 text-center text-sm text-muted" role="status">
                {bar !== null
                  ? formatDateShort(points[bar].date) +
                    " · " +
                    formatMoney(points[bar].cents)
                  : "Оберіть стовпчик, щоб побачити суму"}
              </p>
            </>
          )}
        </figure>
        <section className="card">
          <h2 className="mb-4">Категорії</h2>
          <div className="chart-category-list">
            {slices.map((s) => (
              <button
                key={s.id}
                type="button"
                className="transaction-row"
                aria-pressed={active?.id === s.id}
                onClick={() => {
                  setSelected(s.id);
                  setView("ring");
                }}
              >
                <CategoryIcon category={s} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.name}</span>
                  <span className="row-meta">{s.entries} операцій</span>
                </span>
                <span className="row-amount">
                  <span className="block">{formatMoney(s.cents)}</span>
                  <span className="row-meta">
                    {total > 0 ? Math.round((s.cents / total) * 100) : 0}%
                  </span>
                </span>
              </button>
            ))}
          </div>
          {slices.length === 0 && (
            <p className="text-sm text-muted">За цей період операцій немає.</p>
          )}
          <details className="mt-5">
            <summary className="text-accent cursor-pointer py-3">
              Показати таблицею
            </summary>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted text-left">
                    <th className="py-3">Категорія</th>
                    <th>Операцій</th>
                    <th className="text-right">Сума</th>
                    <th className="text-right">Частка</th>
                  </tr>
                </thead>
                <tbody>
                  {slices.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="py-3">{s.name}</td>
                      <td>{s.entries}</td>
                      <td className="text-right">{formatMoney(s.cents)}</td>
                      <td className="text-right">
                        {Math.round((s.cents / total) * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <a
            className="btn-outline mt-4 w-full"
            href={exportBase + "&kind=" + kind}
          >
            <Icon name="download" size={18} />
            Експорт
          </a>
        </section>
      </div>
    </>
  );
}
