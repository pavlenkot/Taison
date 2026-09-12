"use client";

import { useEffect, useState } from "react";

type State = "checking" | "unsupported" | "needs-install" | "off" | "on" | "denied";

/**
 * Ключ VAPID приходить у base64url, а pushManager чекає на байти.
 * Буфер створюємо явно: типи вимагають саме ArrayBuffer, а не будь-який
 * ArrayBufferLike, під який підпадає і SharedArrayBuffer.
 */
function toUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);

  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function looksLikeIos(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS прикидається Mac, тож перевіряємо ще й наявність дотику.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        typeof Notification !== "undefined";

      if (!supported) {
        // На iOS push працює лише у застосунку, доданому на екран «Додому».
        if (!cancelled) setState(looksLikeIos() ? "needs-install" : "unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!cancelled) setState(existing ? "on" : "off");
    })().catch(() => {
      if (!cancelled) setState("unsupported");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setMessage("");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toUint8Array(vapidPublicKey),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Помилка");

      setState("on");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не вдалося увімкнути");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
          method: "DELETE",
        });
        await subscription.unsubscribe();
      }

      setState("off");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Не вдалося вимкнути");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const payload = await response.json();
      setMessage(response.ok ? "Надіслано — перевірте сповіщення" : payload.error);
    } catch {
      setMessage("Не вдалося надіслати");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking") {
    return <p className="text-sm text-muted">Перевіряю…</p>;
  }

  if (state === "needs-install") {
    return (
      <p className="text-sm text-muted">
        На iPhone та iPad нагадування працюють лише в застосунку, доданому на
        екран «Додому». Відкрийте цю сторінку в Safari, натисніть «Поділитися» →
        «На екран «Додому»», і поверніться сюди вже із застосунку.
      </p>
    );
  }

  if (state === "unsupported") {
    return <p className="text-sm text-muted">Цей браузер не вміє надсилати сповіщення.</p>;
  }

  if (state === "denied") {
    return (
      <p className="text-sm text-muted">
        Сповіщення заблоковані в налаштуваннях браузера. Дозвольте їх для цього
        сайту й поверніться сюди.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {state === "on" ? (
          <>
            <button type="button" onClick={sendTest} disabled={busy} className="btn-primary">
              Надіслати перевірку
            </button>
            <button type="button" onClick={disable} disabled={busy} className="btn-ghost">
              Вимкнути
            </button>
          </>
        ) : (
          <button type="button" onClick={enable} disabled={busy} className="btn-primary w-full">
            {busy ? "Вмикаю…" : "Увімкнути нагадування"}
          </button>
        )}
      </div>

      {message && <p className="mt-2 text-sm text-muted">{message}</p>}

      <p className="mt-2 text-xs text-muted">
        Раз на день, якщо є що сказати: строки в документах, платежі на підході
        й завдання на сьогодні. Мовчить, коли нічого не горить.
      </p>
    </>
  );
}
