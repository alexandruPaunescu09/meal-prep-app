import { describe, expect, it } from "vitest";
import { resolveTargets } from "./meal-plan";

const plan = { calorie_target: 2200, protein_per_kg: 2, fat_per_kg: 1 };

describe("resolveTargets", () => {
  it("computes per-kg macros on the goal weight when one is set", () => {
    const t = resolveTargets(plan, { weight_kg: 95, target_weight_kg: 80 });
    expect(t.weightBasis).toEqual({ kg: 80, source: "target" });
    expect(t.protein).toBe(160);
    expect(t.fat).toBe(80);
    // (2200 - 160*4 - 80*9) / 4
    expect(t.carbs).toBe(210);
  });

  it("falls back to the current weight without a goal", () => {
    const t = resolveTargets(plan, { weight_kg: 95, target_weight_kg: null });
    expect(t.weightBasis).toEqual({ kg: 95, source: "current" });
    expect(t.protein).toBe(190);
    expect(t.fat).toBe(95);
  });

  it("uses the goal weight even when the current weight is missing", () => {
    const t = resolveTargets(plan, { weight_kg: null, target_weight_kg: 70 });
    expect(t.weightBasis).toEqual({ kg: 70, source: "target" });
    expect(t.protein).toBe(140);
  });

  it("leaves macros unresolved without any weight", () => {
    const t = resolveTargets(plan, { weight_kg: null, target_weight_kg: null });
    expect(t.weightBasis).toBeNull();
    expect(t.protein).toBeNull();
    expect(t.carbs).toBeNull();
    expect(t.calories).toBe(2200);
    expect(t.fiber).toEqual({ min: 22, max: 30.8 });
  });

  it("flags carbs as over-allocated when protein and fat exceed the budget", () => {
    const t = resolveTargets(
      { calorie_target: 1200, protein_per_kg: 2.5, fat_per_kg: 1.2 },
      { weight_kg: 100, target_weight_kg: null }
    );
    expect(t.carbsOverAllocated).toBe(true);
    expect(t.carbs).toBe(0);
  });
});
