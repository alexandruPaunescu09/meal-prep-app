import { formatQuantity } from "@/lib/format";

export type LineRole = "main" | "seasoning";

/** Minimal line shape shared by the recipe form, lists, cooking plan and customer views. */
export interface SeasoningLine {
  role: LineRole;
  to_taste: boolean;
  quantity: number;
  ingredient?: { name: string; unit?: string } | null;
}

/** Calories per 100 g/ml above which a "to taste" line deserves a warning (oil is ~880). */
export const CALORIE_DENSE_KCAL = 300;

/** Splits recipe lines by role, keeping their order. */
export function splitLines<T extends { role: LineRole }>(lines: T[]): { main: T[]; seasonings: T[] } {
  const main: T[] = [];
  const seasonings: T[] = [];
  for (const line of lines) (line.role === "seasoning" ? seasonings : main).push(line);
  return { main, seasonings };
}

/** "to taste" or "3 g" (unit appended when given). */
export function lineAmountText(line: { to_taste: boolean; quantity: number }, unit?: string): string {
  if (line.to_taste) return "to taste";
  const amount = formatQuantity(line.quantity);
  return unit ? `${amount} ${unit}` : amount;
}

/**
 * Customer-facing line: "Seasoned with: a, b, c". Names only (no grams, no price),
 * deduplicated and sorted by name. Null when the recipe has no seasonings.
 */
export function seasonedWithText(lines: SeasoningLine[]): string | null {
  const names = new Set<string>();
  for (const line of lines) {
    if (line.role !== "seasoning") continue;
    const name = line.ingredient?.name?.trim();
    if (name) names.add(name);
  }
  if (names.size === 0) return null;
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  return `Seasoned with: ${sorted.join(", ")}`;
}

/** True when the ingredient carries real calories per 100 g/ml (more than 300). */
export function isCalorieDense(ingredient: { calories: number | null }): boolean {
  return (ingredient.calories ?? 0) > CALORIE_DENSE_KCAL;
}

/** The role a line gets when the ingredient is first added to a recipe. */
export function defaultRole(ingredient: { is_seasoning: boolean }): LineRole {
  return ingredient.is_seasoning ? "seasoning" : "main";
}

/** Category slug of the "Spices & Herbs" group (seeded by SE-1). */
export const SPICES_CATEGORY = "spices_herbs";

/** Quick-add chips shown above the Seasonings list. */
export const MAX_SEASONING_CHIPS = 12;

export interface ChipDefault {
  toTaste: boolean;
  /** Amount in the ingredient's unit; 0 when to taste. */
  quantity: number;
}

/**
 * Starting amount for a seasoning added with a quick-add chip.
 * Spices and herbs (salt and pepper included) start "to taste"; everything else
 * is weighed: 1 for a `buc` ingredient, 10 for calorie-dense ones (oil), else 5.
 */
export function chipDefault(ingredient: {
  category: string;
  unit: string;
  calories: number | null;
}): ChipDefault {
  if (ingredient.category === SPICES_CATEGORY) return { toTaste: true, quantity: 0 };
  if (ingredient.unit === "buc") return { toTaste: false, quantity: 1 };
  return { toTaste: false, quantity: isCalorieDense(ingredient) ? 10 : 5 };
}

/**
 * Up to `limit` quick-add chips: `is_seasoning` ingredients not already in the
 * Seasonings list, most used in recipes first, then by name.
 */
export function pickSeasoningChips<T extends { id: string; name: string; is_seasoning: boolean }>(
  ingredients: T[],
  usedIds: ReadonlySet<string>,
  usage?: ReadonlyMap<string, number>,
  limit: number = MAX_SEASONING_CHIPS
): T[] {
  return ingredients
    .filter((i) => i.is_seasoning && !usedIds.has(i.id))
    .sort(
      (a, b) =>
        (usage?.get(b.id) ?? 0) - (usage?.get(a.id) ?? 0) || a.name.localeCompare(b.name, "ro")
    )
    .slice(0, limit);
}
