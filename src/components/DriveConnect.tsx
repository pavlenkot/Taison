"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Підключення Диска — це той самий вхід через Google, але з проханням про
 * доступ до теки. prompt=consent обов'язковий: без нього Google вважає,
 * що згода вже є, і refresh-токен не віддає — а без нього доступ помре
 * за годину й не відновиться.
 */
export function DriveConnect({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true);
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "https://www.googleapis.com/auth/drive.file",
        queryParams: { access_type: "offline", prompt: "consent" },
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
      },
    });

    if (error) {
      setError(error.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={connect} disabled={busy} className="btn-primary w-full">
        {busy ? "Відкриваю Google…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-negative">{error}</p>}
    </>
  );
}
