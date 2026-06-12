import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import type {
  Client,
  Ingredient,
  Category,
  MealReview,
  MealEntryStatus,
} from "@/lib/supabase/types";

const REVALIDATE = 300;

export const getMealPlanCount = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("meal_plans")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  },
  ["meal-plans-count"],
  { tags: [CACHE_TAGS.mealPlans], revalidate: REVALIDATE }
);

/**
 * Meal plans list with embedded client. Tagged on both meal-plans and clients
 * so renaming a client refreshes the list view without manual invalidation.
 */
export const getMealPlansWithClient = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("meal_plans")
      .select(
        `
        *,
        client:clients (*)
      `
      )
      .order("created_at", { ascending: false });
    return (data as unknown[]) ?? [];
  },
  ["meal-plans-with-client"],
  { tags: [CACHE_TAGS.mealPlans, CACHE_TAGS.clients], revalidate: REVALIDATE }
);

export interface MealPlanDetailBundle {
  plan: unknown;
  entries: unknown[];
  recipes: { id: string; name: string; portions: number }[];
  clients: Client[];
  ingredients: Ingredient[];
  categories: Category[];
  reviews: MealReview[];
  statuses: MealEntryStatus[];
}

/**
 * The 7-query bundle the meal-plan detail page needs. Returns null when the
 * plan does not exist so the page can call `notFound()`.
 *
 * Tagged on this plan id PLUS recipes/ingredients because edits to either
 * surface inside the grid (cost, nutrition, container types). Tagging on
 * `mealReviews` and `mealEntryStatuses` so customer portal interactions also
 * propagate without waiting for the 5-minute revalidate.
 */
export const getMealPlanDetail = (id: string) =>
  unstable_cache(
    async (): Promise<MealPlanDetailBundle | null> => {
      const supabase = createServiceClient();

      const { data: plan } = await supabase
        .from("meal_plans")
        .select(
          `
          *,
          client:clients (*)
        `
        )
        .eq("id", id)
        .single();

      if (!plan) return null;

      const [
        { data: entries },
        { data: recipes },
        { data: clients },
        { data: ingredients },
        { data: categories },
      ] = await Promise.all([
        supabase
          .from("meal_plan_entries")
          .select(
            `
            *,
            recipe:recipes (
              *,
              recipe_ingredients (
                *,
                ingredient:ingredients (*)
              )
            ),
            ingredient:ingredients (*)
          `
          )
          .eq("meal_plan_id", id),
        supabase.from("recipes").select("id, name, portions").order("name"),
        supabase.from("clients").select("*").order("name"),
        supabase.from("ingredients").select("*").order("name"),
        supabase
          .from("ingredient_categories")
          .select("*")
          .order("sort_order"),
      ]);

      const entryRows = (entries as { id: string }[]) ?? [];
      const entryIds = entryRows.map((e) => e.id);
      const [reviewsRes, statusesRes] = entryIds.length
        ? await Promise.all([
            supabase
              .from("meal_reviews")
              .select("*")
              .in("meal_plan_entry_id", entryIds),
            supabase
              .from("meal_entry_status")
              .select("*")
              .in("meal_plan_entry_id", entryIds),
          ])
        : [{ data: [] as MealReview[] }, { data: [] as MealEntryStatus[] }];

      return {
        plan,
        entries: (entries as unknown[]) ?? [],
        recipes:
          (recipes as { id: string; name: string; portions: number }[]) ?? [],
        clients: (clients as Client[]) ?? [],
        ingredients: (ingredients as Ingredient[]) ?? [],
        categories: (categories as Category[]) ?? [],
        reviews: (reviewsRes.data as MealReview[]) ?? [],
        statuses: (statusesRes.data as MealEntryStatus[]) ?? [],
      };
    },
    ["meal-plan-detail", id],
    {
      tags: [
        CACHE_TAGS.mealPlanDetail(id),
        CACHE_TAGS.recipes,
        CACHE_TAGS.ingredients,
        CACHE_TAGS.categories,
        CACHE_TAGS.clients,
        CACHE_TAGS.mealReviews,
        CACHE_TAGS.mealEntryStatuses,
      ],
      revalidate: REVALIDATE,
    }
  )();
