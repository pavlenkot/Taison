"use client";

import { useEffect } from "react";

/**
 * Реєструє service worker. Без нього застосунок без мережі показував би
 * порожню сторінку браузера, а нагадування не мали б кому прийти:
 * push на вебі доставляється саме в service worker.
 */
export function ServiceWorkerSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Не вдалося зареєструвати service worker:", error);
      });
    };

    // Реєструємо після завантаження сторінки: інакше запит за sw.js
    // змагався б за мережу з тим, що людина зараз відкриває.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
