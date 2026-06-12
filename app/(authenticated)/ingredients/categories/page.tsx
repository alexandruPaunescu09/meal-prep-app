import {
  getIngredientCategories,
  getIngredientCountsByCategory,
} from "@/lib/data/ingredients";
import CategoriesClient from "./categories-client";

export default async function CategoriesPage() {
  const [categories, ingredientCounts] = await Promise.all([
    getIngredientCategories(),
    getIngredientCountsByCategory(),
  ]);

  return (
    <CategoriesClient
      categories={categories}
      ingredientCounts={ingredientCounts}
    />
  );
}
