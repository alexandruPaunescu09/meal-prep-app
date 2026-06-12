import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import type { Ingredient, Category } from "@/lib/supabase/types";

const REVALIDATE = 300;

/**
 * Counts only — used by the dashboard. Cheaper than the full list.
 */
export const getIngredientCount = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("ingredients")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  },
  ["ingredients-count"],
  { tags: [CACHE_TAGS.ingredients], revalidate: REVALIDATE }
);

export const getIngredients = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("ingredients")
      .select("*")
      .order("name");
    return (data as Ingredient[]) ?? [];
  },
  ["ingredients-list"],
  { tags: [CACHE_TAGS.ingredients], revalidate: REVALIDATE }
);

export const getIngredientCategories = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("ingredient_categories")
      .select("*")
      .order("sort_order");
    return (data as Category[]) ?? [];
  },
  ["ingredient-categories-list"],
  { tags: [CACHE_TAGS.categories], revalidate: REVALIDATE }
);

/**
 * Per-category ingredient counts for the categories management page.
 * Tagged on both ingredients and categories so it self-heals when either changes.
 */
export const getIngredientCountsByCategory = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase.from("ingredients").select("category");
    const counts: Record<string, number> = {};
    for (const row of (data as { category: string }[]) ?? []) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }
    return counts;
  },
  ["ingredient-counts-by-category"],
  { tags: [CACHE_TAGS.ingredients, CACHE_TAGS.categories], revalidate: REVALIDATE }
);
