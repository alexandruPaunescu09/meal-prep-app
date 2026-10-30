import type {
  CatalogItem,
  DiaryQuantityUnit,
  DiarySnapshot,
  FoodLogEntry,
  Ingredient,
  MealStatus,
  MealType,
  NutritionTotals,
} from "@/lib/supabase/types";
import { calculateRecipe } from "./recipe";
import { nutritionGrams, type PieceWeighted } from "./piece-weight";

/** Per-100 nutrition fields; satisfied by Ingredient, Food and FD-0's price-free PublicIngredient. */
export interface NutritionSource {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sat_fat: number | null;
  salt: number | null;
  micronutrients?: Record<string, number> | null;
}

const MACRO_KEYS = ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sat_fat", "salt"] as const;

export const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function emptyTotals(): NutritionTotals {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sat_fat: 0,
    salt: 0,
    micronutrients: {},
  };
}

/** Adds `b * multiplier` into a copy of `a`. */
function addScaled(a: NutritionTotals, b: NutritionTotals, multiplier: number): NutritionTotals {
  const out: NutritionTotals = { ...a, micronutrients: { ...a.micronutrients } };
  for (const k of MACRO_KEYS) out[k] = a[k] + b[k] * multiplier;
  for (const [key, val] of Object.entries(b.micronutrients)) {
    out.micronutrients[key] = (out.micronutrients[key] ?? 0) + val * multiplier;
  }
  return out;
}

export function sumTotals(list: NutritionTotals[]): NutritionTotals {
  return list.reduce((acc, t) => addScaled(acc, t, 1), emptyTotals());
}

export function scaleTotals(t: NutritionTotals, factor: number): NutritionTotals {
  return addScaled(emptyTotals(), t, factor);
}

/** Nutrition for `grams` (or ml) of something described per 100 g/ml. */
export function nutritionForAmount(per100: NutritionSource, grams: number): NutritionTotals {
  const factor = grams / 100;
  const out = emptyTotals();
  for (const k of MACRO_KEYS) out[k] = (per100[k] ?? 0) * factor;
  for (const [key, val] of Object.entries(per100.micronutrients ?? {})) {
    if (typeof val === "number" && Number.isFinite(val)) {
      out.micronutrients[key] = (out.micronutrients[key] ?? 0) + val * factor;
    }
  }
  return out;
}

type AmountItem = Pick<CatalogItem, "kind" | "servingSize">;

/**
 * Converts a logged quantity into the amount used for the math:
 *  - food/ingredient: grams or ml (a serving is `servingSize * quantity`)
 *  - recipe: number of portions
 * Throws on a unit that does not fit the item (e.g. serving without a serving size).
 */
export function resolveAmount(
  item: AmountItem,
  quantity: number,
  unit: DiaryQuantityUnit
): number {
  if (!(quantity > 0)) throw new Error("quantity must be > 0");
  if (item.kind === "recipe") {
    if (unit !== "portion") throw new Error("recipes are logged in portions");
    return quantity;
  }
  if (unit === "portion") throw new Error("only recipes are logged in portions");
  if (unit === "serving") {
    if (!item.servingSize || item.servingSize <= 0) throw new Error("item has no serving size");
    return item.servingSize * quantity;
  }
  return quantity;
}

/** Snapshot fields for a food_log_entries row (totals for this entry, not per 100). */
export function snapshotForCatalogItem(
  item: Pick<CatalogItem, "kind" | "name" | "brand" | "servingSize" | "per100" | "perPortion">,
  quantity: number,
  unit: DiaryQuantityUnit
): DiarySnapshot {
  const amount = resolveAmount(item, quantity, unit);
  let totals: NutritionTotals;
  if (item.kind === "recipe") {
    if (!item.perPortion) throw new Error("recipe has no per-portion nutrition");
    totals = scaleTotals(nutritionForAmount(item.perPortion, 100), amount); // per-portion values x portions
  } else {
    if (!item.per100) throw new Error("item has no nutrition data");
    totals = nutritionForAmount(item.per100, amount);
  }
  return {
    name: item.name,
    brand: item.brand,
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    fiber: totals.fiber,
    sugar: totals.sugar,
    sat_fat: totals.sat_fat,
    salt: totals.salt,
    micronutrients: totals.micronutrients,
  };
}

/** A meal_plan_entries row with its joined recipe / ingredient (nutrition fields only needed). */
export interface PlanEntryLike {
  id?: string;
  meal_type: MealType;
  portions: number;
  quantity: number | null;
  recipe?: {
    portions: number;
    recipe_ingredients: { quantity: number; ingredient?: (NutritionSource & PieceWeighted) | null }[];
  } | null;
  ingredient?: (NutritionSource & PieceWeighted) | null;
}

/** Full nutrition of a plan entry (cost is never computed or returned). */
export function planEntryNutrition(entry: PlanEntryLike): NutritionTotals {
  if (entry.recipe) {
    const items = entry.recipe.recipe_ingredients
      .filter((ri) => ri.ingredient)
      .map((ri) => ({
        // calculateRecipe also computes cost from price_per_unit; zero it out so no price is involved.
        ingredient: { ...ri.ingredient!, price_per_unit: 0 } as unknown as Ingredient,
        quantity: ri.quantity,
      }));
    const calc = calculateRecipe(items, entry.recipe.portions);
    return scaleTotals(
      {
        calories: calc.perPortion.calories,
        protein: calc.perPortion.protein,
        carbs: calc.perPortion.carbs,
        fat: calc.perPortion.fat,
        fiber: calc.perPortion.fiber,
        sugar: calc.perPortion.sugar,
        sat_fat: calc.perPortion.sat_fat,
        salt: calc.perPortion.salt,
        micronutrients: calc.perPortion.micronutrients,
      },
      entry.portions
    );
  }
  if (entry.ingredient && entry.quantity) {
    return nutritionForAmount(
      entry.ingredient,
      nutritionGrams(entry.ingredient, entry.quantity * entry.portions)
    );
  }
  return emptyTotals();
}

export interface PlanStatusLike {
  meal_plan_entry_id: string;
  status: MealStatus;
  /** Added by FD-2 (meal_entry_status.portion_factor); defaults to 1. */
  portion_factor?: number | null;
}

export type DiaryLogLike = Pick<
  FoodLogEntry,
  "meal_type" | "calories" | "protein" | "carbs" | "fat" | "fiber" | "sugar" | "sat_fat" | "salt"
> & { micronutrients: Record<string, number> | null };

export interface DiaryDay {
  eaten: NutritionTotals;
  projected: NutritionTotals;
  byMeal: Record<MealType, NutritionTotals>;
  counts: { planEaten: number; planSkipped: number; planPending: number; logged: number };
}

function logTotals(e: DiaryLogLike): NutritionTotals {
  return nutritionForAmount(
    { ...e, micronutrients: e.micronutrients ?? {} },
    100 // snapshot columns are already totals: factor 1
  );
}

/**
 * Totals for one diary day.
 *  - eaten: plan meals marked 'eaten' (x portion_factor, default 1) + all logged entries.
 *  - skipped plan meals never count.
 *  - projected: eaten + pending (unmarked) plan meals at factor 1.
 * `planEntries` must carry `id` so statuses can be matched; entries without an id count as pending.
 */
export function calculateDiaryDay(input: {
  planEntries: PlanEntryLike[];
  statuses: PlanStatusLike[];
  logEntries: DiaryLogLike[];
}): DiaryDay {
  const statusById = new Map(input.statuses.map((s) => [s.meal_plan_entry_id, s]));
  const byMeal = Object.fromEntries(MEAL_TYPES.map((m) => [m, emptyTotals()])) as Record<
    MealType,
    NutritionTotals
  >;
  let pendingTotals = emptyTotals();
  const counts = { planEaten: 0, planSkipped: 0, planPending: 0, logged: input.logEntries.length };

  for (const entry of input.planEntries) {
    const status = entry.id ? statusById.get(entry.id) : undefined;
    if (status?.status === "skipped") {
      counts.planSkipped += 1;
    } else if (status?.status === "eaten") {
      counts.planEaten += 1;
      const factor = status.portion_factor ?? 1;
      byMeal[entry.meal_type] = addScaled(byMeal[entry.meal_type], planEntryNutrition(entry), factor);
    } else {
      counts.planPending += 1;
      pendingTotals = addScaled(pendingTotals, planEntryNutrition(entry), 1);
    }
  }

  for (const log of input.logEntries) {
    byMeal[log.meal_type] = addScaled(byMeal[log.meal_type], logTotals(log), 1);
  }

  const eaten = sumTotals(MEAL_TYPES.map((m) => byMeal[m]));
  const projected = addScaled(eaten, pendingTotals, 1);
  return { eaten, projected, byMeal, counts };
}
