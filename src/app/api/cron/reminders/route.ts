import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser, pushConfigured } from "@/lib/push";
import { formatMoney, isoDate, plural } from "@/lib/format";

export const maxDuration = 120;

/** Порівняння без ранньої зупинки: час відповіді не має підказувати префікс. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** За скільки днів наперед попереджати про строк. */
const HORIZON_DAYS = 3;

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

interface Line {
  text: string;
  urgent: boolean;
}

async function buildDigest(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<{ title: string; body: string; url: string } | null> {
  const today = isoDate();
  const horizon = inDays(HORIZON_DAYS);

  const [{ data: docs }, { data: subs }, { data: tasks }] = await Promise.all([
    supabase
      .from("documents")
      .select("issuer, subject, deadline")
      .eq("user_id", userId)
      .not("deadline", "is", null)
      .lte("deadline", horizon)
      .order("deadline")
      .limit(5),
    supabase
      .from("subscriptions")
      .select("name, amount_cents, next_due_on")
      .eq("user_id", userId)
      .eq("active", true)
      .lte("next_due_on", horizon)
      .order("next_due_on")
      .limit(5),
    supabase
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .is("archived_at", null)
      .lte("due_on", today),
  ]);

  const lines: Line[] = [];

  for (const d of (docs as { issuer: string | null; subject: string | null; deadline: string }[]) ?? []) {
    const overdue = d.deadline < today;
    lines.push({
      text: `${d.issuer ?? d.subject ?? "Документ"} — строк ${overdue ? "минув" : d.deadline === today ? "сьогодні" : d.deadline}`,
      urgent: overdue || d.deadline === today,
    });
  }

  for (const s of (subs as { name: string; amount_cents: number; next_due_on: string }[]) ?? []) {
    const overdue = s.next_due_on < today;
    lines.push({
      text: `${s.name} ${formatMoney(s.amount_cents)} — ${overdue ? "прострочено" : s.next_due_on === today ? "сьогодні" : s.next_due_on}`,
      urgent: overdue || s.next_due_on === today,
    });
  }

  const taskCount = ((tasks as { id: string }[]) ?? []).length;
  if (taskCount > 0) {
    lines.push({
      text: `${taskCount} ${plural(taskCount, "завдання", "завдання", "завдань")} на сьогодні`,
      urgent: false,
    });
  }

  // Мовчимо, коли нічого не горить: нагадування, що приходить щодня без
  // приводу, перестають читати вже на третій день.
  if (lines.length === 0) return null;

  const urgent = lines.some((line) => line.urgent);
  return {
    title: urgent ? "Є термінове" : "Нагадування",
    body: lines
      .slice(0, 4)
      .map((line) => line.text)
      .join("\n"),
    url: urgent ? "/documents" : "/",
  };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET не налаштовано — розсилка вимкнена" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization") ?? "";
  if (!safeEqual(provided, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Невірний токен" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ error: "Сповіщення не налаштовано" }, { status: 503 });
  }

  const supabase = createAdminClient();

  // Нагадувати є сенс лише тим, хто підписався хоча б одним пристроєм.
  const { data, error } = await supabase.from("push_subscriptions").select("user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const userIds = [...new Set(((data as { user_id: string }[]) ?? []).map((r) => r.user_id))];

  let notified = 0;
  let quiet = 0;
  const failures: string[] = [];

  for (const userId of userIds) {
    try {
      const digest = await buildDigest(supabase, userId);
      if (!digest) {
        quiet += 1;
        continue;
      }

      const result = await sendPushToUser(userId, { ...digest, tag: "taison-reminder" });
      if (result.sent > 0) notified += 1;
    } catch (e) {
      // Збій в одного не має зупиняти розсилку решті.
      failures.push(e instanceof Error ? e.message : "невідома помилка");
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, notified, quiet, failures });
}
