import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import type { RecipeRatingStats } from "@/lib/supabase/types";

const REVALIDATE = 300;

export const getRecipeCount = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("recipes")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  },
  ["recipes-count"],
  { tags: [CACHE_TAGS.recipes], revalidate: REVALIDATE }
);

/**
 * Full recipe list with nested recipe_ingredients → ingredient join.
 * Returned shape mirrors what `recipes-client.tsx` expects.
 *
 * Tagged on both recipes and ingredients because the nested ingredient
 * data must invalidate when an ingredient is edited (e.g. price changes).
 */
export const getRecipesWithIngredients = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("recipes")
      .select(
        `
        *,
        recipe_ingredients (
          id,
          recipe_id,
          ingredient_id,
          quantity,
          ingredient:ingredients (*)
        )
      `
      )
      .order("name");
    return (data as unknown[]) ?? [];
  },
  ["recipes-with-ingredients"],
  { tags: [CACHE_TAGS.recipes, CACHE_TAGS.ingredients], revalidate: REVALIDATE }
);

/**
 * Slim recipe list (id, name, portions) used by the meal-plan slot picker
 * and the prep config UI. Cheaper than the full join above.
 */
export const getRecipesSlim = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("recipes")
      .select("id, name, portions")
      .order("name");
    return (data as { id: string; name: string; portions: number }[]) ?? [];
  },
  ["recipes-slim"],
  { tags: [CACHE_TAGS.recipes], revalidate: REVALIDATE }
);

export const getRecipeRatingStats = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase.from("recipe_rating_stats").select("*");
    return (data as RecipeRatingStats[]) ?? [];
  },
  ["recipe-rating-stats"],
  { tags: [CACHE_TAGS.recipeRatings], revalidate: REVALIDATE }
);
