import Link from "next/link";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
export function Empty({ icon, text }: { icon: string; text: string }) {
  const names: Record<string, string> = {
    "✓": "tasks",
    "◈": "goals",
    "⌷": "receipts",
    "🧾": "receipts",
    "📄": "documents",
    "🔁": "payments",
    "🗒️": "digest",
  };
  return (
    <div className="card empty-state">
      <span className="icon-circle">
        <Icon name={names[icon] ?? icon} size={32} />
      </span>
      <p>{text}</p>
    </div>
  );
}
export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  hint?: string;
}) {
  return (
    <div className="card stat">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={
          "stat-value " +
          (tone === "positive"
            ? "text-positive"
            : tone === "negative"
              ? "text-negative"
              : "")
        }
      >
        {value}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}
export function AddPanel({
  label,
  children,
  open = false,
}: {
  label: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <div className="mb-5">
      <Sheet title={label} open={open}>
        {children}
      </Sheet>
    </div>
  );
}
export function SectionLink({
  href,
  title,
  description,
}: {
  href: string;
  icon?: string;
  title: string;
  description: string;
}) {
  const names: Record<string, string> = {
    "/subscriptions": "payments",
    "/tasks": "tasks",
    "/goals": "goals",
    "/analytics": "analytics",
    "/documents": "documents",
    "/receipts": "receipts",
    "/digest": "digest",
    "/categories": "categories",
    "/archive": "archive",
    "/settings": "settings",
  };
  return (
    <Link href={href} className="menu-tile">
      <span className="icon-circle">
        <Icon name={names[href] ?? "more"} size={36} />
      </span>
      <span className="font-semibold">{title}</span>
      <span className="menu-description">{description}</span>
    </Link>
  );
}
