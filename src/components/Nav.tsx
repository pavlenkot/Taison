"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Item {
  href: string;
  label: string;
  icon: string;
  /** Показувати в нижній панелі на телефоні. */
  primary?: boolean;
}

const ITEMS: Item[] = [
  { href: "/", label: "Огляд", icon: "◎", primary: true },
  { href: "/transactions", label: "Операції", icon: "≡", primary: true },
  { href: "/scan", label: "Скан", icon: "⌷", primary: true },
  { href: "/subscriptions", label: "Платежі", icon: "↻", primary: true },
  { href: "/tasks", label: "Завдання", icon: "✓" },
  { href: "/goals", label: "Цілі", icon: "◈" },
  { href: "/digest", label: "Підсумок", icon: "🗒" },
  { href: "/analytics", label: "Аналітика", icon: "▤" },
  { href: "/receipts", label: "Скани", icon: "🗂" },
  { href: "/categories", label: "Категорії", icon: "◇" },
  { href: "/archive", label: "Архів", icon: "⌸" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const primary = ITEMS.filter((i) => i.primary);

  return (
    <>
      {/* Бічна панель на ноутбуці та айпаді */}
      <aside className="hidden w-56 shrink-0 border-r border-line bg-raised md:block">
        <div className="sticky top-0 flex h-screen flex-col p-4">
          <div className="px-2 pb-6 pt-2">
            <div className="text-lg font-bold tracking-tight">Taison</div>
            <div className="truncate text-xs text-muted">{email}</div>
          </div>

          <nav className="flex flex-col gap-1">
            {ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  isActive(pathname, item.href)
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-surface hover:text-ink"
                }`}
              >
                <span className="w-4 text-center text-base">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto pt-4">
            <Link
              href="/more"
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface hover:text-ink"
            >
              <span className="w-4 text-center text-base">⋯</span>
              Ще
            </Link>
          </div>
        </div>
      </aside>

      {/* Нижня панель на телефоні */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {primary.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
                isActive(pathname, item.href) ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <Link
            href="/more"
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition ${
              [
                "/more", "/tasks", "/goals", "/digest",
                "/analytics", "/receipts", "/categories", "/archive",
              ].some((p) =>
                isActive(pathname, p),
              )
                ? "text-accent"
                : "text-muted"
            }`}
          >
            <span className="text-lg leading-none">⋯</span>
            Ще
          </Link>
        </div>
      </nav>
    </>
  );
}
