import { PortalEntry } from "@/lib/supabase/types";
import { addDays, mondayOf, parseLocalDate, toLocalISODate } from "@/lib/format";

type FullEntry = PortalEntry;

export interface EntryNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export function entryNutrition(entry: FullEntry): EntryNutrition {
  if (entry.recipe) {
    // Nutrition only: portal ingredients carry no price fields.
    const total = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    for (const ri of entry.recipe.recipe_ingredients) {
      if (!ri.ingredient) continue;
      const f = ri.quantity / 100;
      total.calories += (ri.ingredient.calories ?? 0) * f;
      total.protein += (ri.ingredient.protein ?? 0) * f;
      total.carbs += (ri.ingredient.carbs ?? 0) * f;
      total.fat += (ri.ingredient.fat ?? 0) * f;
      total.fiber += (ri.ingredient.fiber ?? 0) * f;
    }
    const p = Math.max(entry.recipe.portions, 1);
    const m = entry.portions;
    return {
      calories: (total.calories / p) * m,
      protein: (total.protein / p) * m,
      carbs: (total.carbs / p) * m,
      fat: (total.fat / p) * m,
      fiber: (total.fiber / p) * m,
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

// Local-date primitives live in lib/format.ts; aliased here for existing callers.
export {
  parseLocalDate,
  toLocalISODate as formatLocalDate,
  mondayOf as mondayOfWeek,
  addDays as addDaysLocal,
};

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
