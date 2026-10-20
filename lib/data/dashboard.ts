import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import { collectPages } from "@/lib/portal/catalog";
import { addDays, todayInTz } from "@/lib/format";
import { inactiveClients, type InactiveClient } from "@/lib/calculations/client-insights";

// Short: customers add pending foods through portal routes that do not invalidate this bundle.
const REVALIDATE = 60;

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
    pendingFoods: number;
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
      pendingFoods,
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
      sb.from("foods").select("id", head).eq("status", "pending"),
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
        pendingFoods: pendingFoods.count ?? 0,
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
      CACHE_TAGS.foods,
    ],
    revalidate: REVALIDATE,
  }
);

const INACTIVE_AFTER_DAYS = 3;
const INACTIVE_LOOKBACK_DAYS = 14;

/**
 * Portal clients with no eaten plan meal and no logged entry for 3+ days. Three small queries over
 * the last two weeks (profiles, eaten statuses, log rows), not one per client. `today` is part of
 * the cache key; the diary / status tags refresh it when customers act.
 */
export const getInactiveClients = unstable_cache(
  async (today: string): Promise<InactiveClient[]> => {
    const sb = createServiceClient();
    const since = addDays(today, -INACTIVE_LOOKBACK_DAYS);
    const [profiles, statuses, logs] = await Promise.all([
      sb.from("profiles").select("client_id, created_at, clients(name)").eq("role", "customer").not("client_id", "is", null),
      collectPages<{ client_id: string; updated_at: string }>(async (a, b) => {
        const { data, error } = await sb
          .from("meal_entry_status")
          .select("client_id, updated_at")
          .eq("status", "eaten")
          .gte("updated_at", `${addDays(since, -1)}T00:00:00Z`)
          .order("updated_at")
          .range(a, b);
        if (error) throw new Error(error.message);
        return (data ?? []) as { client_id: string; updated_at: string }[];
      }),
      collectPages<{ client_id: string; log_date: string }>(async (a, b) => {
        const { data, error } = await sb
          .from("food_log_entries")
          .select("client_id, log_date")
          .gte("log_date", since)
          .order("log_date")
          .order("id")
          .range(a, b);
        if (error) throw new Error(error.message);
        return (data ?? []) as { client_id: string; log_date: string }[];
      }),
    ]);
    if (profiles.error) throw new Error(profiles.error.message);

    const portalClients = (
      (profiles.data ?? []) as unknown as { client_id: string; created_at: string | null; clients: { name: string } | { name: string }[] | null }[]
    ).map((p) => {
      const c = Array.isArray(p.clients) ? p.clients[0] : p.clients;
      return {
        clientId: p.client_id,
        name: c?.name ?? "Client",
        since: p.created_at ? todayInTz(null, new Date(p.created_at)) : since,
      };
    });
    const activity = [
      ...statuses.map((s) => ({ clientId: s.client_id, date: todayInTz(null, new Date(s.updated_at)) })),
      ...logs.map((l) => ({ clientId: l.client_id, date: l.log_date })),
    ];
    return inactiveClients({
      portalClients,
      activity,
      today,
      thresholdDays: INACTIVE_AFTER_DAYS,
      lookbackDays: INACTIVE_LOOKBACK_DAYS,
    });
  },
  ["dashboard-inactive-clients"],
  {
    tags: [CACHE_TAGS.foodLog, CACHE_TAGS.mealEntryStatuses, CACHE_TAGS.clients, CACHE_TAGS.profiles],
    revalidate: 300,
  }
);
