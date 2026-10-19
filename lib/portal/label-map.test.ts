import { describe, expect, it } from "vitest";
import { mapLabel, type RawLabel } from "./label-map";

const base: RawLabel = {
  readable: true,
  unreadable_reason: null,
  name: "Biscuiti cu ovaz",
  brand: "Dulcesti",
  unit: "g",
  basis_amount: 100,
  serving_size: null,
  serving_label: null,
  package_size: null,
  energy_kcal: 450,
  energy_kj: 1880,
  protein: 7,
  carbs: 65,
  fat: 17,
  fiber: 5,
  sugar: 20,
  sat_fat: 8,
  salt_g: 0.9,
  sodium: null,
  sodium_unit: null,
  micros: [],
};
const draftOf = (r: Partial<RawLabel>) => {
  const res = mapLabel({ ...base, ...r });
  if (!res.ok) throw new Error(`expected ok, got ${res.reason}: ${res.message}`);
  return res.draft;
};

describe("mapLabel", () => {
  it("keeps a per-100 label as printed", () => {
    const d = draftOf({});
    expect(d).toMatchObject({ name: "Biscuiti cu ovaz", brand: "Dulcesti", unit: "g", calories: 450, protein: 7, salt: 0.9 });
  });

  it("converts a per-serving label to per-100", () => {
    // 30 g serving: 135 kcal, 2.1 P, 19.5 C, 5.1 F -> x 100/30
    const d = draftOf({
      basis_amount: 30,
      energy_kcal: 135,
      energy_kj: null,
      protein: 2.1,
      carbs: 19.5,
      fat: 5.1,
      fiber: 1.5,
      sugar: 6,
      sat_fat: 2.4,
      salt_g: 0.27,
      serving_size: 30,
      serving_label: "1 portie (30 g)",
    });
    expect(d.calories).toBe(450);
    expect(d.protein).toBe(7);
    expect(d.carbs).toBe(65);
    expect(d.fat).toBe(17);
    expect(d.fiber).toBe(5);
    expect(d.salt).toBe(0.9);
    expect(d.serving_size).toBe(30);
    expect(d.serving_label).toBe("1 portie (30 g)");
  });

  it("uses a drink's ml basis", () => {
    const d = draftOf({ unit: "ml", basis_amount: 250, energy_kcal: 100, energy_kj: null, protein: 0, carbs: 25, fat: 0, fiber: null, sugar: 25, sat_fat: null, salt_g: null });
    expect(d.unit).toBe("ml");
    expect(d.calories).toBe(40);
    expect(d.carbs).toBe(10);
  });

  it("converts kJ to kcal when only kJ is printed", () => {
    const d = draftOf({ energy_kcal: null, energy_kj: 1883 });
    expect(d.calories).toBeCloseTo(450.05, 1);
  });

  it("prefers the printed kcal over kJ", () => {
    expect(draftOf({ energy_kcal: 448, energy_kj: 1880 }).calories).toBe(448);
  });

  it("converts sodium to salt x 2.5, in g or mg", () => {
    expect(draftOf({ salt_g: null, sodium: 0.36, sodium_unit: "g" }).salt).toBeCloseTo(0.9, 5);
    expect(draftOf({ salt_g: null, sodium: 360, sodium_unit: "mg" }).salt).toBeCloseTo(0.9, 5);
  });

  it("prefers printed salt over sodium", () => {
    expect(draftOf({ salt_g: 1.1, sodium: 0.36, sodium_unit: "g" }).salt).toBe(1.1);
  });

  it("maps micronutrients with units into our keys, per 100", () => {
    const d = draftOf({
      micros: [
        { nutrient: "iron", amount: 4.2, unit: "mg" },
        { nutrient: "vitamin_d", amount: 5, unit: "ug" },
        { nutrient: "calcium", amount: 0.12, unit: "g" },
        { nutrient: "vitamin_b12", amount: 0.0000025, unit: "g" },
      ],
    });
    expect(d.micronutrients).toEqual({ iron_mg: 4.2, vitamin_d_ug: 5, calcium_mg: 120, vitamin_b12_ug: 2.5 });
  });

  it("scales micronutrients from a per-serving label", () => {
    const d = draftOf({
      basis_amount: 50,
      energy_kcal: 225,
      energy_kj: null,
      protein: 3.5,
      carbs: 32.5,
      fat: 8.5,
      fiber: null,
      sugar: null,
      sat_fat: null,
      salt_g: null,
      micros: [{ nutrient: "iron", amount: 2, unit: "mg" }],
    });
    expect(d.micronutrients).toEqual({ iron_mg: 4 });
  });

  it("drops implausible micronutrients and duplicates", () => {
    const d = draftOf({
      micros: [
        { nutrient: "iron", amount: 5000, unit: "mg" },
        { nutrient: "zinc", amount: -1, unit: "mg" },
        { nutrient: "calcium", amount: 100, unit: "mg" },
        { nutrient: "calcium", amount: 999, unit: "mg" },
      ],
    });
    expect(d.micronutrients).toEqual({ calcium_mg: 100 });
  });

  it("returns the model's reason for an unreadable photo", () => {
    const r = mapLabel({ ...base, readable: false, unreadable_reason: "Photo is too blurry" });
    expect(r).toEqual({ ok: false, reason: "unreadable", message: "Photo is too blurry" });
  });

  it("is unreadable without a name, unit, basis or energy", () => {
    for (const patch of [{ name: " " }, { unit: null }, { basis_amount: 0 }, { energy_kcal: null, energy_kj: null }]) {
      const r = mapLabel({ ...base, ...patch });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("unreadable");
    }
  });

  it("rejects values that fail the shared plausibility checks", () => {
    // kcal 90 with 17 g fat / 65 g carbs cannot be right
    const r = mapLabel({ ...base, energy_kcal: 90, energy_kj: null });
    expect(r).toMatchObject({ ok: false, reason: "implausible" });
    // macros heavier than the food
    expect(mapLabel({ ...base, protein: 60, carbs: 60, fat: 20, energy_kcal: 700, energy_kj: null })).toMatchObject({ ok: false });
  });

  it("nulls impossible optional columns instead of rejecting", () => {
    expect(draftOf({ fiber: 150, salt_g: null }).fiber).toBeNull();
  });

  it("drops absurd serving and pack sizes", () => {
    const d = draftOf({ serving_size: 99999, serving_label: "x", package_size: 5e6 });
    expect(d.serving_size).toBeNull();
    expect(d.serving_label).toBeNull();
    expect(d.package_size).toBeNull();
  });

  it("trims and bounds name and brand", () => {
    const d = draftOf({ name: `  ${"a".repeat(200)}  `, brand: "  " });
    expect(d.name).toHaveLength(120);
    expect(d.brand).toBeNull();
  });
});
