import { describe, expect, it } from "vitest";
import {
  calculateDiaryDay,
  emptyTotals,
  nutritionForAmount,
  planEntryNutrition,
  resolveAmount,
  snapshotForCatalogItem,
  sumTotals,
  type NutritionSource,
  type PlanEntryLike,
} from "./diary";

const oats: NutritionSource = {
  calories: 380,
  protein: 13,
  carbs: 60,
  fat: 7,
  fiber: 10,
  sugar: 1,
  sat_fat: 1.2,
  salt: 0.02,
  micronutrients: { iron_mg: 4, magnesium_mg: 130 },
};
const milk: NutritionSource = {
  calories: 50,
  protein: 3.4,
  carbs: 4.8,
  fat: 1.5,
  fiber: null,
  sugar: 4.8,
  sat_fat: 1,
  salt: 0.1,
  micronutrients: { calcium_mg: 120, iron_mg: 0.1 },
};

describe("nutritionForAmount", () => {
  it("scales per-100 values", () => {
    const t = nutritionForAmount(oats, 50);
    expect(t.calories).toBeCloseTo(190);
    expect(t.protein).toBeCloseTo(6.5);
    expect(t.micronutrients.iron_mg).toBeCloseTo(2);
  });

  it("treats null nutrients as 0 and missing micronutrients as empty", () => {
    const t = nutritionForAmount({ ...milk, micronutrients: undefined }, 200);
    expect(t.fiber).toBe(0);
    expect(t.calories).toBeCloseTo(100);
    expect(t.micronutrients).toEqual({});
  });

  it("skips non-number micronutrient values", () => {
    const t = nutritionForAmount(
      { ...oats, micronutrients: { iron_mg: 4, bad: "x" as unknown as number, nan: NaN } },
      100
    );
    expect(t.micronutrients).toEqual({ iron_mg: 4 });
  });
});

describe("resolveAmount", () => {
  it("passes g/ml through", () => {
    expect(resolveAmount({ kind: "food" }, 120, "g")).toBe(120);
    expect(resolveAmount({ kind: "ingredient" }, 250, "ml")).toBe(250);
  });
  it("converts servings using serving size", () => {
    expect(resolveAmount({ kind: "food", servingSize: 30 }, 2, "serving")).toBe(60);
  });
  it("rejects serving without serving size", () => {
    expect(() => resolveAmount({ kind: "food", servingSize: null }, 1, "serving")).toThrow();
    expect(() => resolveAmount({ kind: "ingredient" }, 1, "serving")).toThrow();
  });
  it("recipes use portions only", () => {
    expect(resolveAmount({ kind: "recipe" }, 1.5, "portion")).toBe(1.5);
    expect(() => resolveAmount({ kind: "recipe" }, 100, "g")).toThrow();
    expect(() => resolveAmount({ kind: "food" }, 1, "portion")).toThrow();
  });
  it("rejects non-positive quantities", () => {
    expect(() => resolveAmount({ kind: "food" }, 0, "g")).toThrow();
  });
});

describe("snapshotForCatalogItem", () => {
  it("snapshots a food by weight", () => {
    const s = snapshotForCatalogItem(
      { kind: "food", name: "Oats", brand: "Acme", per100: { ...oats, micronutrients: oats.micronutrients ?? {} } },
      40,
      "g"
    );
    expect(s.name).toBe("Oats");
    expect(s.brand).toBe("Acme");
    expect(s.calories).toBeCloseTo(152);
    expect(s.micronutrients.magnesium_mg).toBeCloseTo(52);
  });

  it("snapshots servings", () => {
    const s = snapshotForCatalogItem(
      { kind: "food", name: "Bar", brand: null, servingSize: 25, per100: { ...oats, micronutrients: {} } },
      2,
      "serving"
    );
    expect(s.calories).toBeCloseTo(190);
  });

  it("snapshots recipe portions", () => {
    const s = snapshotForCatalogItem(
      {
        kind: "recipe",
        name: "Stew",
        brand: null,
        perPortion: { ...oats, calories: 500, micronutrients: { iron_mg: 3 } },
      },
      1.5,
      "portion"
    );
    expect(s.calories).toBeCloseTo(750);
    expect(s.micronutrients.iron_mg).toBeCloseTo(4.5);
  });
});

describe("planEntryNutrition", () => {
  const recipeEntry = (portions: number): PlanEntryLike => ({
    id: "r",
    meal_type: "lunch",
    portions,
    quantity: null,
    recipe: {
      portions: 2,
      recipe_ingredients: [
        { quantity: 100, ingredient: oats },
        { quantity: 200, ingredient: milk },
      ],
    },
  });

  it("computes per-portion recipe nutrition times entry portions", () => {
    // total = 380 + 100 = 480 kcal for 2 portions -> 240 per portion
    expect(planEntryNutrition(recipeEntry(1)).calories).toBeCloseTo(240);
    expect(planEntryNutrition(recipeEntry(2)).calories).toBeCloseTo(480);
    expect(planEntryNutrition(recipeEntry(1)).micronutrients.iron_mg).toBeCloseTo((4 + 0.2) / 2);
  });

  it("handles direct ingredient entries (quantity x portions)", () => {
    const t = planEntryNutrition({
      meal_type: "snack",
      portions: 2,
      quantity: 50,
      ingredient: oats,
    });
    expect(t.calories).toBeCloseTo(380);
  });

  it("returns zeros for an entry without content", () => {
    expect(planEntryNutrition({ meal_type: "snack", portions: 1, quantity: null })).toEqual(emptyTotals());
  });
});

describe("calculateDiaryDay", () => {
  const entry = (id: string, meal: PlanEntryLike["meal_type"], kcalPer100: number): PlanEntryLike => ({
    id,
    meal_type: meal,
    portions: 1,
    quantity: 100,
    ingredient: { ...oats, calories: kcalPer100 },
  });
  const log = (meal: PlanEntryLike["meal_type"], calories: number) => ({
    meal_type: meal,
    calories,
    protein: 10,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sat_fat: 0,
    salt: 0,
    micronutrients: { iron_mg: 1 },
  });

  const planEntries = [
    entry("a", "breakfast", 400),
    entry("b", "lunch", 600),
    entry("c", "dinner", 500),
    entry("d", "snack", 200),
  ];

  it("counts plan meals only when eaten; skipped never; pending only in projection", () => {
    const day = calculateDiaryDay({
      planEntries,
      statuses: [
        { meal_plan_entry_id: "a", status: "eaten" },
        { meal_plan_entry_id: "b", status: "skipped" },
        { meal_plan_entry_id: "c", status: "eaten", portion_factor: 0.5 },
      ],
      logEntries: [],
    });
    expect(day.eaten.calories).toBeCloseTo(400 + 250);
    expect(day.projected.calories).toBeCloseTo(400 + 250 + 200); // + pending "d"
    expect(day.counts).toEqual({ planEaten: 2, planSkipped: 1, planPending: 1, logged: 0 });
    expect(day.byMeal.lunch.calories).toBe(0);
    expect(day.byMeal.dinner.calories).toBeCloseTo(250);
  });

  it("always counts logged entries and aggregates micronutrients", () => {
    const day = calculateDiaryDay({
      planEntries,
      statuses: [{ meal_plan_entry_id: "a", status: "eaten", portion_factor: 1.5 }],
      logEntries: [log("snack", 150), log("breakfast", 100)],
    });
    expect(day.eaten.calories).toBeCloseTo(600 + 250);
    expect(day.byMeal.breakfast.calories).toBeCloseTo(600 + 100);
    expect(day.byMeal.snack.calories).toBeCloseTo(150);
    expect(day.eaten.protein).toBeCloseTo(13 * 1.5 + 20);
    expect(day.eaten.micronutrients.iron_mg).toBeCloseTo(4 * 1.5 + 2);
    expect(day.counts.logged).toBe(2);
    // projection keeps logged + eaten, adds pending b, c, d
    expect(day.projected.calories).toBeCloseTo(850 + 600 + 500 + 200);
  });

  it("works with only quick-add / logged entries and an empty plan", () => {
    const day = calculateDiaryDay({ planEntries: [], statuses: [], logEntries: [log("lunch", 320)] });
    expect(day.eaten.calories).toBe(320);
    expect(day.projected.calories).toBe(320);
    expect(day.counts).toEqual({ planEaten: 0, planSkipped: 0, planPending: 0, logged: 1 });
  });

  it("an empty day is all zeros", () => {
    const day = calculateDiaryDay({ planEntries: [], statuses: [], logEntries: [] });
    expect(day.eaten).toEqual(emptyTotals());
    expect(day.projected).toEqual(emptyTotals());
  });

  it("sumTotals adds micronutrients across items", () => {
    const t = sumTotals([nutritionForAmount(oats, 100), nutritionForAmount(milk, 100)]);
    expect(t.micronutrients.iron_mg).toBeCloseTo(4.1);
    expect(t.calories).toBeCloseTo(430);
  });
});
