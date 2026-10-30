// Pure logic for "Scale to a target": scale recipe quantities so one portion hits a kcal target.
import { calculateRecipe } from "@/lib/calculations/recipe";
import { resolveTargets } from "@/lib/calculations/meal-plan";
import type { Client, Ingredient, MealPlan } from "@/lib/supabase/types";

export interface ScaleLineInput {
  key: string;
  ingredient: Ingredient;
  quantity: number;
  /** false = scaled like the rest but left out of the calorie maths (e.g. an unticked optional line). Default true. */
  counts?: boolean;
}

export interface ScaleLineResult {
  key: string;
  ingredient: Ingredient;
  unit: string;
  before: number;
  after: number;
}

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type ScaleResult =
  | { ok: false; reason: "bad_target" | "no_nutrition" }
  | {
      ok: true;
      factor: number;
      lines: ScaleLineResult[];
      before: Macros;
      after: Macros;
      /** after.calories - targetKcal (rounding drift), in kcal. */
      drift: number;
      targetKcal: number;
      /** Counted ingredients with no calorie data (they add 0 kcal). */
      noNutritionNames: string[];
    };

/** Strip floating point noise ("52.5000000001"). */
const clean = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Round a scaled quantity. g / ml (and any other unit): nearest 5 below 100, else nearest 10.
 * Pieces (`buc`): whole pieces, or halves only when the original already had a half.
 * A non-zero quantity never becomes 0 (minimum one step).
 */
export function roundScaled(scaled: number, original: number, unit: string | null | undefined): number {
  if (!(scaled > 0)) return 0;
  if (unit === "buc") {
    const halves = original % 1 !== 0 && (original * 2) % 1 === 0;
    const step = halves ? 0.5 : 1;
    return clean(Math.max(step, Math.round(scaled / step) * step));
  }
  const step = scaled < 100 ? 5 : 10;
  return clean(Math.max(step, Math.round(scaled / step) * step));
}

function macrosOf(lines: ScaleLineInput[], qty: (l: ScaleLineInput) => number, portions: number): Macros {
  const calc = calculateRecipe(
    lines.filter((l) => l.counts !== false).map((l) => ({ ingredient: l.ingredient, quantity: qty(l) })),
    portions,
  );
  const p = calc.perPortion;
  return { calories: p.calories, protein: p.protein, carbs: p.carbs, fat: p.fat };
}

/** True when at least one counted line carries calorie data (the Scale button needs this). */
export function canScale(lines: ScaleLineInput[]): boolean {
  return lines.some((l) => l.counts !== false && (l.ingredient.calories ?? 0) > 0 && l.quantity > 0);
}

export function scaleRecipe(input: { lines: ScaleLineInput[]; portions: number; targetKcal: number }): ScaleResult {
  const { lines, targetKcal } = input;
  const portions = Math.max(1, input.portions || 1);
  if (!Number.isFinite(targetKcal) || targetKcal <= 0) return { ok: false, reason: "bad_target" };

  const before = macrosOf(lines, (l) => l.quantity, portions);
  if (!(before.calories > 0)) return { ok: false, reason: "no_nutrition" };

  const factor = targetKcal / before.calories;
  const results: ScaleLineResult[] = lines.map((l) => ({
    key: l.key,
    ingredient: l.ingredient,
    unit: l.ingredient.unit,
    before: l.quantity,
    after: l.quantity > 0 ? roundScaled(l.quantity * factor, l.quantity, l.ingredient.unit) : l.quantity,
  }));
  const afterByKey = new Map(results.map((r) => [r.key, r.after]));
  const after = macrosOf(lines, (l) => afterByKey.get(l.key) ?? l.quantity, portions);

  const noNutritionNames = [
    ...new Set(lines.filter((l) => l.counts !== false && l.ingredient.calories == null).map((l) => l.ingredient.name)),
  ];

  return { ok: true, factor, lines: results, before, after, drift: after.calories - targetKcal, targetKcal, noNutritionNames };
}

/** Per-meal kcal from a daily target and a meals-per-day count; null for invalid input. */
export function perMealTarget(dailyKcal: number | null | undefined, mealsPerDay: number): number | null {
  if (dailyKcal == null || !(dailyKcal > 0)) return null;
  if (!Number.isFinite(mealsPerDay) || mealsPerDay < 1) return null;
  return dailyKcal / mealsPerDay;
}

/**
 * A client's daily kcal target: the latest plan's `calorie_target` (through `resolveTargets`,
 * like the grid and the portal), else the client's own `calorie_target`.
 */
export function clientDailyTarget(
  client: Pick<Client, "calorie_target" | "weight_kg" | "target_weight_kg">,
  plans: Array<Pick<MealPlan, "week_start" | "calorie_target" | "protein_per_kg" | "fat_per_kg">>,
): number | null {
  const latest = plans
    .filter((p) => p.calorie_target != null)
    .sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
  if (latest) return resolveTargets(latest, client).calories;
  return client.calorie_target ?? null;
}
