import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopedToUser } from "@/lib/supabase/scoped";
import { buildBackupWorkbook } from "@/lib/backup";
import { uploadBackupToDrive } from "@/lib/google/sync";

export const maxDuration = 300;

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Порівняння без ранньої зупинки — щоб час відповіді не підказував правильний префікс. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface Failure {
  userId: string;
  error: string;
}

/**
 * Щотижнева копія на Google Диск для всіх, хто його підключив.
 * Розклад — у vercel.json; Vercel сам підставляє CRON_SECRET у заголовок
 * Authorization, тож маршрут відкритий для мережі, але не для сторонніх.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Без секрету маршрут не працює взагалі: пускати копіювання без перевірки
  // означало б дати будь-кому смикати вивантаження всіх книг.
  if (!secret) {
    return NextResponse.json(
      { error: "Копіювання за розкладом не налаштоване (CRON_SECRET)" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization") ?? "";
  if (!safeEqual(provided, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Невірний токен" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Рядок у google_credentials і є ознакою підключеного Диска — окремого
  // списку користувачів для копій не існує.
  const { data: connected, error } = await admin
    .from("google_credentials")
    .select("user_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (connected ?? []) as { user_id: string }[];

  let backedUp = 0;
  let skipped = 0;
  const failed: Failure[] = [];

  for (const { user_id: userId } of users) {
    try {
      const { buffer } = await buildBackupWorkbook(scopedToUser(admin, userId));

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const uploaded = await uploadBackupToDrive(userId, {
        name: `taison-${stamp}.xlsx`,
        mimeType: XLSX_MIME,
        data: buffer,
      });

      // null — Диск відключили або токен відкликали. Це не помилка крона.
      if (!uploaded) {
        skipped += 1;
        continue;
      }

      await admin
        .from("google_credentials")
        .update({ last_backup_at: new Date().toISOString() })
        .eq("user_id", userId);

      backedUp += 1;
    } catch (e) {
      // Збій одного не має зупиняти решту: наступного тижня буде нова спроба,
      // а решта користувачів отримає копію вже сьогодні.
      failed.push({
        userId,
        error: e instanceof Error ? e.message : "Невідома помилка",
      });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    users: users.length,
    backedUp,
    skipped,
    failed,
  });
}
