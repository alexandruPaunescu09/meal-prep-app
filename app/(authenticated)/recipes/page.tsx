import { createServer } from "@/lib/supabase/server";
import { RecipeRatingStats } from "@/lib/supabase/types";
import RecipesClient from "./recipes-client";

export default async function RecipesPage() {
  const supabase = await createServer();

  const [recipesRes, statsRes] = await Promise.all([
    supabase
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
      .order("name"),
    supabase.from("recipe_rating_stats").select("*"),
  ]);

  return (
    <RecipesClient
      recipes={(recipesRes.data as any[]) ?? []}
      ratingStats={(statsRes.data as RecipeRatingStats[]) ?? []}
    />
  );
}
