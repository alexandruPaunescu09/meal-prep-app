export type IngredientClassification = "primary" | "lightly_processed" | "composite";

export const COMPOSITE_TAGS = new Set([
  "en:snacks",
  "en:sweet-snacks",
  "en:meals",
  "en:ready-meals",
  "en:sandwiches",
  "en:pizzas",
  "en:confectioneries",
  "en:biscuits",
  "en:cakes",
  "en:pastries",
  "en:sausages",
  "en:processed-meats",
  "en:soups",
  "en:sauces",
  "en:desserts",
  "en:ice-creams",
  "en:chocolates",
  "en:chips",
  "en:crisps",
  "en:breakfast-cereals",
  "en:sweetened-beverages",
  "en:candies",
]);

const LIGHTLY_PROCESSED_TAGS = new Set([
  "en:frozen-foods",
  "en:frozen-vegetables",
  "en:frozen-fruits",
  "en:pasteurized-milks",
  "en:plain-yogurts",
  "en:natural-cheeses",
  "en:canned-foods",
  "en:dried-foods",
  "en:fruit-juices",
]);

export function classifyByCategories(
  tags: string[]
): IngredientClassification {
  for (const tag of tags) {
    if (COMPOSITE_TAGS.has(tag)) return "composite";
  }
  for (const tag of tags) {
    if (LIGHTLY_PROCESSED_TAGS.has(tag)) return "lightly_processed";
  }
  return "primary";
}

export const COOKED_KEYWORDS = [
  "cooked",
  "fried",
  "prepared",
  "seasoned",
  "baked",
  "grilled",
  "roasted",
  "boiled",
  "steamed",
  "braised",
  "sauteed",
  "stewed",
];

export function containsCookedKeyword(description: string): boolean {
  const lower = description.toLowerCase();
  return COOKED_KEYWORDS.some((kw) => lower.includes(kw));
}

export function queryRequestsCooked(query: string): boolean {
  const lower = query.toLowerCase();
  return COOKED_KEYWORDS.some((kw) => lower.includes(kw));
}
