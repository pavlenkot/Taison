import Link from "next/link";

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
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <span className="text-3xl opacity-60">{icon}</span>
      <p className="text-sm text-muted">{text}</p>
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
  const colour =
    tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-ink";

  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${colour}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Розкривна форма додавання — на нативному <details>, без клієнтського JS. */
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
    <details open={open} className="card mb-4 [&[open]>summary]:mb-4">
      <summary className="cursor-pointer list-none select-none text-sm font-semibold text-accent marker:content-none">
        + {label}
      </summary>
      {children}
    </details>
  );
}

export function SectionLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="card flex items-center gap-3 transition hover:border-accent/40"
    >
      <span className="text-xl">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted">{description}</span>
      </span>
      <span className="ml-auto text-muted">›</span>
    </Link>
  );
}
