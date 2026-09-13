"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
const ITEMS = [
  { href: "/", label: "Огляд", icon: "overview", primary: true },
  {
    href: "/transactions",
    label: "Операції",
    icon: "transactions",
    primary: true,
  },
  { href: "/analytics", label: "Аналітика", icon: "analytics" },
  { href: "/scan", label: "Скан", icon: "scan", primary: true },
  { href: "/documents", label: "Документи", icon: "documents", primary: true },
  { href: "/subscriptions", label: "Платежі", icon: "payments" },
  { href: "/tasks", label: "Завдання", icon: "tasks" },
  { href: "/goals", label: "Цілі", icon: "goals" },
  { href: "/digest", label: "Підсумок", icon: "digest" },
  { href: "/receipts", label: "Скани", icon: "receipts" },
  { href: "/categories", label: "Категорії", icon: "categories" },
  { href: "/archive", label: "Архів", icon: "archive" },
  { href: "/more", label: "Ще", icon: "more", primary: true },
  { href: "/settings", label: "Налаштування", icon: "settings" },
];
export function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const moreActive =
    ITEMS.some((i) => !i.primary && active(i.href)) || active("/more");
  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-inner">
          <div className="sidebar-brand" title={email}>
            Taison
          </div>
          <nav aria-label="Головне меню">
            {ITEMS.map((i, index) => (
              <div key={i.href}>
                {(index === 5 || index === 12) && (
                  <div className="sidebar-separator" />
                )}
                <Link
                  href={i.href}
                  aria-current={active(i.href) ? "page" : undefined}
                >
                  <Icon name={i.icon} size={26} />
                  {i.label}
                </Link>
              </div>
            ))}
          </nav>
        </div>
      </aside>
      <nav className="bottom-nav" aria-label="Головне меню">
        {ITEMS.filter((i) => i.primary).map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={
              (i.href === "/more" ? moreActive : active(i.href))
                ? "page"
                : undefined
            }
          >
            <Icon name={i.icon} />
            {i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
