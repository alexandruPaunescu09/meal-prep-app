import { describe, expect, it } from "vitest";
import {
  calculateDiaryDay,
  planEntryNutrition,
  sumTotals,
  type NutritionSource,
  type PlanEntryLike,
} from "./diary";
import {
  coverage,
  entryLabel,
  entryTotals,
  kcalSplit,
  limitRows,
  micronutrientRows,
  referenceRow,
} from "./nutrition-details";
import type { FoodLogEntry } from "@/lib/supabase/types";

const oats: NutritionSource = {
  calories: 380, protein: 13, carbs: 60, fat: 7, fiber: 10, sugar: 1, sat_fat: 1.2, salt: 0.02,
  micronutrients: { iron_mg: 4, magnesium_mg: 130 },
};
const rice: NutritionSource = {
  calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0, sat_fat: 0.1, salt: 0,
  micronutrients: {},
};

function log(over: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: "x", client_id: "c", log_date: "2026-10-19", meal_type: "snack", source_kind: "food",
    food_id: null, ingredient_id: null, recipe_id: null, quantity: 100, quantity_unit: "g",
    name: "Item", brand: null, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0,
    sat_fat: 0, salt: 0, micronutrients: {}, created_at: "", updated_at: "", ...over,
  };
}

describe("kcalSplit", () => {
  it("uses 4/4/9 kcal per gram and sums to 100", () => {
    const s = kcalSplit({ protein: 25, carbs: 50, fat: 10 })!;
    // 100 + 200 + 90 = 390
    expect(s.protein).toBeCloseTo(25.64, 1);
    expect(s.carbs).toBeCloseTo(51.28, 1);
    expect(s.fat).toBeCloseTo(23.08, 1);
    expect(s.protein + s.carbs + s.fat).toBeCloseTo(100);
  });
  it("is null with no macros", () => {
    expect(kcalSplit({ protein: 0, carbs: 0, fat: 0 })).toBeNull();
  });
});

describe("reference values", () => {
  it("computes % of RI and NRV", () => {
    expect(referenceRow("salt", 3).percent).toBeCloseTo(50);
    expect(referenceRow("iron_mg", 7).percent).toBeCloseTo(50);
    expect(limitRows({ sugar: 45, sat_fat: 20, salt: 0 }).map((r) => r.percent)).toEqual([50, 100, 0]);
  });
  it("returns null for nutrients without a reference", () => {
    expect(referenceRow("fiber", 20).percent).toBeNull();
    expect(referenceRow("vitamin_b6_mg", 1).percent).toBeNull();
  });
  it("sorts micronutrients by % desc with unreferenced last and drops zeros", () => {
    const rows = micronutrientRows({
      micronutrients: { calcium_mg: 80, iron_mg: 14, vitamin_b6_mg: 1, zinc_mg: 0, selenium_ug: 11 },
    });
    expect(rows.map((r) => r.key)).toEqual(["iron_mg", "selenium_ug", "calcium_mg", "vitamin_b6_mg"]);
  });
});

describe("coverage", () => {
  it("counts items with micros as covered, all items in total", () => {
    expect(
      coverage([{ micronutrients: { iron_mg: 1 } }, { micronutrients: {} }, { micronutrients: null }, {}])
    ).toEqual({ covered: 1, total: 4 });
  });
});

describe("entryLabel", () => {
  it("derives per 100 for g/ml entries", () => {
    const l = entryLabel(log({ quantity: 250, quantity_unit: "g", calories: 500, protein: 20, micronutrients: { iron_mg: 5 } }));
    expect(l.per100!.calories).toBeCloseTo(200);
    expect(l.per100!.micronutrients.iron_mg).toBeCloseTo(2);
    expect(l.perUnit).toBeNull();
    expect(l.total.calories).toBe(500);
  });
  it("derives per serving / portion", () => {
    const s = entryLabel(log({ quantity: 2, quantity_unit: "serving", calories: 300 }));
    expect(s.perUnit).toMatchObject({ label: "serving" });
    expect(s.perUnit!.values.calories).toBeCloseTo(150);
    expect(s.per100).toBeNull();
    expect(entryLabel(log({ quantity: 1.5, quantity_unit: "portion", calories: 300 })).perUnit!.label).toBe("portion");
  });
});

describe("mixed day equals the sum of item nutrition", () => {
  const planEntries: PlanEntryLike[] = [
    { id: "p1", meal_type: "breakfast", portions: 1, quantity: 80, ingredient: oats },
    { id: "p2", meal_type: "lunch", portions: 2, quantity: 150, ingredient: rice },
    { id: "p3", meal_type: "dinner", portions: 1, quantity: 100, ingredient: oats }, // skipped
    { id: "p4", meal_type: "dinner", portions: 1, quantity: 100, ingredient: oats }, // pending
  ];
  const logs = [
    log({ id: "l1", meal_type: "snack", calories: 210, protein: 8, carbs: 20, fat: 11, fiber: 2, sugar: 6, sat_fat: 3, salt: 0.4, micronutrients: { calcium_mg: 100, iron_mg: 1.5 } }),
    log({ id: "l2", meal_type: "breakfast", calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4, sugar: 19, sat_fat: 0, salt: 0, micronutrients: {} }),
  ];
  const day = calculateDiaryDay({
    planEntries,
    statuses: [
      { meal_plan_entry_id: "p1", status: "eaten" },
      { meal_plan_entry_id: "p2", status: "eaten", portion_factor: 0.5 },
      { meal_plan_entry_id: "p3", status: "skipped" },
    ],
    logEntries: logs,
  });

  it("eaten totals = sum of eaten plan meals (x factor) + log snapshots", () => {
    const expected = sumTotals([
      planEntryNutrition(planEntries[0]),
      { ...planEntryNutrition(planEntries[1]), calories: planEntryNutrition(planEntries[1]).calories * 0.5, protein: planEntryNutrition(planEntries[1]).protein * 0.5, carbs: planEntryNutrition(planEntries[1]).carbs * 0.5, fat: planEntryNutrition(planEntries[1]).fat * 0.5, fiber: planEntryNutrition(planEntries[1]).fiber * 0.5, sugar: planEntryNutrition(planEntries[1]).sugar * 0.5, sat_fat: planEntryNutrition(planEntries[1]).sat_fat * 0.5, salt: planEntryNutrition(planEntries[1]).salt * 0.5 },
      entryTotals(logs[0]),
      entryTotals(logs[1]),
    ]);
    for (const k of ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sat_fat", "salt"] as const) {
      expect(day.eaten[k]).toBeCloseTo(expected[k], 6);
    }
    expect(day.eaten.micronutrients.iron_mg).toBeCloseTo(0.8 * 4 + 1.5, 6);
    expect(day.eaten.micronutrients.calcium_mg).toBeCloseTo(100);
    // the per-meal breakdown adds up to the day
    const byMealKcal = Object.values(day.byMeal).reduce((a, m) => a + m.calories, 0);
    expect(byMealKcal).toBeCloseTo(day.eaten.calories, 6);
  });

  it("coverage counts eaten plan meals and logs; items without micros are uncovered", () => {
    const items = [
      planEntryNutrition(planEntries[0]), // oats: micros
      planEntryNutrition(planEntries[1]), // rice: none
      ...logs.map(entryTotals),
    ];
    expect(coverage(items)).toEqual({ covered: 2, total: 4 });
  });
});
