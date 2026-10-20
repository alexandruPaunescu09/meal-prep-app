import type { Client, MealPlan, NutritionTotals } from "@/lib/supabase/types";
import type { ResolvedTargets } from "@/lib/calculations/meal-plan";
import {
  calculateDiaryDay,
  scaleTotals,
  sumTotals,
  type DiaryDay,
  type DiaryLogLike,
  type PlanEntryLike,
  type PlanStatusLike,
} from "@/lib/calculations/diary";
import { resolveDayTargets } from "@/lib/portal/day-targets";
import { addDays } from "@/lib/format";
import { compareLocalDate } from "@/lib/portal/entry-helpers";

/**
 * Per-day diary results over a date range (FD-10 customer trends, FD-11 admin insights). Pure: the
 * caller loads the rows (customer: RLS client + `*_public` views; admin: service client + base
 * tables) and this module does the maths with the same rules as the Today page:
 *  - plan meals count only when marked eaten (x portion_factor), skipped never;
 *  - logged entries always count (their snapshot);
 *  - targets per day come from resolveDayTargets (covering plan, else latest earlier plan, else client).
 */

export type RangePlan = Pick<MealPlan, "id" | "week_start" | "calorie_target" | "protein_per_kg" | "fat_per_kg">;
export type RangePlanEntry = PlanEntryLike & { id: string; meal_plan_id: string; day_of_week: number };
export type RangeLog = DiaryLogLike & { log_date: string };
export type RangeClient = Pick<Client, "calorie_target" | "weight_kg" | "target_weight_kg">;

export interface DiaryRangeDay {
  date: string;
  /** The plan covering this date (latest week_start wins on overlap), or null. */
  planId: string | null;
  diary: DiaryDay;
  targets: ResolvedTargets;
  /** Logged (non-plan) foods only. */
  offPlan: NutritionTotals;
  /** At least one plan meal marked eaten or one logged entry. */
  active: boolean;
}

/** Longest range accepted, so a bad input can't build an unbounded array. */
export const MAX_RANGE_DAYS = 400;

/** Every 'YYYY-MM-DD' from `from` to `to`, inclusive. Empty when to < from. */
export function datesInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; compareLocalDate(d, to) <= 0 && out.length < MAX_RANGE_DAYS; d = addDays(d, 1)) {
    out.push(d);
  }
  return out;
}

/** The plan whose week covers `date`, preferring the latest week_start; with the 1-7 day_of_week. */
export function planForDate(plans: RangePlan[], date: string): { plan: RangePlan; dayOfWeek: number } | null {
  let best: { plan: RangePlan; dayOfWeek: number } | null = null;
  for (const plan of plans) {
    if (compareLocalDate(date, plan.week_start) < 0 || compareLocalDate(date, addDays(plan.week_start, 6)) > 0) continue;
    if (best && compareLocalDate(plan.week_start, best.plan.week_start) <= 0) continue;
    let dow = 1;
    while (dow < 7 && addDays(plan.week_start, dow - 1) !== date) dow++;
    best = { plan, dayOfWeek: dow };
  }
  return best;
}

export function buildDiaryRange(input: {
  from: string;
  to: string;
  plans: RangePlan[];
  entries: RangePlanEntry[];
  statuses: PlanStatusLike[];
  logs: RangeLog[];
  client: RangeClient | null;
}): DiaryRangeDay[] {
  const entriesBySlot = new Map<string, RangePlanEntry[]>();
  for (const e of input.entries) {
    const key = `${e.meal_plan_id}:${e.day_of_week}`;
    const list = entriesBySlot.get(key);
    if (list) list.push(e);
    else entriesBySlot.set(key, [e]);
  }
  const logsByDate = new Map<string, RangeLog[]>();
  for (const l of input.logs) {
    const list = logsByDate.get(l.log_date);
    if (list) list.push(l);
    else logsByDate.set(l.log_date, [l]);
  }

  return datesInRange(input.from, input.to).map((date) => {
    const covering = planForDate(input.plans, date);
    const planEntries = covering ? entriesBySlot.get(`${covering.plan.id}:${covering.dayOfWeek}`) ?? [] : [];
    const logEntries = logsByDate.get(date) ?? [];
    const diary = calculateDiaryDay({ planEntries, statuses: input.statuses, logEntries });
    const offPlan = calculateDiaryDay({ planEntries: [], statuses: [], logEntries }).eaten;
    return {
      date,
      planId: covering?.plan.id ?? null,
      diary,
      targets: resolveDayTargets(input.plans, input.client, date),
      offPlan,
      active: diary.counts.planEaten > 0 || diary.counts.logged > 0,
    };
  });
}

/**
 * Logging streaks over days up to `today` (days must be consecutive and ascending, as built above).
 * `current` counts back from today; if today has nothing yet it counts back from yesterday, so an
 * unlogged morning doesn't break the streak. `best` is the longest run in the range.
 */
export function streaks(days: Pick<DiaryRangeDay, "date" | "active">[], today: string): { current: number; best: number } {
  const past = days.filter((d) => compareLocalDate(d.date, today) <= 0);
  let best = 0;
  let run = 0;
  for (const d of past) {
    run = d.active ? run + 1 : 0;
    best = Math.max(best, run);
  }
  let current = 0;
  let i = past.length - 1;
  if (i >= 0 && past[i].date === today && !past[i].active) i--;
  for (; i >= 0 && past[i].active; i--) current++;
  return { current, best };
}

export interface RangeSummary {
  /** Days in the range up to and including today. */
  days: number;
  activeDays: number;
  /** Mean eaten totals per active day; null when no day is active. */
  average: NutritionTotals | null;
  /** Mean of each day's resolved target over active days that have one. */
  averageTargets: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
  /** Plan meals on days up to today. `unmarked` includes today's not-yet-marked meals. */
  adherence: { eaten: number; skipped: number; unmarked: number; total: number };
  /** Share of eaten kcal that came from logged (off-plan) foods, 0-1; null when nothing was eaten. */
  offPlanKcalShare: number | null;
}

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function summarizeRange(days: DiaryRangeDay[], today: string): RangeSummary {
  const past = days.filter((d) => compareLocalDate(d.date, today) <= 0);
  const active = past.filter((d) => d.active);
  const target = (k: "calories" | "protein" | "carbs" | "fat") =>
    mean(active.map((d) => d.targets[k]).filter((v): v is number => v != null));

  const adherence = past.reduce(
    (acc, d) => {
      acc.eaten += d.diary.counts.planEaten;
      acc.skipped += d.diary.counts.planSkipped;
      acc.unmarked += d.diary.counts.planPending;
      return acc;
    },
    { eaten: 0, skipped: 0, unmarked: 0, total: 0 }
  );
  adherence.total = adherence.eaten + adherence.skipped + adherence.unmarked;

  const eatenKcal = active.reduce((a, d) => a + d.diary.eaten.calories, 0);
  const offPlanKcal = active.reduce((a, d) => a + d.offPlan.calories, 0);

  return {
    days: past.length,
    activeDays: active.length,
    average: active.length ? scaleTotals(sumTotals(active.map((d) => d.diary.eaten)), 1 / active.length) : null,
    averageTargets: {
      calories: target("calories"),
      protein: target("protein"),
      carbs: target("carbs"),
      fat: target("fat"),
    },
    adherence,
    offPlanKcalShare: eatenKcal > 0 ? offPlanKcal / eatenKcal : null,
  };
}

