import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { saveGoogleCredentials, googleConfigured } from "@/lib/google/tokens";
import { encryptionConfigured } from "@/lib/crypto";

/**
 * Токени Google приходять у сесії рівно один раз — тут, одразу після обміну
 * коду. Supabase їх не зберігає і не оновлює, тож якщо не перехопити зараз,
 * доступ до Диска буде втрачено до наступного входу.
 */
async function captureGoogleTokens(session: Session | null): Promise<string | null> {
  if (!session?.provider_token && !session?.provider_refresh_token) return null;
  if (!session.user) return null;

  if (!googleConfigured() || !encryptionConfigured()) {
    return "google_not_configured";
  }

  try {
    await saveGoogleCredentials({
      userId: session.user.id,
      refreshToken: session.provider_refresh_token ?? null,
      accessToken: session.provider_token ?? null,
      email: session.user.email ?? null,
      scope: "drive.file",
    });
    return null;
  } catch {
    // Вхід уже відбувся; про непідключений Диск скажемо в налаштуваннях.
    return "drive_not_linked";
  }
}

/**
 * Куди повертати після входу. Приймаємо лише відносний шлях у межах
 * застосунку: з рядка запиту сюди може прийти будь-що, і абсолютна адреса
 * перетворила б посилання на вхід у перекидання на чужий сайт — уже після
 * того, як людина ввела дані й довіряє сторінці.
 */
function safeNext(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  // «//evil.com» і «/\\evil.com» браузер читає як зовнішню адресу.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const warning = await captureGoogleTokens(data.session);
      const url = new URL(next, origin);
      if (warning) url.searchParams.set("drive", warning);
      return NextResponse.redirect(url);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}
