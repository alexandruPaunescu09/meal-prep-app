import {
  Ingredient,
  Recipe,
  RecipeIngredient,
  MealPlanEntry,
  PrepRule,
  PrepType,
} from "@/lib/supabase/types";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

export interface PrepTaskDraft {
  prep_date: string;
  cook_date: string;
  ingredient_id: string;
  prep_type: PrepType;
  quantity: number;
  unit: string;
  recipe_names: string[];
}

export function generatePrepTasks(
  entries: FullEntry[],
  rules: PrepRule[],
  weekStart: string
): PrepTaskDraft[] {
  const ingredientRules = new Map<string, PrepRule[]>();
  const categoryRules = new Map<string, PrepRule[]>();

  for (const rule of rules) {
    if (rule.ingredient_id) {
      const existing = ingredientRules.get(rule.ingredient_id) ?? [];
      existing.push(rule);
      ingredientRules.set(rule.ingredient_id, existing);
    } else if (rule.ingredient_category) {
      const existing = categoryRules.get(rule.ingredient_category) ?? [];
      existing.push(rule);
      categoryRules.set(rule.ingredient_category, existing);
    }
  }

  const taskMap = new Map<string, PrepTaskDraft>();
  const weekStartDate = new Date(weekStart + "T00:00:00");

  for (const entry of entries) {
    const cookDate = addDays(weekStartDate, entry.day_of_week - 1);
    const cookDateStr = toISODate(cookDate);
    const ingredientsInEntry = getIngredientsFromEntry(entry);

    for (const { ingredient, quantity, recipeName } of ingredientsInEntry) {
      const applicableRules =
        ingredientRules.get(ingredient.id) ??
        categoryRules.get(ingredient.category) ??
        [];

      for (const rule of applicableRules) {
        let prepDate = addDays(cookDate, -rule.advance_days);
        if (prepDate < weekStartDate) {
          prepDate = new Date(weekStartDate);
        }
        const prepDateStr = toISODate(prepDate);
        const key = `${ingredient.id}|${rule.prep_type}|${prepDateStr}`;
        const existing = taskMap.get(key);

        if (existing) {
          existing.quantity += quantity;
          if (!existing.recipe_names.includes(recipeName)) {
            existing.recipe_names.push(recipeName);
          }
        } else {
          taskMap.set(key, {
            prep_date: prepDateStr,
            cook_date: cookDateStr,
            ingredient_id: ingredient.id,
            prep_type: rule.prep_type as PrepType,
            quantity,
            unit: ingredient.unit,
            recipe_names: [recipeName],
          });
        }
      }
    }
  }

  return Array.from(taskMap.values());
}

function getIngredientsFromEntry(entry: FullEntry): {
  ingredient: Ingredient;
  quantity: number;
  recipeName: string;
}[] {
  const results: { ingredient: Ingredient; quantity: number; recipeName: string }[] = [];

  if (entry.recipe) {
    const recipe = entry.recipe;
    const portionMultiplier = entry.portions / recipe.portions;
    for (const ri of recipe.recipe_ingredients) {
      if (!ri.ingredient) continue;
      results.push({
        ingredient: ri.ingredient,
        quantity: ri.quantity * portionMultiplier,
        recipeName: recipe.name,
      });
    }
  } else if (entry.ingredient && entry.quantity) {
    results.push({
      ingredient: entry.ingredient,
      quantity: entry.quantity * entry.portions,
      recipeName: entry.ingredient.name,
    });
  }

  return results;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}
