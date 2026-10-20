import type { FoodLogEntry, MealStatus, MealType, NutritionTotals } from "@/lib/supabase/types";
import type { ResolvedTargets } from "@/lib/calculations/meal-plan";
import { planEntryNutrition, type DiaryDay, type PlanEntryLike } from "@/lib/calculations/diary";
import { topOffPlanFoods, type TopFood } from "@/lib/calculations/client-insights";
import {
  buildDiaryRange,
  planForDate,
  streaks,
  summarizeRange,
  type RangeSummary,
} from "@/lib/portal/diary-range";
import { addDays } from "@/lib/format";
import { sortByMealType } from "@/lib/portal/entry-helpers";
import type { ClientDiaryData } from "./client-diary";

export const RANGE_DAYS = 30;

export interface PlanMealView {
  entryId: string;
  mealType: MealType;
  title: string;
  status: MealStatus | null;
  portionFactor: number | null;
  /** Planned nutrition of the whole entry, before any portion factor. */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DayView {
  date: string;
  diary: DiaryDay;
  targets: ResolvedTargets;
  offPlanKcal: number;
  planMeals: PlanMealView[];
  logs: FoodLogEntry[];
  planName: string | null;
}

export interface WindowView {
  summary: RangeSummary;
  topFoods: TopFood[];
}

export interface ClientDiaryView {
  today: string;
  from: string;
  /** Newest first, up to today. */
  days: DayView[];
  windows: { 7: WindowView; 30: WindowView };
  streak: { current: number; best: number };
  hasAnyActivity: boolean;
}

/** Pure: turns the loaded rows into everything the page renders. */
export function buildClientDiaryView(data: ClientDiaryData, today: string): ClientDiaryView {
  const from = addDays(today, -(RANGE_DAYS - 1));
  const range = buildDiaryRange({
    from,
    to: today,
    plans: data.plans,
    entries: data.entries as never,
    statuses: data.statuses,
    logs: data.logs,
    client: data.client,
  });

  const statusById = new Map(data.statuses.map((s) => [s.meal_plan_entry_id, s]));
  const entriesBySlot = new Map<string, ClientDiaryData["entries"]>();
  for (const e of data.entries) {
    const k = `${e.meal_plan_id}:${e.day_of_week}`;
    const list = entriesBySlot.get(k);
    if (list) list.push(e);
    else entriesBySlot.set(k, [e]);
  }
  const logsByDate = new Map<string, FoodLogEntry[]>();
  for (const l of data.logs) {
    const list = logsByDate.get(l.log_date);
    if (list) list.push(l);
    else logsByDate.set(l.log_date, [l]);
  }
  const planNameById = new Map(data.plans.map((p) => [p.id, p.name]));

  const days: DayView[] = range.map((d) => {
    const covering = planForDate(data.plans, d.date);
    const slot = covering ? entriesBySlot.get(`${covering.plan.id}:${covering.dayOfWeek}`) ?? [] : [];
    const planMeals = sortByMealType(slot).map((e): PlanMealView => {
      const n = planEntryNutrition(e as unknown as PlanEntryLike);
      const s = statusById.get(e.id);
      return {
        entryId: e.id,
        mealType: e.meal_type,
        title:
          e.recipe?.name ??
          (e.ingredient ? `${e.ingredient.name}${e.quantity ? ` (${e.quantity}g)` : ""}` : "—"),
        status: s?.status ?? null,
        portionFactor: s?.status === "eaten" ? (s.portion_factor ?? null) : null,
        calories: n.calories,
        protein: n.protein,
        carbs: n.carbs,
        fat: n.fat,
      };
    });
    return {
      date: d.date,
      diary: d.diary,
      targets: d.targets,
      offPlanKcal: d.offPlan.calories,
      planMeals,
      logs: logsByDate.get(d.date) ?? [],
      planName: d.planId ? planNameById.get(d.planId) ?? null : null,
    };
  });

  const windowOf = (n: 7 | 30): WindowView => {
    const slice = range.slice(-n);
    const start = slice[0]?.date ?? from;
    return {
      summary: summarizeRange(slice, today),
      topFoods: topOffPlanFoods(data.logs.filter((l) => l.log_date >= start)),
    };
  };

  return {
    today,
    from,
    days: [...days].reverse(),
    windows: { 7: windowOf(7), 30: windowOf(30) },
    streak: streaks(range, today),
    hasAnyActivity: range.some((d) => d.active),
  };
}

export type { NutritionTotals };
