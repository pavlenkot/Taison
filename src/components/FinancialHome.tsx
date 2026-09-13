"use client";
import Link from "next/link";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ACCOUNTS,
  accountLabel,
  type FinancialSection,
  transactionTotals,
} from "@/lib/financial";
import {
  formatMoney,
  formatSigned,
  formatDateShort,
  centsToInput,
} from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { saveInvestment } from "@/app/actions";
import { Sheet } from "./Sheet";
import { AccountSwitch } from "./AccountSwitch";
import { ActionForm } from "./ActionForm";
import { Icon, CategoryIcon } from "./Icon";

function MonthPicker({ section, month, label }: { section: FinancialSection; month: string; label: string }) {
  return <Sheet title="Місяць огляду" className="summary-period btn-ghost" trigger={<><Icon name="calendar" size={20} />{label}</>} icon="calendar">
    <form action="/">
      <input type="hidden" name="account" value={section} />
      <label className="block"><span className="label">Місяць</span><input type="month" name="month" defaultValue={month} required className="field" /></label>
      <button type="submit" className="btn-primary mt-5 w-full">Застосувати</button>
    </form>
  </Sheet>;
}

export function FinancialHome({
  section,
  rows,
  month,
  monthLabel,
  investment,
  notices,
}: {
  section: FinancialSection;
  rows: Transaction[];
  month: string;
  monthLabel: string;
  investment: number;
  notices?: ReactNode;
}) {
  const config = ACCOUNTS.find((a) => a.key === section)!;
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const start = useRef<{ x: number; y: number } | null>(null);
  const scoped = rows.filter((r) => r.financial_account === section);
  const totals = transactionTotals(scoped);
  const amount = section === "investments" ? investment : totals.expense;
  const index = ACCOUNTS.findIndex((a) => a.key === section);
  function move(direction: number) {
    const key = ACCOUNTS[(index + direction + 4) % 4].key;
    document.cookie =
      "financial-section=" + key + ";path=/;max-age=31536000;SameSite=Lax";
    router.push("/?account=" + key + "&month=" + month);
  }
  return (
    <div
      className="financial-home"
      style={
        {
          "--section-glow": config.glow,
          "--section-base": config.base,
          "--section-accent": config.accent,
        } as CSSProperties
      }
    >
      <header className="home-heading page-header">
        <div>
          <h1>Огляд</h1>
          <p>Taison</p>
        </div>
        <MonthPicker section={section} month={month} label={monthLabel} />
      </header>
      <section
        className="financial-summary"
        aria-label={accountLabel(section)}
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }}
        onTouchEnd={(e) => {
          if (!start.current) return;
          const dx = e.changedTouches[0].clientX - start.current.x,
            dy = e.changedTouches[0].clientY - start.current.y;
          start.current = null;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5)
            move(dx < 0 ? 1 : -1);
        }}
      >
        <div className="hidden md:block">
          <AccountSwitch
            value={section}
            base="/"
            investments
            params={{ month }}
          />
        </div>
        <div className="mb-4 md:hidden">
          <Sheet
            title="Фінансовий розділ"
            className="chip"
            trigger={
              <>
                {config.label}
                <Icon name="chevron" size={18} className="rotate-90" />
              </>
            }
          >
            <AccountSwitch
              value={section}
              base="/"
              investments
              params={{ month }}
            />
          </Sheet>
        </div>
        <div className="md:hidden flex justify-center">
          <MonthPicker section={section} month={month} label={monthLabel} />
        </div>
        <div className="summary-amount">
          <button
            type="button"
            className="icon-button"
            aria-label={visible ? "Приховати суму" : "Показати суму"}
            aria-pressed={!visible}
            onClick={() => setVisible(!visible)}
          >
            <Icon name={visible ? "eye" : "hidden"} />
          </button>
          <strong>{visible ? formatMoney(amount) : "•••••"}</strong>
          {section !== "investments" && (
            <Link
              href={"/analytics?account=" + section}
              className="icon-circle"
              aria-label="Відкрити аналітику"
            >
              <Icon name="bars" />
            </Link>
          )}
        </div>
        <p className="summary-caption">
          {section === "investments"
            ? "Інвестовано за місяць"
            : "Витрати за місяць"}
        </p>
        {(section === "cash" || section === "gewerbe") && (
          <p className="summary-income">
            Доходи за місяць:{" "}
            <strong>{visible ? formatMoney(totals.income) : "•••••"}</strong>
          </p>
        )}
        {section === "investments" && (
          <div className="mt-5">
            <Sheet title="Інвестиції" trigger="Вписати суму" icon="bars">
              <ActionForm action={saveInvestment}>
                <label className="block mb-4">
                  <span className="label">Місяць</span>
                  <input
                    type="month"
                    name="month"
                    defaultValue={month}
                    required
                    className="field"
                  />
                </label>
                <label className="block">
                  <span className="label">Інвестовано за місяць, €</span>
                  <input
                    name="amount"
                    inputMode="decimal"
                    defaultValue={centsToInput(investment)}
                    required
                    className="field"
                  />
                </label>
                <button className="btn-primary mt-5 w-full">Зберегти</button>
              </ActionForm>
            </Sheet>
          </div>
        )}
        <nav className="summary-dots" aria-label="Гортання фінансових розділів">
          {ACCOUNTS.map((a) => (
            <Link
              key={a.key}
              href={"/?account=" + a.key + "&month=" + month}
              aria-label={a.label}
              aria-current={section === a.key ? "true" : undefined}
              onClick={() => {
                document.cookie =
                  "financial-section=" +
                  a.key +
                  ";path=/;max-age=31536000;SameSite=Lax";
              }}
            />
          ))}
        </nav>
        <div className="sr-only">
          <button type="button" onClick={() => move(-1)}>
            Попередній розділ
          </button>
          <button type="button" onClick={() => move(1)}>
            Наступний розділ
          </button>
        </div>
      </section>
      <div className="home-panels">
        {notices}
        <section className="home-panel">
          <div className="panel-heading">
            <h2>Швидкі дії</h2>
          </div>
          <div className="quick-actions">
            <Link
              href={
                "/transactions?add=1&account=" +
                (section === "investments" ? "online" : section)
              }
              className="quick-action"
            >
              <span className="icon-circle text-[#7D8FFF]">
                <Icon name="plus" size={32} />
              </span>
              Операція
            </Link>
            <Link href="/scan" className="quick-action">
              <span className="icon-circle text-[#81D8D0]">
                <Icon name="scan" size={32} />
              </span>
              Сканувати
            </Link>
            <Link
              href={
                "/analytics?account=" +
                (section === "investments" ? "online" : section)
              }
              className="quick-action"
            >
              <span className="icon-circle">
                <Icon name="analytics" size={32} />
              </span>
              Аналітика
            </Link>
          </div>
        </section>
        <section className="home-panel">
          <div className="panel-heading">
            <h2>Останні операції</h2>
            <Link
              href={
                "/transactions?account=" +
                (section === "investments" ? "online" : section)
              }
              className="text-accent text-sm"
            >
              Усі ›
            </Link>
          </div>
          {scoped.length === 0 ? (
            <p className="text-sm text-muted">
              {section === "investments"
                ? "Місячна сума інвестицій зберігається окремо від операцій."
                : "У цьому розділі ще немає операцій за місяць."}
            </p>
          ) : (
            <ul className="space-y-2">
              {scoped.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link
                    href={"/transactions?account=" + section + "&edit=" + t.id}
                    className="transaction-row"
                  >
                    <CategoryIcon
                      category={{
                        ...t.categories,
                        id: t.category_id ?? undefined,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block row-title truncate">
                        {t.merchant ?? t.categories?.name ?? "Без назви"}
                      </span>
                      <span className="block row-meta">
                        {t.categories?.name ?? "Без категорії"} ·{" "}
                        {formatDateShort(t.occurred_on)}
                      </span>
                    </span>
                    <span className={"row-amount " + t.kind}>
                      {formatSigned(t.amount_cents, t.kind)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
