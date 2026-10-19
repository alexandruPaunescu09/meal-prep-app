import { describe, expect, it } from "vitest";
import type { NutritionSource } from "@/lib/calculations/diary";
import {
  buildDiaryRange,
  datesInRange,
  planForDate,
  streaks,
  summarizeRange,
  type RangeLog,
  type RangePlan,
  type RangePlanEntry,
} from "./diary-range";

// 100 kcal per 100 g, 10 g protein / 10 g carbs / ~2.2 g fat, so amounts read easily.
const food: NutritionSource = {
  calories: 100,
  protein: 10,
  carbs: 10,
  fat: 2,
  fiber: 1,
  sugar: 1,
  sat_fat: 0.5,
  salt: 0.1,
  micronutrients: { iron_mg: 1 },
};

// Week of Mon 12 Oct 2026; a later plan overlaps its Sunday.
const plans: RangePlan[] = [
  { id: "p1", week_start: "2026-10-12", calorie_target: 2000, protein_per_kg: 2, fat_per_kg: 1 },
  { id: "p2", week_start: "2026-10-18", calorie_target: 1800, protein_per_kg: 2, fat_per_kg: 1 },
];

const entry = (id: string, plan: string, dow: number, grams: number): RangePlanEntry => ({
  id,
  meal_plan_id: plan,
  day_of_week: dow,
  meal_type: "lunch",
  portions: 1,
  quantity: grams,
  ingredient: food,
});

const log = (date: string, kcal: number): RangeLog => ({
  log_date: date,
  meal_type: "snack",
  calories: kcal,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sat_fat: 0,
  salt: 0,
  micronutrients: null,
});

const client = { calorie_target: 2200, weight_kg: 80, target_weight_kg: null };

describe("datesInRange", () => {
  it("is inclusive and crosses month ends", () => {
    expect(datesInRange("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
  it("is empty when to is before from", () => {
    expect(datesInRange("2026-10-12", "2026-10-11")).toEqual([]);
  });
});

describe("planForDate", () => {
  it("returns the covering plan and its 1-7 day of week", () => {
    expect(planForDate(plans, "2026-10-14")).toEqual({ plan: plans[0], dayOfWeek: 3 });
  });
  it("prefers the later week_start on overlap", () => {
    expect(planForDate(plans, "2026-10-18")?.plan.id).toBe("p2");
  });
  it("returns null outside every plan", () => {
    expect(planForDate(plans, "2026-10-11")).toBeNull();
  });
});

describe("buildDiaryRange", () => {
  const entries = [entry("e1", "p1", 1, 300), entry("e2", "p1", 2, 400), entry("e3", "p1", 3, 500)];
  const statuses = [
    { meal_plan_entry_id: "e1", status: "eaten" as const, portion_factor: 0.5 },
    { meal_plan_entry_id: "e2", status: "skipped" as const },
  ];
  const days = buildDiaryRange({
    from: "2026-10-12",
    to: "2026-10-14",
    plans,
    entries,
    statuses,
    logs: [log("2026-10-12", 250), log("2026-10-14", 80)],
    client,
  });

  it("builds one day per date with the covering plan", () => {
    expect(days.map((d) => d.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(days.every((d) => d.planId === "p1")).toBe(true);
  });

  it("counts plan meals only when eaten (x portion factor) and always counts logs", () => {
    // Mon: 300 g eaten at 0.5 = 150 kcal, + 250 kcal logged.
    expect(days[0].diary.eaten.calories).toBeCloseTo(400);
    expect(days[0].offPlan.calories).toBeCloseTo(250);
    // Tue: plan meal skipped, nothing logged.
    expect(days[1].diary.eaten.calories).toBe(0);
    expect(days[1].active).toBe(false);
    // Wed: plan meal unmarked (pending, not eaten) + 80 kcal logged.
    expect(days[2].diary.eaten.calories).toBeCloseTo(80);
    expect(days[2].diary.counts.planPending).toBe(1);
    expect(days[2].active).toBe(true);
  });

  it("resolves targets per day from the plan and client weight", () => {
    expect(days[0].targets.calories).toBe(2000);
    expect(days[0].targets.protein).toBe(160);
  });
});

describe("streaks", () => {
  const d = (date: string, active: boolean) => ({ date, active });
  it("counts back from today and finds the best run", () => {
    const days = [d("2026-10-10", true), d("2026-10-11", true), d("2026-10-12", true), d("2026-10-13", false), d("2026-10-14", true), d("2026-10-15", true)];
    expect(streaks(days, "2026-10-15")).toEqual({ current: 2, best: 3 });
  });
  it("does not break the streak for an unlogged today", () => {
    const days = [d("2026-10-13", true), d("2026-10-14", true), d("2026-10-15", false)];
    expect(streaks(days, "2026-10-15")).toEqual({ current: 2, best: 2 });
  });
  it("ignores future days", () => {
    const days = [d("2026-10-14", true), d("2026-10-15", true), d("2026-10-16", true)];
    expect(streaks(days, "2026-10-15")).toEqual({ current: 2, best: 2 });
  });
  it("is zero when yesterday and today are empty", () => {
    const days = [d("2026-10-13", true), d("2026-10-14", false), d("2026-10-15", false)];
    expect(streaks(days, "2026-10-15").current).toBe(0);
  });
});

describe("summarizeRange", () => {
  const entries = [entry("e1", "p1", 1, 300), entry("e2", "p1", 2, 400), entry("e3", "p1", 3, 500), entry("e4", "p1", 4, 200)];
  const days = buildDiaryRange({
    from: "2026-10-12",
    to: "2026-10-15",
    plans,
    entries,
    statuses: [
      { meal_plan_entry_id: "e1", status: "eaten" },
      { meal_plan_entry_id: "e2", status: "skipped" },
    ],
    logs: [log("2026-10-12", 100), log("2026-10-14", 200)],
    client,
  });
  const s = summarizeRange(days, "2026-10-14");

  it("only counts days up to today", () => {
    expect(s.days).toBe(3);
    expect(s.activeDays).toBe(2);
  });

  it("averages eaten totals over active days", () => {
    // Mon 300 + 100 = 400, Wed 200 (logged only) -> 300 per active day.
    expect(s.average?.calories).toBeCloseTo(300);
    expect(s.averageTargets.calories).toBe(2000);
  });

  it("reports plan adherence up to today and the off-plan kcal share", () => {
    expect(s.adherence).toEqual({ eaten: 1, skipped: 1, unmarked: 1, total: 3 });
    expect(s.offPlanKcalShare).toBeCloseTo(300 / 600);
  });

  it("returns nulls when nothing was eaten", () => {
    const empty = summarizeRange(buildDiaryRange({ from: "2026-10-20", to: "2026-10-21", plans: [], entries: [], statuses: [], logs: [], client: null }), "2026-10-21");
    expect(empty.average).toBeNull();
    expect(empty.offPlanKcalShare).toBeNull();
    expect(empty.averageTargets.calories).toBeNull();
  });
});
