import {
  Ingredient,
  Recipe,
  RecipeIngredient,
  MealPlanEntry,
} from "@/lib/supabase/types";
import { splitLines } from "@/lib/recipes/seasonings";
import { addDays } from "@/lib/format";

export interface CookingPlanRecipeIngredient {
  ingredientId: string;
  name: string;
  unit: string;
  quantity: number;
  /** "to taste" line: quantity is 0 and the UI shows "to taste". */
  toTaste: boolean;
}

export interface CookingPlanClientRow {
  clientName: string;
  portions: number;
  weightG: number | null;
}

export interface CookingPlanRecipe {
  recipeId: string;
  name: string;
  totalPortions: number;
  basePortions: number;
  totalFinalWeightG: number | null;
  /** Main lines only. */
  ingredients: CookingPlanRecipeIngredient[];
  /** Seasoning lines (weighed ones scaled to the batch, to-taste ones kept as "to taste"). */
  seasonings: CookingPlanRecipeIngredient[];
  clientBreakdown: CookingPlanClientRow[];
  /** Recipe steps, once per recipe (not per plan). Empty when none. */
  steps: string[];
}

export interface CookingPlanDirectIngredient {
  ingredientId: string;
  name: string;
  totalQuantity: number;
  unit: string;
}

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
  meal_plan?: {
    name: string;
    client?: { name: string } | null;
  };
};

interface RecipeAccumulator {
  recipeId: string;
  name: string;
  basePortions: number;
  finalWeight: number | null;
  totalPortions: number;
  recipeIngredients: (RecipeIngredient & { ingredient: Ingredient })[];
  steps: string[];
  clientPortions: Map<string, number>;
}

/** Trimmed, non-empty steps; tolerates null/undefined (older rows). */
export function cleanSteps(instructions: string[] | null | undefined): string[] {
  return (instructions ?? []).map((s) => s.trim()).filter(Boolean);
}

export function generateCookingPlan(entries: FullEntry[]): {
  recipes: CookingPlanRecipe[];
  directIngredients: CookingPlanDirectIngredient[];
} {
  const recipeMap = new Map<string, RecipeAccumulator>();
  const directMap = new Map<string, CookingPlanDirectIngredient>();

  for (const entry of entries) {
    if (entry.recipe) {
      const recipe = entry.recipe;
      const clientName =
        entry.meal_plan?.client?.name ?? entry.meal_plan?.name ?? "Unassigned";

      let acc = recipeMap.get(recipe.id);
      if (!acc) {
        acc = {
          recipeId: recipe.id,
          name: recipe.name,
          basePortions: recipe.portions,
          finalWeight: recipe.final_weight ?? null,
          totalPortions: 0,
          recipeIngredients: recipe.recipe_ingredients,
          steps: cleanSteps(recipe.instructions),
          clientPortions: new Map(),
        };
        recipeMap.set(recipe.id, acc);
      }

      acc.totalPortions += entry.portions;
      acc.clientPortions.set(
        clientName,
        (acc.clientPortions.get(clientName) ?? 0) + entry.portions
      );
    } else if (entry.ingredient && entry.quantity) {
      const ing = entry.ingredient;
      const totalQty = entry.quantity * entry.portions;
      const existing = directMap.get(ing.id);
      if (existing) {
        existing.totalQuantity += totalQty;
      } else {
        directMap.set(ing.id, {
          ingredientId: ing.id,
          name: ing.name,
          totalQuantity: totalQty,
          unit: ing.unit,
        });
      }
    }
  }

  const recipes: CookingPlanRecipe[] = Array.from(recipeMap.values())
    .map((acc) => {
      const scale = acc.basePortions > 0 ? acc.totalPortions / acc.basePortions : 0;
      const totalFinalWeightG =
        acc.finalWeight != null && acc.basePortions > 0
          ? (acc.finalWeight / acc.basePortions) * acc.totalPortions
          : null;

      const lines = acc.recipeIngredients
        .filter((ri) => ri.ingredient)
        .map((ri) => ({
          role: ri.role ?? ("main" as const),
          ingredientId: ri.ingredient!.id,
          name: ri.ingredient!.name,
          unit: ri.ingredient!.unit,
          quantity: ri.to_taste ? 0 : ri.quantity * scale,
          toTaste: !!ri.to_taste,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const { main, seasonings: seasoningLines } = splitLines(lines);
      const strip = (l: (typeof lines)[number]): CookingPlanRecipeIngredient => ({
        ingredientId: l.ingredientId,
        name: l.name,
        unit: l.unit,
        quantity: l.quantity,
        toTaste: l.toTaste,
      });
      const ingredients = main.map(strip);
      const seasonings = seasoningLines.map(strip);

      const clientBreakdown: CookingPlanClientRow[] = Array.from(
        acc.clientPortions.entries()
      )
        .map(([clientName, portions]) => ({
          clientName,
          portions,
          weightG:
            acc.finalWeight != null && acc.basePortions > 0
              ? (acc.finalWeight / acc.basePortions) * portions
              : null,
        }))
        .sort((a, b) => a.clientName.localeCompare(b.clientName));

      return {
        recipeId: acc.recipeId,
        name: acc.name,
        totalPortions: acc.totalPortions,
        basePortions: acc.basePortions,
        totalFinalWeightG,
        ingredients,
        seasonings,
        clientBreakdown,
        steps: acc.steps,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const directIngredients = Array.from(directMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return { recipes, directIngredients };
}

/**
 * Cook batches: entries are cooked together per day pair, the day before the pair starts.
 * Sunday meal-plan entries are not part of the weekly cooking plan (meals are served Monday-Saturday;
 * customers can still log food on Sundays in the diary, unchanged).
 */
export const COOK_BATCHES = [
  { firstDay: 1, days: [1, 2] },
  { firstDay: 3, days: [3, 4] },
  { firstDay: 5, days: [5, 6] },
] as const;

/** First weekday (1 = Monday) of the batch a day belongs to: odd days start a batch (7 matches no batch). */
export function batchFirstDay(dayOfWeek: number): number {
  return dayOfWeek % 2 === 1 ? dayOfWeek : dayOfWeek - 1;
}

/** Cook date ('YYYY-MM-DD'): the day before the batch's first day (Monday-Tuesday: the Sunday before the week). */
export function cookDateFor(weekStart: string, firstDay: number): string {
  return addDays(weekStart, firstDay - 2);
}

export interface CookingBatch {
  firstDay: number;
  /** Weekdays covered (1 = Monday). */
  days: number[];
  firstDate: string;
  lastDate: string;
  cookDate: string;
  recipes: CookingPlanRecipe[];
  directIngredients: CookingPlanDirectIngredient[];
}

/** One cooking plan per non-empty cook batch, in week order. Sunday meal-plan entries are ignored (not part of the weekly cooking plan). */
export function generateCookingBatches(
  entries: FullEntry[],
  weekStart: string
): CookingBatch[] {
  const batches: CookingBatch[] = [];
  for (const { firstDay, days } of COOK_BATCHES) {
    const inBatch = entries.filter((e) => batchFirstDay(e.day_of_week) === firstDay);
    if (inBatch.length === 0) continue;
    batches.push({
      firstDay,
      days: [...days],
      firstDate: addDays(weekStart, days[0] - 1),
      lastDate: addDays(weekStart, days[days.length - 1] - 1),
      cookDate: cookDateFor(weekStart, firstDay),
      ...generateCookingPlan(inBatch),
    });
  }
  return batches;
}
