import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser, pushConfigured } from "@/lib/push";

/** Перевірка, що нагадування справді доходять — до того, як на них покластися. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Потрібен вхід" }, { status: 401 });

  if (!pushConfigured()) {
    return NextResponse.json(
      { error: "Сповіщення не налаштовано на сервері" },
      { status: 503 },
    );
  }

  try {
    const result = await sendPushToUser(user.id, {
      title: "Taison",
      body: "Перевірка: нагадування працюють.",
      url: "/settings",
      tag: "taison-test",
    });

    if (result.sent === 0 && result.removed > 0) {
      return NextResponse.json(
        { error: "Підписка застаріла — увімкніть нагадування ще раз" },
        { status: 409 },
      );
    }
    if (result.sent === 0) {
      return NextResponse.json({ error: "Немає жодного пристрою" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не вдалося надіслати" },
      { status: 500 },
    );
  }
}
