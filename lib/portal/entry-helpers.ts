import { Ingredient, MealPlanEntry, Recipe, RecipeIngredient } from "@/lib/supabase/types";
import { calculateRecipe } from "@/lib/calculations/recipe";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

export interface EntryNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export function entryNutrition(entry: FullEntry): EntryNutrition {
  if (entry.recipe) {
    const items = entry.recipe.recipe_ingredients
      .filter((ri) => ri.ingredient)
      .map((ri) => ({ ingredient: ri.ingredient!, quantity: ri.quantity }));
    const calc = calculateRecipe(items, entry.recipe.portions);
    const m = entry.portions;
    return {
      calories: calc.perPortion.calories * m,
      protein: calc.perPortion.protein * m,
      carbs: calc.perPortion.carbs * m,
      fat: calc.perPortion.fat * m,
      fiber: calc.perPortion.fiber * m,
    };
  }
  if (entry.ingredient && entry.quantity) {
    const f = (entry.quantity * entry.portions) / 100;
    const i = entry.ingredient;
    return {
      calories: (i.calories ?? 0) * f,
      protein: (i.protein ?? 0) * f,
      carbs: (i.carbs ?? 0) * f,
      fat: (i.fat ?? 0) * f,
      fiber: (i.fiber ?? 0) * f,
    };
  }
  return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

const MEAL_ORDER: Record<string, number> = {
  breakfast: 1,
  lunch: 2,
  dinner: 3,
  snack: 4,
};

export function sortByMealType<T extends { meal_type: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9)
  );
}

/**
 * day_of_week: 1=Monday … 7=Sunday (matches existing code).
 * Returns a Monday-based 1..7 index for a given JS date.
 */
export function dayOfWeekIndex(d: Date): number {
  const js = d.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

/** Monday of the week containing `d` (local time), formatted YYYY-MM-DD. */
export function mondayOfWeek(d: Date): string {
  const dow = dayOfWeekIndex(d);
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow - 1));
  return formatLocalDate(monday);
}

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysLocal(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatLocalDate(dt);
}

/**
 * Parse a YYYY-MM-DD string into a local-time Date (no timezone shifts).
 * Returns null if the string is malformed or doesn't denote a real calendar date.
 */
export function parseLocalDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((p) => parseInt(p, 10));
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** True iff `s` is a valid YYYY-MM-DD calendar date. */
export function isValidLocalDate(s: string): boolean {
  return parseLocalDate(s) !== null;
}

/**
 * Compare two YYYY-MM-DD strings as calendar dates.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * Lexicographic comparison is correct for this format.
 */
export function compareLocalDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
