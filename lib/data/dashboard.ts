import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";

const REVALIDATE = 120;

export interface DashboardData {
  counts: {
    ingredients: number;
    recipes: number;
    mealPlans: number;
    clients: number;
    prepRules: number;
    containerTypes: number;
  };
  attention: {
    unreadReviews: number;
    ingredientsNoPrice: number;
    ingredientsNoNutrition: number;
    recipesNoContainer: number;
  };
  plansThisWeek: number;
  plansNextWeek: number;
  prep: { done: number; total: number };
}

/**
 * Everything the dashboard needs in one cached bundle. Week starts are passed
 * in (and become part of the cache key) so the data rolls over on Monday.
 * Tagged on every table it reads so existing invalidations keep it fresh.
 */
export const getDashboardData = unstable_cache(
  async (thisWeek: string, nextWeek: string): Promise<DashboardData> => {
    const sb = createServiceClient();
    const head = { count: "exact" as const, head: true };

    const [
      ingredients,
      recipes,
      mealPlans,
      clients,
      prepRules,
      containerTypes,
      unreadReviews,
      noPrice,
      noNutrition,
      noContainer,
      planThis,
      planNext,
      prepTotal,
      prepDone,
    ] = await Promise.all([
      sb.from("ingredients").select("id", head),
      sb.from("recipes").select("id", head),
      sb.from("meal_plans").select("id", head),
      sb.from("clients").select("id", head),
      sb.from("prep_rules").select("id", head),
      sb.from("container_types").select("id", head),
      sb.from("meal_reviews").select("id", head).is("admin_read_at", null),
      sb
        .from("ingredients")
        .select("id", head)
        .or("package_price.is.null,package_price.eq.0"),
      sb.from("ingredients").select("id", head).is("calories", null),
      sb.from("recipes").select("id", head).is("container_type_id", null),
      sb.from("meal_plans").select("id", head).eq("week_start", thisWeek),
      sb.from("meal_plans").select("id", head).eq("week_start", nextWeek),
      sb.from("prep_tasks").select("id", head).eq("week_start", thisWeek),
      sb
        .from("prep_tasks")
        .select("id", head)
        .eq("week_start", thisWeek)
        .eq("completed", true),
    ]);

    return {
      counts: {
        ingredients: ingredients.count ?? 0,
        recipes: recipes.count ?? 0,
        mealPlans: mealPlans.count ?? 0,
        clients: clients.count ?? 0,
        prepRules: prepRules.count ?? 0,
        containerTypes: containerTypes.count ?? 0,
      },
      attention: {
        unreadReviews: unreadReviews.count ?? 0,
        ingredientsNoPrice: noPrice.count ?? 0,
        ingredientsNoNutrition: noNutrition.count ?? 0,
        recipesNoContainer: noContainer.count ?? 0,
      },
      plansThisWeek: planThis.count ?? 0,
      plansNextWeek: planNext.count ?? 0,
      prep: { done: prepDone.count ?? 0, total: prepTotal.count ?? 0 },
    };
  },
  ["dashboard-data"],
  {
    tags: [
      CACHE_TAGS.ingredients,
      CACHE_TAGS.recipes,
      CACHE_TAGS.mealPlans,
      CACHE_TAGS.clients,
      CACHE_TAGS.prepRules,
      CACHE_TAGS.prepTasks,
      CACHE_TAGS.containerTypes,
      CACHE_TAGS.mealReviews,
    ],
    revalidate: REVALIDATE,
  }
);
