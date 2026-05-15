import { RecipeIngredient, Ingredient, Recipe, MealPlanEntry, MealType } from "@/lib/supabase/types";
import { calculateRecipe, RecipeCalculation } from "./recipe";

export interface DayTotals {
  cost: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sat_fat: number;
  salt: number;
  micronutrients: Record<string, number>;
}

export interface WeekTotals {
  totalCost: number;
  sellingPrice: number;
  days: Record<number, DayTotals>;
  weekly: DayTotals;
  averageDaily: DayTotals;
}

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

function emptyDayTotals(): DayTotals {
  return {
    cost: 0,
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

function addMicros(target: Record<string, number>, source: Record<string, number>, multiplier: number) {
  for (const [key, val] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + val * multiplier;
  }
}

export function calculateDay(entries: FullEntry[]): DayTotals {
  const totals = emptyDayTotals();

  for (const entry of entries) {
    if (entry.recipe) {
      const items = entry.recipe.recipe_ingredients
        .filter((ri) => ri.ingredient)
        .map((ri) => ({
          ingredient: ri.ingredient!,
          quantity: ri.quantity,
        }));
      const calc = calculateRecipe(items, entry.recipe.portions);

      const mult = entry.portions;
      totals.cost += calc.costPerPortion * mult;
      totals.calories += calc.perPortion.calories * mult;
      totals.protein += calc.perPortion.protein * mult;
      totals.carbs += calc.perPortion.carbs * mult;
      totals.fat += calc.perPortion.fat * mult;
      totals.fiber += calc.perPortion.fiber * mult;
      totals.sugar += calc.perPortion.sugar * mult;
      totals.sat_fat += calc.perPortion.sat_fat * mult;
      totals.salt += calc.perPortion.salt * mult;
      addMicros(totals.micronutrients, calc.perPortion.micronutrients, mult);
    } else if (entry.ingredient && entry.quantity) {
      const ing = entry.ingredient;
      const qty = entry.quantity * entry.portions;
      const factor = qty / 100;
      totals.cost += qty * ing.price_per_unit;
      totals.calories += (ing.calories ?? 0) * factor;
      totals.protein += (ing.protein ?? 0) * factor;
      totals.carbs += (ing.carbs ?? 0) * factor;
      totals.fat += (ing.fat ?? 0) * factor;
      totals.fiber += (ing.fiber ?? 0) * factor;
      totals.sugar += (ing.sugar ?? 0) * factor;
      totals.sat_fat += (ing.sat_fat ?? 0) * factor;
      totals.salt += (ing.salt ?? 0) * factor;
      addMicros(totals.micronutrients, ing.micronutrients || {}, factor);
    }
  }

  return totals;
}

export function calculateWeek(
  entries: FullEntry[],
  markupMultiplier: number
): WeekTotals {
  const days: Record<number, DayTotals> = {};
  const weekly = emptyDayTotals();
  let daysWithEntries = 0;

  for (let d = 1; d <= 7; d++) {
    const dayEntries = entries.filter((e) => e.day_of_week === d);
    const dayTotals = calculateDay(dayEntries);
    days[d] = dayTotals;

    if (dayEntries.length > 0) daysWithEntries++;

    weekly.cost += dayTotals.cost;
    weekly.calories += dayTotals.calories;
    weekly.protein += dayTotals.protein;
    weekly.carbs += dayTotals.carbs;
    weekly.fat += dayTotals.fat;
    weekly.fiber += dayTotals.fiber;
    weekly.sugar += dayTotals.sugar;
    weekly.sat_fat += dayTotals.sat_fat;
    weekly.salt += dayTotals.salt;
    addMicros(weekly.micronutrients, dayTotals.micronutrients, 1);
  }

  const div = Math.max(daysWithEntries, 1);
  const averageDaily: DayTotals = {
    cost: weekly.cost / div,
    calories: weekly.calories / div,
    protein: weekly.protein / div,
    carbs: weekly.carbs / div,
    fat: weekly.fat / div,
    fiber: weekly.fiber / div,
    sugar: weekly.sugar / div,
    sat_fat: weekly.sat_fat / div,
    salt: weekly.salt / div,
    micronutrients: Object.fromEntries(
      Object.entries(weekly.micronutrients).map(([k, v]) => [k, v / div])
    ),
  };

  return {
    totalCost: weekly.cost,
    sellingPrice: weekly.cost * markupMultiplier,
    days,
    weekly,
    averageDaily,
  };
}
