"use client";

import { useEffect } from "react";

/**
 * Запасний екран для випадку, коли впав сам кореневий макет: тоді
 * звичайний error.tsx не відмальовується, і сторінка лишилася б порожньою.
 * Стилі тут вбудовані навмисно — таблиця стилів у цей момент може бути
 * недоступна.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Застосунок впав:", error);
  }, [error]);

  return (
    <html lang="uk">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#080D12",
          color: "#F5F5F7",
        }}
      >
        <div style={{ maxWidth: 380, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, margin: 0 }}>Застосунок не запустився</h1>
          <p
            style={{
              fontSize: 14,
              color: "#ADADAD",
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            Дані в безпеці. Перезавантажте сторінку; якщо не допоможе —
            спробуйте пізніше.
          </p>

          {error.digest && (
            <p style={{ fontSize: 12, color: "#ADADAD", marginTop: 12 }}>
              Код помилки: <code>{error.digest}</code>
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              color: "#080D12",
              background: "linear-gradient(135deg,#FF944D,#FF7E48)",
              border: "none",
              borderRadius: 18,
              cursor: "pointer",
            }}
          >
            Перезавантажити
          </button>
        </div>
      </body>
    </html>
  );
}
