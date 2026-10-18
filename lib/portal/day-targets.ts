import { resolveTargets, type ResolvedTargets } from "@/lib/calculations/meal-plan";
import type { Client, MealPlan } from "@/lib/supabase/types";
import { compareLocalDate } from "@/lib/portal/entry-helpers";
import { addDays } from "@/lib/format";

type PlanTargets = Pick<MealPlan, "id" | "week_start" | "calorie_target" | "protein_per_kg" | "fat_per_kg">;
type ClientTargets = Pick<Client, "calorie_target" | "weight_kg" | "target_weight_kg">;

/**
 * Targets for a diary day:
 *  1. the plan whose week covers the date (latest week_start wins on overlap),
 *  2. else the latest plan that started before it,
 *  3. else the client's own calorie target only (no macros).
 * A plan without a calorie target falls back to the client's.
 */
export function resolveDayTargets(
  plans: PlanTargets[],
  client: ClientTargets | null,
  date: string
): ResolvedTargets {
  let covering: PlanTargets | null = null;
  let earlier: PlanTargets | null = null;
  for (const p of plans) {
    if (compareLocalDate(p.week_start, date) > 0) continue;
    if (compareLocalDate(date, addDays(p.week_start, 6)) <= 0) {
      if (!covering || compareLocalDate(p.week_start, covering.week_start) > 0) covering = p;
    } else if (!earlier || compareLocalDate(p.week_start, earlier.week_start) > 0) {
      earlier = p;
    }
  }
  const plan = covering ?? earlier;
  const resolved = plan
    ? resolveTargets(plan, client)
    : resolveTargets({ calorie_target: null, protein_per_kg: null, fat_per_kg: null }, client);
  if (resolved.calories == null && client?.calorie_target != null) {
    // Re-resolve so the derived carbs and fiber range follow the fallback calories.
    return resolveTargets(
      {
        calorie_target: client.calorie_target,
        protein_per_kg: plan?.protein_per_kg ?? null,
        fat_per_kg: plan?.fat_per_kg ?? null,
      },
      client
    );
  }
  return resolved;
}
