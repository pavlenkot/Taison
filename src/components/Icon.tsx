import type { CSSProperties } from "react";
import { categoryColor, categoryGlyph } from "@/lib/categoryStyle";

export type IconName =
  | "overview"
  | "transactions"
  | "scan"
  | "documents"
  | "payments"
  | "tasks"
  | "goals"
  | "analytics"
  | "receipts"
  | "digest"
  | "categories"
  | "archive"
  | "settings"
  | "more"
  | "plus"
  | "calendar"
  | "search"
  | "filter"
  | "close"
  | "chevron"
  | "eye"
  | "hidden"
  | "bars"
  | "download"
  | "cloud"
  | "bell"
  | "logout"
  | "check"
  | "warning"
  | "trash"
  | "folder"
  | string;
export function Icon({
  name,
  size = 24,
  className = "",
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  let art;
  switch (name) {
    case "overview":
      art = (
        <>
          <rect x="3" y="6" width="26" height="21" rx="4" />
          <path d="M3 12h26" stroke="#080D12" strokeWidth="3" />
          <rect x="20" y="21" width="5" height="3" fill="#080D12" />
        </>
      );
      break;
    case "transactions":
    case "tasks":
      art = (
        <>
          <path
            d="M14 8h13M14 16h13M14 24h13"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          {name === "tasks" ? (
            <>
              <path
                d="m4 8 3 3 5-6"
                fill="none"
                stroke="#69DAB0"
                strokeWidth="3"
              />
              <path
                d="m4 17 3 3 5-6"
                fill="none"
                stroke="#7D8FFF"
                strokeWidth="3"
              />
              <circle cx="7" cy="25" r="2" />
            </>
          ) : (
            <>
              <circle cx="6" cy="8" r="2" />
              <circle cx="6" cy="16" r="2" />
              <circle cx="6" cy="24" r="2" />
            </>
          )}
        </>
      );
      break;
    case "scan":
      art = (
        <path
          d="M11 4H7a3 3 0 0 0-3 3v4m17-7h4a3 3 0 0 1 3 3v4M4 21v4a3 3 0 0 0 3 3h4m17-7v4a3 3 0 0 1-3 3h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      );
      break;
    case "documents":
    case "education":
      art = (
        <>
          <path d="M7 3h13l6 7v19H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" />
          <path d="M19 3v8h7" fill="#81D8D0" />
          <path
            d="M10 17h11M10 22h8"
            stroke="#080D12"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      );
      break;
    case "payments":
    case "cash":
      art = (
        <>
          <rect x="3" y="8" width="26" height="21" rx="4" />
          <path
            d="M5 9V5l20-2v6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <rect x="17" y="15" width="14" height="11" rx="3" fill="#7D8FFF" />
          <circle cx="23" cy="20.5" r="2" fill="#080D12" />
        </>
      );
      break;
    case "goals":
      art = (
        <>
          <circle cx="15" cy="17" r="12" />
          <circle cx="15" cy="17" r="8" fill="#080D12" />
          <circle cx="15" cy="17" r="5" />
          <circle cx="15" cy="17" r="2.8" fill="#FA5255" />
          <path d="m19 12 8-8v6l-5 5" fill="#969FEF" />
        </>
      );
      break;
    case "analytics":
      art = (
        <>
          <path d="M15 3a14 14 0 1 0 13 20L15 17Z" fill="#969FEF" />
          <path d="M18 3v12h12A13 13 0 0 0 18 3" fill="#81D8D0" />
          <path d="m20 18 9 8a14 14 0 0 0 2-8Z" fill="#FF944D" />
        </>
      );
      break;
    case "receipts":
      art = (
        <>
          <path d="m9 4 3 2 4-2 4 2 3-2v25l-3-2-4 2-4-2-3 2Z" />
          <path d="M12 11h8M12 16h8M12 21h5" stroke="#080D12" strokeWidth="2" />
          <path
            d="M6 10V4H2m24 0h4v6M2 22v6h4m20 0h4v-6"
            stroke="#FF944D"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
      break;
    case "calendar":
    case "digest":
      art = (
        <>
          <rect x="3" y="6" width="26" height="24" rx="4" />
          <path
            d="M3 13h26"
            stroke={name === "digest" ? "#969FEF" : "#080D12"}
            strokeWidth="6"
          />
          <path
            d="M9 3v6M23 3v6"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M9 20h13M9 25h7"
            stroke="#080D12"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </>
      );
      break;
    case "categories":
    case "more":
      art = (
        <>
          {[
            [3, 3],
            [18, 3],
            [3, 18],
            [18, 18],
          ].map(([x, y], i) => (
            <rect
              key={i}
              x={x}
              y={y}
              width="11"
              height="11"
              rx="3"
              fill={
                name === "categories"
                  ? ["#FF944D", "#81D8D0", "#969FEF", "#69DAB0"][i]
                  : "currentColor"
              }
            />
          ))}
        </>
      );
      break;
    case "archive":
      art = (
        <>
          <rect x="3" y="11" width="26" height="19" rx="3" fill="#969FEF" />
          <rect x="2" y="3" width="28" height="6" rx="2" fill="#969FEF" />
          <rect x="11" y="18" width="10" height="3" rx="1.5" />
        </>
      );
      break;
    case "settings":
      art = (
        <>
          <path d="m13 2 6 0 2 4 4 1 4 5-2 4 1 4-4 5-4 0-3 4-6 0-2-4-4-1-4-5 2-4-1-4 4-5 4 0Z" />
          <circle cx="16" cy="16" r="7" fill="#080D12" />
          <circle cx="16" cy="16" r="4" fill="#81D8D0" />
        </>
      );
      break;
    case "plus":
      art = (
        <path
          d="M16 5v22M5 16h22"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      );
      break;
    case "search":
      art = (
        <>
          <circle
            cx="13"
            cy="13"
            r="9"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path d="m20 20 8 8" stroke="currentColor" strokeWidth="3" />
        </>
      );
      break;
    case "filter":
      art = <path d="M3 5h26L19 17v10l-6-3V17Z" />;
      break;
    case "close":
      art = (
        <path
          d="m7 7 18 18M25 7 7 25"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      );
      break;
    case "chevron":
      art = (
        <path
          d="m12 6 10 10-10 10"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
      );
      break;
    case "eye":
    case "hidden":
      art = (
        <>
          <path d="M2 16Q16-3 30 16Q16 35 2 16Z" />
          <circle cx="16" cy="16" r="6" fill="#080D12" />
          <circle cx="16" cy="16" r="3" />
          {name === "hidden" && (
            <path d="m4 3 24 26" stroke="#080D12" strokeWidth="5" />
          )}
        </>
      );
      break;
    case "bars":
      art = (
        <>
          <rect x="4" y="13" width="5" height="16" rx="2.5" />
          <rect x="14" y="3" width="5" height="26" rx="2.5" />
          <rect x="24" y="8" width="5" height="21" rx="2.5" />
        </>
      );
      break;
    case "download":
      art = (
        <>
          <path
            d="M16 3v18m-7-7 7 7 7-7M5 23v6h22v-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
      break;
    case "cloud":
      art = (
        <>
          <path d="M8 26A7 7 0 0 1 6 12a10 10 0 0 1 19 1A7 7 0 0 1 25 26Z" />
          <path
            d="M16 29V14m-6 6 6-6 6 6"
            fill="none"
            stroke="#7D8FFF"
            strokeWidth="3"
          />
        </>
      );
      break;
    case "bell":
      art = (
        <>
          <path d="M16 3a8 8 0 0 0-8 8v8l-4 5h24l-4-5v-8a8 8 0 0 0-8-8Z" />
          <path d="M12 26a4 4 0 0 0 8 0" fill="#FF944D" />
        </>
      );
      break;
    case "check":
      art = (
        <path
          d="m5 16 7 7L27 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
      break;
    case "warning":
      art = (
        <>
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <rect x="14.5" y="7" width="3" height="12" rx="1.5" />
          <circle cx="16" cy="24" r="1.5" />
        </>
      );
      break;
    case "trash":
      art = (
        <>
          <path d="M7 11h18l-2 19H9Z" />
          <rect x="4" y="6" width="24" height="3" rx="1.5" />
          <rect x="12" y="2" width="8" height="3" rx="1.5" />
          <path d="M13 15v10M19 15v10" stroke="#080D12" strokeWidth="2" />
        </>
      );
      break;
    case "logout":
      art = (
        <path
          d="M13 3H4v26h9M12 16h17m-7-7 7 7-7 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      );
      break;
    case "folder":
      art = (
        <>
          <path d="M2 8a3 3 0 0 1 3-3h9l4 4h9a3 3 0 0 1 3 3v16H2Z" />
          <path d="M2 13h28v15H2Z" fill="#7D8FFF" />
        </>
      );
      break;
    case "food":
      art = (
        <>
          <path d="M17 10c-10-8-18 4-11 17 3 6 7 2 10 2s7 4 10-2c7-13-1-25-9-17Z" />
          <path d="M16 10c-1-6 3-9 8-9 0 5-4 8-8 9Z" />
        </>
      );
      break;
    case "transport":
    case "travel":
      art = (
        <>
          <rect x="5" y="2" width="22" height="24" rx="5" />
          <rect x="9" y="6" width="14" height="8" rx="2" fill="#080D12" />
          <circle cx="10" cy="20" r="2" fill="#080D12" />
          <circle cx="22" cy="20" r="2" fill="#080D12" />
          <path d="m10 25-5 6m17-6 5 6" stroke="currentColor" strokeWidth="3" />
        </>
      );
      break;
    case "shopping":
      art = (
        <>
          <rect x="4" y="10" width="24" height="21" rx="4" />
          <path
            d="M10 13V7a6 6 0 0 1 12 0v6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <circle cx="10" cy="15" r="1.5" fill="#080D12" />
          <circle cx="22" cy="15" r="1.5" fill="#080D12" />
        </>
      );
      break;
    case "home":
      art = (
        <>
          <path d="m1 15 15-13 15 13-4 1v14H5V16Z" />
          <rect x="13" y="19" width="6" height="11" rx="2" fill="#080D12" />
        </>
      );
      break;
    case "health":
      art = (
        <>
          <rect x="3" y="3" width="26" height="26" rx="7" />
          <path d="M16 8v16M8 16h16" stroke="#080D12" strokeWidth="5" />
        </>
      );
      break;
    case "gift":
      art = (
        <>
          <rect x="3" y="14" width="26" height="16" rx="3" />
          <rect x="1" y="9" width="30" height="5" rx="2" />
          <path
            d="M16 9c-15-1-9-13 0-2 9-11 15 1 0 2M16 14v16"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
        </>
      );
      break;
    case "work":
      art = (
        <>
          <rect x="2" y="10" width="28" height="21" rx="4" />
          <path
            d="M10 10V4h12v6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path d="M2 19h28" stroke="#080D12" strokeWidth="2" />
          <rect x="13" y="17" width="6" height="5" rx="1" fill="#080D12" />
        </>
      );
      break;
    case "subscriptions":
      art = <path d="m9 3 20 13L9 29Z" />;
      break;
    default:
      art = (
        <>
          <rect x="3" y="4" width="26" height="25" rx="5" />
          <path d="M3 12h26M16 4v8" stroke="#080D12" strokeWidth="2.5" />
        </>
      );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {art}
    </svg>
  );
}
export function CategoryIcon({
  category,
  size = 24,
}: {
  category?: { id?: string; slug?: string; icon?: string | null } | null;
  size?: number;
}) {
  const color = categoryColor(category ?? {});
  return (
    <span className="icon-circle" style={{ color, background: color + "16" }}>
      <Icon name={categoryGlyph(category?.icon, category?.slug)} size={size} />
    </span>
  );
}
