import {
  getRecipesWithIngredients,
  getRecipeRatingStats,
} from "@/lib/data/recipes";
import RecipesClient from "./recipes-client";

export default async function RecipesPage() {
  const [recipes, ratingStats] = await Promise.all([
    getRecipesWithIngredients(),
    getRecipeRatingStats(),
  ]);

  return (
    <RecipesClient
      recipes={recipes as any[]}
      ratingStats={ratingStats}
    />
  );
}
