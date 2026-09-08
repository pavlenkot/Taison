"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  function nextPath(): string {
    return new URLSearchParams(window.location.search).get("next") ?? "/";
  }

  async function signInWithGoogle() {
    setError("");
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // drive.file — доступ лише до того, що застосунок сам створив.
        // Ширші дозволи вимагали б перевірки застосунку в Google.
        scopes: "https://www.googleapis.com/auth/drive.file",
        // Без цих двох параметрів Google не віддає refresh-токен,
        // і доступ до Диска помер би за годину.
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
      },
    });

    if (error) setError(error.message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}`,
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
          <div className="space-y-3">
            <div className="card">
              <button type="button" onClick={signInWithGoogle} className="btn-primary w-full">
                Увійти через Google
              </button>
              <p className="mt-2 text-center text-xs text-muted">
                Заразом підключиться Google Диск: чеки й документи
                складатимуться в теку «Taison» на вашому Диску
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" />
              або
              <span className="h-px flex-1 bg-line" />
            </div>

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
              Диск при цьому не підключається.
            </p>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
