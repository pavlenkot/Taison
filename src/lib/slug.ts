const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh",
  з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", ы: "y", э: "e", ъ: "",
  ä: "ae", ö: "oe", ü: "ue", ß: "ss",
};

/** Латинський ключ для групування. Користувач його не бачить. */
export function slugify(value: string, fallbackPrefix = "item"): string {
  const base = value
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return base.length > 0 ? base : `${fallbackPrefix}_${Date.now().toString(36)}`;
}

/**
 * Ім'я, придатне для файлової системи: прибираємо символи, які
 * не можна класти у шлях у macOS та iOS, і стискаємо пробіли.
 */
export function safeFileName(value: string, maxLength = 60): string {
  return value
    .replace(/[/\\:*?"<>|\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}
