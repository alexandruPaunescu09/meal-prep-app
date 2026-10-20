import { createServer } from "@/lib/supabase/server";
import { addDays } from "@/lib/format";
import { collectPages } from "@/lib/portal/catalog";
import {
  buildDiaryRange,
  type DiaryRangeDay,
  type RangeClient,
  type RangeLog,
  type RangePlan,
  type RangePlanEntry,
} from "@/lib/portal/diary-range";
import type { PlanStatusLike } from "@/lib/calculations/diary";

/** Server only (cookies). Enough history for the best streak; the UI summarizes the last 7 / 30. */
export const PROGRESS_DAYS = 90;
const ID_CHUNK = 150;

const ENTRY_SELECT = `
  *,
  recipe:recipes_public (
    *,
    recipe_ingredients (
      *,
      ingredient:ingredients_public (*)
    )
  ),
  ingredient:ingredients_public (*)
`;

/**
 * Per-day diary results for the last 90 days ending `today`, for the signed-in customer. Uses the
 * customer's RLS client and the price-free `_public` views.
 */
export async function loadProgressDays(clientId: string, today: string): Promise<DiaryRangeDay[]> {
  const supabase = await createServer();
  const from = addDays(today, -(PROGRESS_DAYS - 1));

  const [plansRes, clientRes, logs] = await Promise.all([
    supabase
      .from("meal_plans")
      .select("id, week_start, calorie_target, protein_per_kg, fat_per_kg")
      .eq("client_id", clientId)
      // A plan overlaps the range when its week starts within 6 days before `from`, up to today.
      .gte("week_start", addDays(from, -6))
      .lte("week_start", today),
    supabase.from("clients").select("calorie_target, weight_kg, target_weight_kg").eq("id", clientId).maybeSingle(),
    collectPages<RangeLog>(async (a, b) => {
      const { data, error } = await supabase
        .from("food_log_entries")
        .select("*")
        .eq("client_id", clientId)
        .gte("log_date", from)
        .lte("log_date", today)
        .order("id")
        .range(a, b);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RangeLog[];
    }),
  ]);
  if (plansRes.error) throw new Error(plansRes.error.message);

  const plans = (plansRes.data ?? []) as unknown as RangePlan[];
  const planIds = plans.map((p) => p.id);

  let entries: RangePlanEntry[] = [];
  if (planIds.length) {
    entries = await collectPages<RangePlanEntry>(async (a, b) => {
      const { data, error } = await supabase
        .from("meal_plan_entries")
        .select(ENTRY_SELECT)
        .in("meal_plan_id", planIds)
        .order("id")
        .range(a, b);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RangePlanEntry[];
    });
  }

  const statuses: PlanStatusLike[] = [];
  const entryIds = entries.map((e) => e.id);
  for (let i = 0; i < entryIds.length; i += ID_CHUNK) {
    const chunk = entryIds.slice(i, i + ID_CHUNK);
    const rows = await collectPages<PlanStatusLike>(async (a, b) => {
      const { data, error } = await supabase
        .from("meal_entry_status")
        .select("meal_plan_entry_id, status, portion_factor")
        .in("meal_plan_entry_id", chunk)
        .order("meal_plan_entry_id")
        .range(a, b);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PlanStatusLike[];
    });
    statuses.push(...rows);
  }

  return buildDiaryRange({
    from,
    to: today,
    plans,
    entries,
    statuses,
    logs,
    client: (clientRes.data as RangeClient | null) ?? null,
  });
}
