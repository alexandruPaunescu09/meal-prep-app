import {
  Ingredient,
  Recipe,
  RecipeIngredient,
  MealPlanEntry,
} from "@/lib/supabase/types";

export interface CookingPlanRecipeIngredient {
  ingredientId: string;
  name: string;
  unit: string;
  quantity: number;
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
  ingredients: CookingPlanRecipeIngredient[];
  clientBreakdown: CookingPlanClientRow[];
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
  clientPortions: Map<string, number>;
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

      const ingredients: CookingPlanRecipeIngredient[] = acc.recipeIngredients
        .filter((ri) => ri.ingredient)
        .map((ri) => ({
          ingredientId: ri.ingredient!.id,
          name: ri.ingredient!.name,
          unit: ri.ingredient!.unit,
          quantity: ri.quantity * scale,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

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
        clientBreakdown,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const directIngredients = Array.from(directMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return { recipes, directIngredients };
}
