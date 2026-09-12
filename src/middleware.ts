import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Шляхи, доступні без входу.
 *
 * Сюди входять не лише сторінки входу. Service worker браузер завантажує
 * власним запитом без куків — завернутий на /login, він просто не
 * зареєструється, і разом із ним помруть і офлайн, і сповіщення.
 * Маршрути за розкладом і приймання сканів приходять із заголовком
 * Authorization замість сесії й перевіряють себе самі.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/auth",
  "/api/ingest",
  "/api/cron",
  "/manifest.json",
  "/icon",
  "/sw.js",
  "/offline.html",
];

/**
 * Без адреси й ключа Supabase клієнт не створюється, а кидає — і то ще до
 * try/catch нижче. Для Vercel це «MIDDLEWARE_INVOCATION_FAILED» на КОЖНІЙ
 * адресі, зі сторінкою входу включно: порожня п'ятисотка, з якої не видно,
 * що бракує однієї змінної. Тому перевіряємо самі й кажемо прямо.
 *
 * Відповідаємо відмовою, а не пропускаємо далі: без Supabase перевірити
 * сесію нічим, і пускати всередину не можна.
 */
function missingEnv(): string[] {
  return [
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name as string);
}

function setupNeeded(missing: string[]): NextResponse {
  const list = missing.map((name) => `<li><code>${name}</code></li>`).join("");
  return new NextResponse(
    `<!doctype html><html lang="uk"><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>Застосунок не налаштовано</title>
     <style>
       body{font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.5rem;color:#111}
       code{background:#f1f1f1;padding:.1em .35em;border-radius:.25em;font-size:.95em}
       li{margin:.3em 0}
       @media(prefers-color-scheme:dark){body{background:#111;color:#eee}code{background:#262626}}
     </style>
     <h1>Застосунок не налаштовано</h1>
     <p>На сервері бракує змінних оточення:</p>
     <ul>${list}</ul>
     <p>Додайте їх у налаштуваннях проєкту (Vercel → Settings → Environment
     Variables) і перезберіть застосунок — уже додані змінні не потрапляють
     у збірку, яка вже відбулася.</p>
     <p>Значення — у панелі Supabase, Settings → API.</p>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function middleware(request: NextRequest) {
  const missing = missingEnv();
  if (missing.length > 0) return setupNeeded(missing);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser() звертається до Supabase і заразом освіжає сесію.
  // Якщо Supabase недоступний, вважаємо, що сесії немає, і ведемо на вхід:
  // мережевий збій не має валити застосунок п'ятисоткою.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  /**
   * getUser() міг освіжити сесію і видати нові куки — вони лежать у `response`.
   * Перенаправлення створює нову відповідь, тож куки треба перекласти в неї:
   * інакше браузер залишиться зі старим refresh-токеном, який Supabase уже
   * анулював, і наступний запит викине користувача на вхід.
   */
  const redirectTo = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return redirectTo(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirectTo(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
