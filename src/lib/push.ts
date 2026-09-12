import webpush from "web-push";
import { createAdminClient } from "./supabase/admin";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushResult {
  sent: number;
  removed: number;
  failed: number;
}

/** Кому push-сервіс скаржиться, якщо ми поводимося погано. Вимога протоколу. */
function subject(): string | null {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;

  const owner = process.env.INGEST_OWNER_EMAIL?.trim();
  return owner ? `mailto:${owner}` : null;
}

export function pushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      subject(),
  );
}

function configure(): void {
  if (!pushConfigured()) {
    throw new Error(
      "Сповіщення не налаштовано: бракує VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY або адреси власника",
    );
  }
  webpush.setVapidDetails(
    subject()!,
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failures: number;
}

/**
 * Надсилає одне повідомлення на всі пристрої користувача.
 *
 * Підписка, на яку push-сервіс відповів 404 або 410, мертва назавжди:
 * застосунок знесли або дозвіл відкликали. Такі рядки прибираємо одразу,
 * інакше список пристроїв росте сміттям, а кожне нагадування витрачає час
 * на завідомо недосяжні адреси.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  configure();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failures")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  const rows = (data as SubscriptionRow[]) ?? [];
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  const body = JSON.stringify(payload);

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        body,
      );
      result.sent += 1;
      await supabase
        .from("push_subscriptions")
        .update({ last_sent_at: new Date().toISOString(), failures: 0 })
        .eq("id", row.id);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", row.id);
        result.removed += 1;
      } else {
        result.failed += 1;
        await supabase
          .from("push_subscriptions")
          .update({ failures: row.failures + 1 })
          .eq("id", row.id);
      }
    }
  }

  return result;
}
