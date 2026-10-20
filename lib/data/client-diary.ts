import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import { collectPages } from "@/lib/portal/catalog";
import { addDays } from "@/lib/format";
import type { Client, FoodLogEntry, MealEntryStatus, MealPlan } from "@/lib/supabase/types";
import type { RangePlanEntry } from "@/lib/portal/diary-range";
import type { WeightPoint } from "@/lib/portal/weight";

const REVALIDATE = 300;

/** A plan entry with the recipe / ingredient embeds, read from the BASE tables (admin only). */
export type AdminPlanEntry = RangePlanEntry & {
  recipe: { name: string; portions: number; recipe_ingredients: { quantity: number; ingredient: unknown }[] } | null;
  ingredient: { name: string } | null;
};

export interface ClientDiaryData {
  client: Client | null;
  /** Every plan up to the end of the range (targets fall back to the latest earlier plan). */
  plans: MealPlan[];
  /** Entries of plans that overlap the range. */
  entries: AdminPlanEntry[];
  statuses: Pick<MealEntryStatus, "meal_plan_entry_id" | "status" | "portion_factor">[];
  logs: FoodLogEntry[];
  weights: WeightPoint[];
}

const must = <T>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as T;
};

/**
 * Everything the admin client-diary page needs for one client and range, as one cached bundle.
 * Service client + base tables: the `*_public` views return nothing without a user JWT.
 * Tagged on every table it reads, so customer diary / status / weight writes refresh it.
 */
export const getClientDiary = unstable_cache(
  async (clientId: string, from: string, to: string): Promise<ClientDiaryData> => {
    const sb = createServiceClient();

    const [clientRes, plansRes] = await Promise.all([
      sb.from("clients").select("*").eq("id", clientId).maybeSingle(),
      sb.from("meal_plans").select("*").eq("client_id", clientId).lte("week_start", to).order("week_start", { ascending: false }),
    ]);
    if (clientRes.error) throw new Error(clientRes.error.message);
    const client = (clientRes.data as Client | null) ?? null;
    const plans = must<MealPlan[]>(plansRes as never);

    const overlapFrom = addDays(from, -6);
    const overlapping = plans.filter((p) => p.week_start >= overlapFrom);
    const planIds = overlapping.map((p) => p.id);

    const [entries, statuses, logs, weights] = await Promise.all([
      planIds.length
        ? collectPages<AdminPlanEntry>(async (a, b) => {
            const { data, error } = await sb
              .from("meal_plan_entries")
              .select("*, recipe:recipes(name, portions, recipe_ingredients(quantity, ingredient:ingredients(*))), ingredient:ingredients(*)")
              .in("meal_plan_id", planIds)
              .order("id")
              .range(a, b);
            if (error) throw new Error(error.message);
            return (data ?? []) as unknown as AdminPlanEntry[];
          })
        : Promise.resolve([] as AdminPlanEntry[]),
      collectPages<ClientDiaryData["statuses"][number]>(async (a, b) => {
        const { data, error } = await sb
          .from("meal_entry_status")
          .select("meal_plan_entry_id, status, portion_factor")
          .eq("client_id", clientId)
          .order("meal_plan_entry_id")
          .range(a, b);
        if (error) throw new Error(error.message);
        return (data ?? []) as ClientDiaryData["statuses"];
      }),
      collectPages<FoodLogEntry>(async (a, b) => {
        const { data, error } = await sb
          .from("food_log_entries")
          .select("*")
          .eq("client_id", clientId)
          .gte("log_date", from)
          .lte("log_date", to)
          .order("log_date")
          .order("created_at")
          .order("id")
          .range(a, b);
        if (error) throw new Error(error.message);
        return (data ?? []) as FoodLogEntry[];
      }),
      collectPages<WeightPoint>(async (a, b) => {
        const { data, error } = await sb
          .from("weight_logs")
          .select("log_date, weight_kg")
          .eq("client_id", clientId)
          .order("log_date")
          .range(a, b);
        if (error) throw new Error(error.message);
        return ((data ?? []) as { log_date: string; weight_kg: number | string }[]).map((r) => ({
          log_date: r.log_date,
          weight_kg: Number(r.weight_kg),
        }));
      }),
    ]);

    return { client, plans, entries, statuses, logs, weights };
  },
  ["client-diary"],
  {
    tags: [
      CACHE_TAGS.foodLog,
      CACHE_TAGS.mealEntryStatuses,
      CACHE_TAGS.clients,
      CACHE_TAGS.mealPlans,
      CACHE_TAGS.recipes,
      CACHE_TAGS.ingredients,
    ],
    revalidate: REVALIDATE,
  }
);
