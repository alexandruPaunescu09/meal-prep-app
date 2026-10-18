import { describe, expect, it } from "vitest";
import { MICRONUTRIENTS, NUTRIENTS, getNutrient, percentOfReference } from "./nutrients";

describe("nutrient registry", () => {
  it("has the EU Part B reference intakes", () => {
    const ref = (k: string) => getNutrient(k).reference;
    expect(ref("calories")).toBe(2000);
    expect(ref("fat")).toBe(70);
    expect(ref("sat_fat")).toBe(20);
    expect(ref("carbs")).toBe(260);
    expect(ref("sugar")).toBe(90);
    expect(ref("protein")).toBe(50);
    expect(ref("salt")).toBe(6);
    expect(ref("fiber")).toBeNull();
  });

  it("has the Part A NRVs for the 14 micronutrient keys in use", () => {
    expect(MICRONUTRIENTS).toHaveLength(14);
    const expected: Record<string, number> = {
      vitamin_a_ug: 800,
      vitamin_d_ug: 5,
      vitamin_e_mg: 12,
      vitamin_k_ug: 75,
      vitamin_c_mg: 80,
      folate_ug: 200,
      vitamin_b12_ug: 2.5,
      potassium_mg: 2000,
      calcium_mg: 800,
      phosphorus_mg: 700,
      magnesium_mg: 375,
      iron_mg: 14,
      zinc_mg: 10,
      selenium_ug: 55,
    };
    for (const [k, v] of Object.entries(expected)) expect(getNutrient(k).reference).toBe(v);
  });

  it("keys are unique and groups are valid", () => {
    expect(new Set(NUTRIENTS.map((n) => n.key)).size).toBe(NUTRIENTS.length);
    for (const n of NUTRIENTS) expect(["macro", "limit", "vitamin", "mineral"]).toContain(n.group);
  });

  it("marks the 8 columns", () => {
    expect(NUTRIENTS.filter((n) => n.column).map((n) => n.key)).toEqual([
      "calories", "protein", "carbs", "fat", "fiber", "sugar", "sat_fat", "salt",
    ]);
  });

  it("derives a label for unknown micronutrient keys", () => {
    const n = getNutrient("vitamin_b6_mg");
    expect(n.key).toBe("vitamin_b6_mg");
    expect(n.unit).toBe("mg");
    expect(n.label).toBe("Vitamin B6");
    expect(n.reference).toBeNull();
    expect(n.group).toBe("vitamin");
    expect(getNutrient("copper_mg").label).toBe("Copper");
    expect(getNutrient("weird").label).toBe("Weird");
  });

  it("computes percent of reference", () => {
    expect(percentOfReference("iron_mg", 7)).toBeCloseTo(50);
    expect(percentOfReference("fiber", 10)).toBeNull();
    expect(percentOfReference("unknown_mg", 10)).toBeNull();
  });
});
