import { getIngredients, getIngredientCategories } from "@/lib/data/ingredients";
import IngredientsClient from "./ingredients-client";

export default async function IngredientsPage() {
  const [ingredients, categories] = await Promise.all([
    getIngredients(),
    getIngredientCategories(),
  ]);

  return (
    <IngredientsClient ingredients={ingredients} categories={categories} />
  );
}
