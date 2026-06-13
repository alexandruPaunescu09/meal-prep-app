import { MealPlan } from "@/lib/supabase/types";
import { addDaysLocal, compareLocalDate } from "./entry-helpers";

export interface ResolvedPlanForDate {
  plan: MealPlan;
  /** 1=Mon … 7=Sun, matching meal_plan_entries.day_of_week */
  dayOfWeek: number;
}

/**
 * Given a customer's plans and a YYYY-MM-DD date, return the plan whose
 * 7-day window covers that date plus the day_of_week within that plan.
 * If multiple plans overlap the date (shouldn't happen in normal use,
 * but is allowed by the schema), prefer the one with the latest week_start.
 * Returns null when no plan covers the date.
 */
export function resolvePlanForDate(
  plans: MealPlan[],
  dateStr: string
): ResolvedPlanForDate | null {
  let best: ResolvedPlanForDate | null = null;
  for (const plan of plans) {
    const start = plan.week_start;
    const end = addDaysLocal(start, 6);
    if (compareLocalDate(dateStr, start) < 0) continue;
    if (compareLocalDate(dateStr, end) > 0) continue;
    const offset = daysBetween(start, dateStr);
    const dow = offset + 1;
    if (!best || compareLocalDate(plan.week_start, best.plan.week_start) > 0) {
      best = { plan, dayOfWeek: dow };
    }
  }
  return best;
}

/** Days between two YYYY-MM-DD strings (b - a). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((p) => parseInt(p, 10));
  const [by, bm, bd] = b.split("-").map((p) => parseInt(p, 10));
  const da = new Date(ay, am - 1, ad).getTime();
  const db = new Date(by, bm - 1, bd).getTime();
  return Math.round((db - da) / 86400000);
}
