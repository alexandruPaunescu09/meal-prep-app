import type { FoodLogEntry, MealType, NutritionTotals } from "@/lib/supabase/types";
import { getNutrient, percentOfReference } from "@/lib/nutrition/nutrients";
import { emptyTotals, scaleTotals } from "./diary";

export interface KcalSplit {
  protein: number;
  carbs: number;
  fat: number;
}

/** Share of macro calories (P x4, C x4, F x9), summing to 100; null when there are none. */
export function kcalSplit(t: Pick<NutritionTotals, "protein" | "carbs" | "fat">): KcalSplit | null {
  const p = Math.max(0, t.protein) * 4;
  const c = Math.max(0, t.carbs) * 4;
  const f = Math.max(0, t.fat) * 9;
  const sum = p + c + f;
  if (!(sum > 0)) return null;
  return { protein: (p / sum) * 100, carbs: (c / sum) * 100, fat: (f / sum) * 100 };
}

export interface ReferenceRow {
  key: string;
  label: string;
  unit: string;
  amount: number;
  /** Percent of the EU RI / NRV; null when the nutrient has no reference value. */
  percent: number | null;
}

export function referenceRow(key: string, amount: number): ReferenceRow {
  const def = getNutrient(key);
  return { key, label: def.label, unit: def.unit, amount, percent: percentOfReference(key, amount) };
}

/** Sugars, saturated fat and salt against their EU reference intakes. */
export function limitRows(t: Pick<NutritionTotals, "sugar" | "sat_fat" | "salt">): ReferenceRow[] {
  return [referenceRow("sugar", t.sugar), referenceRow("sat_fat", t.sat_fat), referenceRow("salt", t.salt)];
}

/**
 * Micronutrient rows: those with an NRV first (highest % first), then unknown-reference ones
 * alphabetically. Zero and non-finite amounts are dropped.
 */
export function micronutrientRows(t: Pick<NutritionTotals, "micronutrients">): ReferenceRow[] {
  const rows = Object.entries(t.micronutrients)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v > 0)
    .map(([k, v]) => referenceRow(k, v));
  return rows.sort((a, b) => {
    if (a.percent != null && b.percent != null) return b.percent - a.percent;
    if (a.percent != null) return -1;
    if (b.percent != null) return 1;
    return a.label.localeCompare(b.label);
  });
}

export interface Coverage {
  covered: number;
  total: number;
}

/** True when the item carries at least one finite micronutrient value. */
export function hasMicronutrients(item: { micronutrients?: Record<string, number> | null }): boolean {
  return Object.values(item.micronutrients ?? {}).some((v) => typeof v === "number" && Number.isFinite(v));
}

/** Every item counts in `total`; only items with micronutrient data count as `covered`. */
export function coverage(items: { micronutrients?: Record<string, number> | null }[]): Coverage {
  return { covered: items.filter(hasMicronutrients).length, total: items.length };
}

export const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

type SnapshotFields = Pick<
  FoodLogEntry,
  "calories" | "protein" | "carbs" | "fat" | "fiber" | "sugar" | "sat_fat" | "salt"
> & { micronutrients: Record<string, number> | null };

/** A diary entry's snapshot as plain totals (nulls become 0). */
export function entryTotals(e: SnapshotFields): NutritionTotals {
  return {
    ...emptyTotals(),
    calories: e.calories ?? 0,
    protein: e.protein ?? 0,
    carbs: e.carbs ?? 0,
    fat: e.fat ?? 0,
    fiber: e.fiber ?? 0,
    sugar: e.sugar ?? 0,
    sat_fat: e.sat_fat ?? 0,
    salt: e.salt ?? 0,
    micronutrients: { ...(e.micronutrients ?? {}) },
  };
}

export interface EntryLabel {
  total: NutritionTotals;
  /** Per 100 g/ml; only when the entry was logged in g or ml. */
  per100: NutritionTotals | null;
  /** Per serving / per portion; only when logged in servings or portions. */
  perUnit: { label: "serving" | "portion"; values: NutritionTotals } | null;
}

/** Label views for a logged entry, derived from the snapshot and the logged quantity. */
export function entryLabel(e: SnapshotFields & Pick<FoodLogEntry, "quantity" | "quantity_unit">): EntryLabel {
  const total = entryTotals(e);
  const q = e.quantity;
  if (!(q > 0)) return { total, per100: null, perUnit: null };
  if (e.quantity_unit === "g" || e.quantity_unit === "ml") {
    return { total, per100: scaleTotals(total, 100 / q), perUnit: null };
  }
  return {
    total,
    per100: null,
    perUnit: { label: e.quantity_unit === "portion" ? "portion" : "serving", values: scaleTotals(total, 1 / q) },
  };
}
