import { formatMoney } from "./format";
import type { Period } from "./periods";
import type { Transaction } from "./types";

export interface Insight {
  id: string;
  icon: string;
  headline: string;
  detail: string;
  tone: "neutral" | "good" | "warn";
}

export interface Digest {
  period: Period;
  totalCents: number;
  previousCents: number;
  /** null, якщо порівнювати нема з чим. */
  deltaPct: number | null;
  count: number;
  biggest: Transaction[];
  /** Медіана: половина покупок дешевша за це число. */
  smallThresholdCents: number;
  smallCount: number;
  smallTotalCents: number;
  daysInPeriod: number;
  daysWithSpending: number;
  averagePerDayCents: number;
  topCategory: { name: string; icon: string; cents: number; deltaPct: number | null } | null;
  insights: Insight[];
}

function sum(rows: Transaction[]): number {
  return rows.reduce((total, row) => total + row.amount_cents, 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function percentChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

function categoryTotals(rows: Transaction[]): Map<string, { cents: number; icon: string }> {
  const out = new Map<string, { cents: number; icon: string }>();
  for (const row of rows) {
    const name = row.categories?.name ?? "Без категорії";
    const previous = out.get(name);
    out.set(name, {
      cents: (previous?.cents ?? 0) + row.amount_cents,
      icon: previous?.icon ?? row.categories?.icon ?? "📦",
    });
  }
  return out;
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Збирає підсумок за період: скільки, на що, і — головне — які висновки
 * з цього видно. Дрібні покупки визначаються медіаною, а не вигаданим
 * порогом: «половина твоїх покупок дешевша за X» пояснює саме себе.
 */
export function buildDigest(
  current: Transaction[],
  previous: Transaction[],
  period: Period,
): Digest {
  const expenses = current.filter((row) => row.kind === "expense");
  const previousExpenses = previous.filter((row) => row.kind === "expense");

  const totalCents = sum(expenses);
  const previousCents = sum(previousExpenses);
  const deltaPct = percentChange(totalCents, previousCents);

  const sortedByAmount = [...expenses].sort((a, b) => b.amount_cents - a.amount_cents);
  const biggest = sortedByAmount.slice(0, 3);

  const smallThresholdCents = median(expenses.map((row) => row.amount_cents));
  const small = expenses.filter((row) => row.amount_cents <= smallThresholdCents);
  const smallTotalCents = sum(small);

  const daysInPeriod = daysBetween(period.from, period.to);
  const spendingDays = new Set(expenses.map((row) => row.occurred_on));
  const daysWithSpending = spendingDays.size;
  const averagePerDayCents = daysInPeriod > 0 ? Math.round(totalCents / daysInPeriod) : 0;

  const nowByCategory = categoryTotals(expenses);
  const beforeByCategory = categoryTotals(previousExpenses);

  const topEntry = [...nowByCategory.entries()].sort((a, b) => b[1].cents - a[1].cents)[0];
  const topCategory = topEntry
    ? {
        name: topEntry[0],
        icon: topEntry[1].icon,
        cents: topEntry[1].cents,
        deltaPct: percentChange(topEntry[1].cents, beforeByCategory.get(topEntry[0])?.cents ?? 0),
      }
    : null;

  const share = (cents: number) =>
    totalCents > 0 ? Math.round((cents / totalCents) * 100) : 0;

  const insights: Insight[] = [];
  const periodWord = period.kind === "week" ? "цього тижня" : "цього місяця";
  const previousWord = period.kind === "week" ? "минулого тижня" : "минулого місяця";

  // 1. Скільки всього і куди рухається
  if (deltaPct === null) {
    insights.push({
      id: "total",
      icon: "💶",
      headline: `Витрачено ${formatMoney(totalCents)}`,
      detail:
        `${expenses.length} ` +
        `${plural(expenses.length, "операція", "операції", "операцій")}. ` +
        "Порівнювати поки нема з чим — це перший такий період з даними.",
      tone: "neutral",
    });
  } else {
    const grew = deltaPct > 0;
    insights.push({
      id: "total",
      icon: grew ? "📈" : "📉",
      headline: `Витрачено ${formatMoney(totalCents)}`,
      detail:
        deltaPct === 0
          ? `Рівно стільки ж, скільки ${previousWord}.`
          : `Це на ${Math.abs(deltaPct)}% ${grew ? "більше" : "менше"}, ніж ${previousWord} — ` +
            `тоді вийшло ${formatMoney(previousCents)}.`,
      tone: grew ? "warn" : "good",
    });
  }

  // 2. Найбільші покупки
  if (biggest.length > 0) {
    const top = biggest[0];
    const topThreeCents = sum(biggest);
    insights.push({
      id: "biggest",
      icon: "🔝",
      headline: `Найбільша покупка — ${formatMoney(top.amount_cents)}`,
      detail:
        `${top.merchant ?? top.categories?.name ?? "Без назви"}. ` +
        (biggest.length > 1
          ? `Три найдорожчі разом склали ${formatMoney(topThreeCents)} — ` +
            `${share(topThreeCents)}% усіх витрат ${periodWord}.`
          : "Це поки єдина велика покупка."),
      tone: "neutral",
    });
  }

  // 3. Дрібниці, що склалися у велику суму — заради цього підсумок і потрібен
  if (expenses.length >= 4 && smallCountIsMeaningful(small.length)) {
    const biggestSingle = biggest[0]?.amount_cents ?? 0;
    const beatsBiggest = smallTotalCents > biggestSingle;

    insights.push({
      id: "small-sum",
      icon: "🪙",
      headline:
        `${small.length} ` +
        `${plural(small.length, "дрібна покупка", "дрібні покупки", "дрібних покупок")} ` +
        `${plural(small.length, "склала", "склали", "склали")} ${formatMoney(smallTotalCents)}`,
      detail:
        `Це покупки до ${formatMoney(smallThresholdCents)} — половина всіх твоїх операцій. ` +
        `Разом вони з'їли ${share(smallTotalCents)}% витрат` +
        (beatsBiggest
          ? `, більше за найдорожчу окрему покупку. Саме такі суми зазвичай і не помічають.`
          : `.`),
      tone: beatsBiggest ? "warn" : "neutral",
    });
  }

  // 4. Головна категорія та її рух
  if (topCategory) {
    insights.push({
      id: "top-category",
      icon: topCategory.icon,
      headline: `Найбільше з'їла категорія «${topCategory.name}»`,
      detail:
        `${formatMoney(topCategory.cents)} — ${share(topCategory.cents)}% усіх витрат` +
        (topCategory.deltaPct === null
          ? "."
          : topCategory.deltaPct === 0
            ? `, стільки ж, скільки ${previousWord}.`
            : `, це на ${Math.abs(topCategory.deltaPct)}% ` +
              `${topCategory.deltaPct > 0 ? "більше" : "менше"}, ніж ${previousWord}.`),
      tone: topCategory.deltaPct !== null && topCategory.deltaPct > 25 ? "warn" : "neutral",
    });
  }

  // 5. Ритм витрат
  if (expenses.length > 0) {
    const quietDays = daysInPeriod - daysWithSpending;
    insights.push({
      id: "rhythm",
      icon: "🗓️",
      headline: `У середньому ${formatMoney(averagePerDayCents)} на день`,
      detail:
        `Днів із витратами — ${daysWithSpending} із ${daysInPeriod}. ` +
        (quietDays > 0
          ? `Без витрат — ${quietDays} ${dayWord(quietDays)}.`
          : "Жодного дня без витрат."),
      tone: "neutral",
    });
  }

  return {
    period,
    totalCents,
    previousCents,
    deltaPct,
    count: expenses.length,
    biggest,
    smallThresholdCents,
    smallCount: small.length,
    smallTotalCents,
    daysInPeriod,
    daysWithSpending,
    averagePerDayCents,
    topCategory,
    insights,
  };
}

/** На двох-трьох дрібницях висновок про «непомітні витрати» звучав би безглуздо. */
function smallCountIsMeaningful(count: number): boolean {
  return count >= 3;
}

/**
 * Українське відмінювання після числівника: 1 день, 2 дні, 5 днів,
 * але 11–14 завжди беруть форму «багато» (11 днів, а не 11 день).
 */
function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function dayWord(count: number): string {
  return plural(count, "день", "дні", "днів");
}
