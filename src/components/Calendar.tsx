"use client";
import { useState } from "react";
import { calendarDays } from "@/lib/calendar";
import { isoDate, validDate, formatDateShort } from "@/lib/format";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";

function CalendarGrid({
  from,
  to,
  range,
  change,
}: {
  from: string;
  to: string;
  range: boolean;
  change: (from: string, to: string) => void;
}) {
  const initial = new Date((validDate(from) ?? isoDate()) + "T12:00:00Z");
  const [view, setView] = useState({
    year: initial.getUTCFullYear(),
    month: initial.getUTCMonth(),
  });
  const [choosingEnd, setChoosingEnd] = useState(false);
  const shift = (step: number) => {
    const d = new Date(Date.UTC(view.year, view.month + step, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };
  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="icon-button"
          aria-label="Попередній місяць"
          onClick={() => shift(-1)}
        >
          <Icon name="chevron" className="rotate-180" />
        </button>
        <strong>
          {new Date(Date.UTC(view.year, view.month, 1)).toLocaleDateString(
            "uk-UA",
            { month: "long", year: "numeric", timeZone: "UTC" },
          )}
        </strong>
        <button
          type="button"
          className="icon-button"
          aria-label="Наступний місяць"
          onClick={() => shift(1)}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <div className="calendar-grid">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => (
          <span key={d} className="calendar-weekday">
            {d}
          </span>
        ))}
        {calendarDays(view.year, view.month).map((day, i) => {
          if (!day) return <span key={i} />;
          const date =
            view.year +
            "-" +
            String(view.month + 1).padStart(2, "0") +
            "-" +
            String(day).padStart(2, "0");
          const selected = date >= from && date <= (range ? to : from);
          const css =
            (!range && date === from) || (from === to && date === from)
              ? "range-single"
              : selected
                ? date === from || i % 7 === 0
                  ? "range-start"
                  : date === to || i % 7 === 6
                    ? "range-end"
                    : "range-day"
                : "";
          return (
            <button
              type="button"
              key={i}
              className={css}
              aria-label={date}
              aria-pressed={selected}
              onClick={() => {
                if (!range) {
                  change(date, date);
                  return;
                }
                if (!choosingEnd) {
                  change(date, date);
                  setChoosingEnd(true);
                } else {
                  change(date < from ? date : from, date < from ? from : date);
                  setChoosingEnd(false);
                }
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function DateField({
  name,
  defaultValue = "",
  required = false,
  label = "Оберіть дату",
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  label?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [draft, setDraft] = useState(defaultValue);
  return (
    <div className="date-field">
      <input
        type="date"
        name={name}
        aria-label={label}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDraft(e.target.value);
        }}
        className="field"
        required={required}
      />
      <Sheet
        title={label}
        className="icon-button"
        icon="calendar"
        trigger={<Icon name="calendar" />}
      >
        <CalendarGrid
          from={draft}
          to={draft}
          range={false}
          change={(v) => setDraft(v)}
        />
        <button
          type="button"
          className="btn-primary mt-6 w-full"
          disabled={!validDate(draft)}
          onClick={(e) => {
            setValue(draft);
            e.currentTarget.closest("dialog")?.close();
          }}
        >
          Застосувати
        </button>
      </Sheet>
    </div>
  );
}
export function CalendarRange({
  initialFrom = "",
  initialTo = "",
}: {
  initialFrom?: string;
  initialTo?: string;
}) {
  const [from, setFrom] = useState(initialFrom),
    [to, setTo] = useState(initialTo);
  const [draftFrom, setDraftFrom] = useState(initialFrom),
    [draftTo, setDraftTo] = useState(initialTo);
  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <Sheet
        title="Період"
        icon="calendar"
        className="btn-ghost w-full"
        trigger={
          <>
            <Icon name="calendar" size={20} />
            {from && to
              ? formatDateShort(from) + " — " + formatDateShort(to)
              : "Обрати період"}
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Від</span>
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="field"
            />
          </label>
          <label>
            <span className="label">До</span>
            <input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="field"
            />
          </label>
        </div>
        <CalendarGrid
          from={draftFrom}
          to={draftTo}
          range
          change={(f, t) => {
            setDraftFrom(f);
            setDraftTo(t);
          }}
        />
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            className="btn-outline"
            onClick={(e) => {
              setFrom("");
              setTo("");
              setDraftFrom("");
              setDraftTo("");
              e.currentTarget.closest("dialog")?.close();
            }}
          >
            Скинути
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={
              !validDate(draftFrom) ||
              !validDate(draftTo) ||
              draftFrom > draftTo
            }
            onClick={(e) => {
              setFrom(draftFrom);
              setTo(draftTo);
              e.currentTarget.closest("dialog")?.close();
            }}
          >
            Застосувати
          </button>
        </div>
      </Sheet>
    </div>
  );
}
