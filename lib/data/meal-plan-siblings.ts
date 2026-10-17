import { createServiceClient } from "./service-client";

export interface SiblingPlan {
  id: string;
  name: string;
  week_start: string;
}

export interface MealPlanSiblings {
  prev: SiblingPlan | null;
  next: SiblingPlan | null;
}

/**
 * Nearest earlier / later plans of the same client (by week_start). Uncached:
 * two tiny indexed-ish queries, and plan creation elsewhere would otherwise
 * need to invalidate yet another tag.
 */
export async function getMealPlanSiblings(
  planId: string,
  clientId: string | null,
  weekStart: string
): Promise<MealPlanSiblings> {
  if (!clientId) return { prev: null, next: null };
  const supabase = createServiceClient();
  const base = () =>
    supabase
      .from("meal_plans")
      .select("id, name, week_start")
      .eq("client_id", clientId)
      .neq("id", planId);
  const [prev, next] = await Promise.all([
    base().lt("week_start", weekStart).order("week_start", { ascending: false }).limit(1),
    base().gt("week_start", weekStart).order("week_start", { ascending: true }).limit(1),
  ]);
  return {
    prev: ((prev.data as SiblingPlan[] | null) ?? [])[0] ?? null,
    next: ((next.data as SiblingPlan[] | null) ?? [])[0] ?? null,
  };
}
