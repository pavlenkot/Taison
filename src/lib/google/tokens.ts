import { createAdminClient } from "../supabase/admin";
import { encryptSecret, decryptSecret } from "../crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/** Оновлюємо трохи заздалегідь, щоб токен не протух посеред завантаження файлу. */
const EXPIRY_MARGIN_MS = 60_000;

export interface DriveFolders {
  root: string | null;
  receipts: string | null;
  documents: string | null;
  backups: string | null;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Зберігає токени після входу через Google.
 * Refresh-токен Google віддає лише один раз — при першій згоді або коли
 * її запитали заново з prompt=consent. Якщо цього разу він не прийшов,
 * старий не перезаписуємо, інакше зв'язок із Диском обірвався б.
 */
export async function saveGoogleCredentials(params: {
  userId: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiresIn?: number | null;
  email?: string | null;
  scope?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();

  const row: Record<string, unknown> = {
    user_id: params.userId,
    google_email: params.email ?? null,
    scope: params.scope ?? null,
  };

  if (params.refreshToken) {
    row.refresh_token_enc = encryptSecret(params.refreshToken);
  }

  if (params.accessToken) {
    row.access_token_enc = encryptSecret(params.accessToken);
    row.access_token_expires_at = new Date(
      Date.now() + (params.expiresIn ?? 3600) * 1000,
    ).toISOString();
  }

  const { data: existing } = await supabase
    .from("google_credentials")
    .select("user_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("google_credentials")
      .update(row)
      .eq("user_id", params.userId);
    if (error) throw new Error(error.message);
    return;
  }

  if (!params.refreshToken) {
    // Без refresh-токена запис марний: доступ помре за годину й не відновиться.
    throw new Error(
      "Google не повернув refresh-токен. Відкликайте доступ у налаштуваннях " +
        "акаунта Google і увійдіть ще раз, щоб згоду запитали наново.",
    );
  }

  const { error } = await supabase.from("google_credentials").insert(row);
  if (error) throw new Error(error.message);
}

/** Дійсний токен доступу; за потреби оновлюється. null — Диск не підключено. */
export async function getAccessToken(userId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("google_credentials")
    .select("refresh_token_enc, access_token_enc, access_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const expiresAt = data.access_token_expires_at
    ? new Date(data.access_token_expires_at).getTime()
    : 0;

  if (data.access_token_enc && expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
    return decryptSecret(data.access_token_enc);
  }

  const refreshToken = decryptSecret(data.refresh_token_enc);
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    // invalid_grant означає, що доступ відкликано або протерміновано —
    // сенсу тримати запис немає, хай користувач підключить Диск наново.
    if (detail.includes("invalid_grant")) {
      await supabase.from("google_credentials").delete().eq("user_id", userId);
      throw new Error("Доступ до Google Диска втрачено. Підключіть його заново в налаштуваннях.");
    }
    throw new Error(`Google не оновив токен: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { access_token: string; expires_in: number };

  await supabase
    .from("google_credentials")
    .update({
      access_token_enc: encryptSecret(payload.access_token),
      access_token_expires_at: new Date(Date.now() + payload.expires_in * 1000).toISOString(),
    })
    .eq("user_id", userId);

  return payload.access_token;
}

export async function loadFolders(userId: string): Promise<DriveFolders> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("google_credentials")
    .select("drive_root_id, drive_receipts_id, drive_documents_id, drive_backups_id")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    root: data?.drive_root_id ?? null,
    receipts: data?.drive_receipts_id ?? null,
    documents: data?.drive_documents_id ?? null,
    backups: data?.drive_backups_id ?? null,
  };
}

export async function saveFolders(userId: string, folders: DriveFolders): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("google_credentials")
    .update({
      drive_root_id: folders.root,
      drive_receipts_id: folders.receipts,
      drive_documents_id: folders.documents,
      drive_backups_id: folders.backups,
    })
    .eq("user_id", userId);
}

export async function disconnectGoogle(userId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("google_credentials")
    .select("refresh_token_enc")
    .eq("user_id", userId)
    .maybeSingle();

  // Відкликаємо доступ у Google, а не просто забуваємо токен:
  // інакше застосунок назавжди лишиться у списку дозволів акаунта.
  if (data?.refresh_token_enc) {
    try {
      await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(data.refresh_token_enc) }),
      });
    } catch {
      // Не змогли відкликати — все одно прибираємо запис у себе.
    }
  }

  await supabase.from("google_credentials").delete().eq("user_id", userId);
}
