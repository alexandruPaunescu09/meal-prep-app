import { getIngredients, getIngredientCategories } from "@/lib/data/ingredients";
import ImportClient from "./import-client";

export default async function ImportReceiptPage() {
  const [ingredients, categories] = await Promise.all([
    getIngredients(),
    getIngredientCategories(),
  ]);

  return <ImportClient ingredients={ingredients} categories={categories} />;
}
