"use client";

import { Icon } from "@/components/Icon";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Що бачить людина, коли сторінка впала.
 *
 * У продакшені Next не віддає текст помилки в браузер — лишається тільки
 * digest. Тому показуємо саме його: за цим кодом помилка знаходиться в
 * журналі Vercel. Без цього екрана була б просто біла сторінка.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Сторінка впала:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <div className="mb-4 flex justify-center text-negative">
        <Icon name="warning" size={44} />
      </div>
      <h1 className="text-xl font-bold">Не вдалося відкрити сторінку</h1>
      <p className="mt-2 text-sm text-muted">
        Дані не втрачені — не відкрилася лише ця сторінка. Спробуйте ще раз, або
        поверніться на головну.
      </p>

      {error.digest && (
        <p className="mt-3 text-xs text-muted">
          Код помилки для журналу:{" "}
          <code className="rounded bg-line/60 px-1.5 py-0.5 font-mono">
            {error.digest}
          </code>
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" onClick={reset} className="btn-primary">
          Спробувати ще раз
        </button>
        <Link href="/" className="btn-ghost">
          На головну
        </Link>
      </div>
    </div>
  );
}
