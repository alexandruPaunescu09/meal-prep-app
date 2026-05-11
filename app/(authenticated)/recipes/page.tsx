import { createServer } from "@/lib/supabase/server";
import { Recipe, RecipeIngredient } from "@/lib/supabase/types";
import RecipesClient from "./recipes-client";

export default async function RecipesPage() {
  const supabase = await createServer();

  const { data: recipes } = await supabase
    .from("recipes")
    .select(`
      *,
      recipe_ingredients (
        id,
        recipe_id,
        ingredient_id,
        quantity,
        ingredient:ingredients (*)
      )
    `)
    .order("name");

  return <RecipesClient recipes={(recipes as any[]) ?? []} />;
}
