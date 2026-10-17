import PrepRulesClient from "./prep-rules-client";
import { getPrepRules } from "@/lib/data/prep";
import {
  getIngredients,
  getIngredientCategories,
} from "@/lib/data/ingredients";
import type { PrepRule, Ingredient, Category } from "@/lib/supabase/types";

export default async function PrepRulesPage() {
  const [rules, ingredients, categories] = await Promise.all([
    getPrepRules(),
    getIngredients(),
    getIngredientCategories(),
  ]);

  return (
    <PrepRulesClient
      rules={rules as PrepRule[]}
      ingredients={ingredients as Ingredient[]}
      categories={categories as Category[]}
    />
  );
}
