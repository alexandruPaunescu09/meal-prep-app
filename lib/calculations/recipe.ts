import { Ingredient } from "@/lib/supabase/types";

export interface RecipeCalculation {
  totalCost: number;
  costPerPortion: number;
  perPortion: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sat_fat: number;
    salt: number;
    micronutrients: Record<string, number>;
  };
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sat_fat: number;
    salt: number;
    micronutrients: Record<string, number>;
  };
}

export function calculateRecipe(
  ingredients: Array<{ ingredient: Ingredient; quantity: number }>,
  portions: number
): RecipeCalculation {
  let totalCost = 0;
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let fiber = 0;
  let sugar = 0;
  let sat_fat = 0;
  let salt = 0;
  const micronutrients: Record<string, number> = {};

  for (const { ingredient, quantity } of ingredients) {
    totalCost += quantity * ingredient.price_per_unit;

    const factor = quantity / 100;
    calories += (ingredient.calories ?? 0) * factor;
    protein += (ingredient.protein ?? 0) * factor;
    carbs += (ingredient.carbs ?? 0) * factor;
    fat += (ingredient.fat ?? 0) * factor;
    fiber += (ingredient.fiber ?? 0) * factor;
    sugar += (ingredient.sugar ?? 0) * factor;
    sat_fat += (ingredient.sat_fat ?? 0) * factor;
    salt += (ingredient.salt ?? 0) * factor;

    for (const [key, val] of Object.entries(ingredient.micronutrients || {})) {
      if (typeof val === "number") {
        micronutrients[key] = (micronutrients[key] ?? 0) + val * factor;
      }
    }
  }

  const p = Math.max(portions, 1);

  return {
    totalCost,
    costPerPortion: totalCost / p,
    totals: { calories, protein, carbs, fat, fiber, sugar, sat_fat, salt, micronutrients },
    perPortion: {
      calories: calories / p,
      protein: protein / p,
      carbs: carbs / p,
      fat: fat / p,
      fiber: fiber / p,
      sugar: sugar / p,
      sat_fat: sat_fat / p,
      salt: salt / p,
      micronutrients: Object.fromEntries(
        Object.entries(micronutrients).map(([k, v]) => [k, v / p])
      ),
    },
  };
}
