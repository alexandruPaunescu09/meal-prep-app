import PrepRulesClient from "./prep-rules-client";
import { getPrepRules } from "@/lib/data/prep";
import {
  getIngredients,
  getIngredientCategories,
} from "@/lib/data/ingredients";

export default async function PrepRulesPage() {
  const [rules, ingredients, categories] = await Promise.all([
    getPrepRules(),
    getIngredients(),
    getIngredientCategories(),
  ]);

  return (
    <PrepRulesClient
      rules={rules as any[]}
      ingredients={ingredients as any[]}
      categories={categories as any[]}
    />
  );
}
