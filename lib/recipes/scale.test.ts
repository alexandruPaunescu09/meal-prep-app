import { describe, expect, it } from "vitest";
import type { Ingredient } from "@/lib/supabase/types";
import { canScale, clientDailyTarget, perMealTarget, roundScaled, scaleRecipe } from "./scale";

function ing(over: Partial<Ingredient> & { id: string }): Ingredient {
  return {
    name: over.id,
    brand: null,
    category: "other",
    quantity_purchased: 1000,
    unit: "g",
    package_price: 10,
    price_per_unit: 0.01,
    piece_weight_g: null,
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
    fiber: 0,
    sugar: 0,
    sat_fat: 0,
    salt: 0,
    micronutrients: {},
    api_source: null,
    barcode: null,
    created_at: "",
    updated_at: "",
    ...over,
  } as Ingredient;
}

// 620 kcal per portion for 1 portion: 400 g of 100 kcal/100g + 220 g of 100 kcal/100g.
const rice = ing({ id: "rice", calories: 100 });
const oil = ing({ id: "oil", calories: 100 });

describe("roundScaled", () => {
  it("rounds g/ml to 5 under 100 and 10 from 100", () => {
    expect(roundScaled(52, 60, "g")).toBe(50);
    expect(roundScaled(53, 60, "g")).toBe(55);
    expect(roundScaled(97, 100, "g")).toBe(95);
    expect(roundScaled(104, 100, "g")).toBe(100);
    expect(roundScaled(106, 100, "ml")).toBe(110);
  });
  it("never rounds a non-zero quantity to 0", () => {
    expect(roundScaled(1, 10, "g")).toBe(5);
    expect(roundScaled(0.2, 1, "buc")).toBe(1);
    expect(roundScaled(0.1, 0.5, "buc")).toBe(0.5);
  });
  it("pieces: whole unless the original had a half", () => {
    expect(roundScaled(2.4, 3, "buc")).toBe(2);
    expect(roundScaled(2.6, 3, "buc")).toBe(3);
    expect(roundScaled(1.3, 1.5, "buc")).toBe(1.5);
    expect(roundScaled(2.2, 2.5, "buc")).toBe(2);
    expect(roundScaled(2.3, 2.5, "buc")).toBe(2.5);
    // odd fraction in the original (0.3) does not unlock halves
    expect(roundScaled(1.4, 1.3, "buc")).toBe(1);
  });
});

describe("scaleRecipe", () => {
  it("scales 620 to 500 kcal within rounding", () => {
    const r = scaleRecipe({
      lines: [
        { key: "a", ingredient: rice, quantity: 400 },
        { key: "b", ingredient: oil, quantity: 220 },
      ],
      portions: 1,
      targetKcal: 500,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.before.calories).toBeCloseTo(620);
    expect(r.factor).toBeCloseTo(500 / 620);
    expect(Math.abs(r.drift)).toBeLessThanOrEqual(10);
    expect(r.after.calories).toBeCloseTo(500 + r.drift);
    expect(r.lines.map((l) => l.after)).toEqual([320, 180]);
  });

  it("uses per-portion kcal for multi-portion recipes", () => {
    const r = scaleRecipe({
      lines: [{ key: "a", ingredient: rice, quantity: 1000 }],
      portions: 2,
      targetKcal: 250,
    });
    expect(r.ok && r.after.calories).toBe(250);
    expect(r.ok && r.lines[0].after).toBe(500);
  });

  it("pieces never reach 0 and stay whole; halves are kept", () => {
    const egg = ing({ id: "egg", unit: "buc", piece_weight_g: 60, calories: 150 });
    const half = ing({ id: "half", unit: "buc", piece_weight_g: 100, calories: 100 });
    const r = scaleRecipe({
      lines: [
        { key: "egg", ingredient: egg, quantity: 2 },
        { key: "half", ingredient: half, quantity: 1.5 },
        { key: "rice", ingredient: rice, quantity: 300 },
      ],
      portions: 1,
      targetKcal: 100,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const egg2 = r.lines[0].after;
    const half2 = r.lines[1].after;
    expect(egg2).toBeGreaterThan(0);
    expect(Number.isInteger(egg2)).toBe(true);
    expect(half2).toBeGreaterThan(0);
    expect((half2 * 2) % 1).toBe(0);
  });

  it("scales unticked (not counted) lines but ignores them for kcal", () => {
    const r = scaleRecipe({
      lines: [
        { key: "a", ingredient: rice, quantity: 400 },
        { key: "o", ingredient: oil, quantity: 100, counts: false },
      ],
      portions: 1,
      targetKcal: 200,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.before.calories).toBeCloseTo(400);
    expect(r.lines[1].after).toBe(50);
  });

  it("refuses a recipe with 0 kcal and a bad target", () => {
    const water = ing({ id: "water", calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(scaleRecipe({ lines: [{ key: "w", ingredient: water, quantity: 200 }], portions: 1, targetKcal: 500 })).toEqual({
      ok: false,
      reason: "no_nutrition",
    });
    expect(scaleRecipe({ lines: [{ key: "a", ingredient: rice, quantity: 100 }], portions: 1, targetKcal: 0 })).toEqual({
      ok: false,
      reason: "bad_target",
    });
  });

  it("handles an ingredient lacking nutrition and reports it", () => {
    const mystery = ing({ id: "mystery", name: "Mystery", calories: null, protein: null, carbs: null, fat: null });
    const r = scaleRecipe({
      lines: [
        { key: "a", ingredient: rice, quantity: 400 },
        { key: "m", ingredient: mystery, quantity: 50 },
      ],
      portions: 1,
      targetKcal: 200,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.noNutritionNames).toEqual(["Mystery"]);
    expect(r.lines[1].after).toBe(25);
  });

  it("canScale needs a counted line with calories", () => {
    const water = ing({ id: "water", calories: 0 });
    expect(canScale([{ key: "w", ingredient: water, quantity: 100 }])).toBe(false);
    expect(canScale([{ key: "r", ingredient: rice, quantity: 100 }])).toBe(true);
    expect(canScale([])).toBe(false);
  });

  it("piece weights feed the kcal like calculateRecipe", () => {
    const egg = ing({ id: "egg", unit: "buc", piece_weight_g: 50, calories: 100 });
    const r = scaleRecipe({ lines: [{ key: "e", ingredient: egg, quantity: 4 }], portions: 1, targetKcal: 100 });
    expect(r.ok && r.before.calories).toBe(200);
    expect(r.ok && r.lines[0].after).toBe(2);
  });
});

describe("client targets", () => {
  it("divides the daily target by meals per day", () => {
    expect(perMealTarget(2100, 3)).toBe(700);
    expect(perMealTarget(null, 3)).toBeNull();
    expect(perMealTarget(2100, 0)).toBeNull();
  });

  it("prefers the latest plan target, else the client's", () => {
    const client = { calorie_target: 1800, weight_kg: 80, target_weight_kg: null };
    const plans = [
      { week_start: "2026-10-05", calorie_target: 2000, protein_per_kg: null, fat_per_kg: null },
      { week_start: "2026-10-19", calorie_target: 2200, protein_per_kg: null, fat_per_kg: null },
      { week_start: "2026-10-26", calorie_target: null, protein_per_kg: null, fat_per_kg: null },
    ];
    expect(clientDailyTarget(client, plans)).toBe(2200);
    expect(clientDailyTarget(client, [])).toBe(1800);
    expect(clientDailyTarget({ ...client, calorie_target: null }, [])).toBeNull();
  });
});
