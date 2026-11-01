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
