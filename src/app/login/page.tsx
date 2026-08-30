"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Taison</h1>
          <p className="mt-1.5 text-sm text-muted">
            Витрати, доходи, підписки, цілі та завдання
          </p>
        </div>

        {status === "sent" ? (
          <div className="card text-center">
            <div className="mb-2 text-2xl">📬</div>
            <p className="font-semibold">Лист надіслано</p>
            <p className="mt-1.5 text-sm text-muted">
              Відкрийте посилання з листа на <strong className="text-ink">{email}</strong>.
              Воно одразу вас впустить — пароль не потрібен.
            </p>
            <button
              onClick={() => setStatus("idle")}
              className="btn-ghost mt-4 w-full"
              type="button"
            >
              Ввести іншу адресу
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="card">
            <label className="label" htmlFor="email">
              Ваш e-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            {error && <p className="mt-3 text-sm text-negative">{error}</p>}

            <button
              type="submit"
              disabled={status === "sending"}
              className="btn-primary mt-4 w-full"
            >
              {status === "sending" ? "Надсилаю…" : "Надіслати посилання для входу"}
            </button>

            <p className="mt-3 text-center text-xs text-muted">
              Ми надішлемо одноразове посилання. Паролів немає.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
