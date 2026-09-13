const PALETTE = [
  "#FF944D",
  "#81D8D0",
  "#969FEF",
  "#69DAB0",
  "#E2EE70",
  "#7D8FFF",
  "#FFA0A2",
  "#20A6E6",
];
export const CATEGORY_GLYPHS = [
  "food",
  "shopping",
  "transport",
  "home",
  "health",
  "cash",
  "gift",
  "work",
  "travel",
  "education",
  "subscriptions",
  "other",
] as const;
export type CategoryGlyph = (typeof CATEGORY_GLYPHS)[number];
const LEGACY: Record<string, CategoryGlyph> = {
  "🛒": "food",
  "🍎": "food",
  "🍔": "food",
  "🥑": "food",
  "🛍": "shopping",
  "🛍️": "shopping",
  "👕": "shopping",
  "🚆": "transport",
  "🚗": "transport",
  "🚌": "transport",
  "🏠": "home",
  "💊": "health",
  "🏥": "health",
  "💶": "cash",
  "💰": "cash",
  "🎁": "gift",
  "💼": "work",
  "✈️": "travel",
  "📚": "education",
  "🔁": "subscriptions",
  "📦": "other",
};
export function categoryGlyph(icon?: string | null, slug = ""): CategoryGlyph {
  if (CATEGORY_GLYPHS.includes(icon as CategoryGlyph))
    return icon as CategoryGlyph;
  if (icon && LEGACY[icon]) return LEGACY[icon];
  if (/food|grocer|restaurant/.test(slug)) return "food";
  if (/transport/.test(slug)) return "transport";
  if (/rent|home|housing|utilit/.test(slug)) return "home";
  if (/health|medic/.test(slug)) return "health";
  if (/salary|freelance|business/.test(slug)) return "work";
  if (/subscription/.test(slug)) return "subscriptions";
  return "other";
}
export function categoryColor(category: {
  id?: string;
  slug?: string;
}): string {
  const key = category.slug ?? category.id ?? "uncategorized";
  if (/food|grocer|restaurant/.test(key)) return "#FF944D";
  if (/transport/.test(key)) return "#E2EE70";
  if (/shopping/.test(key)) return "#69DAB0";
  if (/health|medic/.test(key)) return "#969FEF";
  if (/subscription/.test(key)) return "#7D8FFF";
  let hash = 0;
  for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
