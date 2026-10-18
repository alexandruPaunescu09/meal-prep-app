import { describe, expect, it } from "vitest";
import type { BarcodeLookup } from "@/lib/nutrition/open-food-facts";
import { parseServing } from "@/lib/nutrition/open-food-facts";
import { BARCODE_RE, DAILY_NEW_FOOD_LIMIT, canCreateFood, mapOffToFood } from "./foods";

const CLIENT = "client-1";

function lookup(over: Partial<BarcodeLookup["result"]["nutrition"]> = {}, rest: Partial<BarcodeLookup> = {}): BarcodeLookup {
  return {
    result: {
      name: " Biscuiți ovăz ",
      brand: "Belvita",
      source: "openfoodfacts",
      barcode: "5941234567890",
      nutrition: {
        calories: 450,
        protein: 7,
        carbs: 68,
        fat: 16,
        fiber: 6,
        sugar: 22,
        sat_fat: 7,
        salt: 0.9,
        micronutrients: { iron_mg: 2, bad: Number.NaN },
        ...over,
      },
      completeness: 4,
      confidenceScore: 0.9,
      category: null,
    },
    packageSize: { quantity: 250, unit: "g" },
    serving: { size: 50, label: "50 g" },
    unit: "g",
    perServingOnly: false,
    ...rest,
  } as BarcodeLookup;
}

describe("barcode validation", () => {
  it("accepts 8-14 digits only", () => {
    for (const ok of ["12345678", "5941234567890", "12345678901234"]) expect(BARCODE_RE.test(ok)).toBe(true);
    for (const bad of ["1234567", "123456789012345", "12ab5678", "", "1234 5678"]) expect(BARCODE_RE.test(bad)).toBe(false);
  });

  it("limits new foods per customer to 30 a day", () => {
    expect(DAILY_NEW_FOOD_LIMIT).toBe(30);
    expect(canCreateFood(29)).toBe(true);
    expect(canCreateFood(30)).toBe(false);
  });
});

describe("mapOffToFood", () => {
  it("maps a complete product to an active off food owned by the customer", () => {
    expect(mapOffToFood(lookup(), "5941234567890", CLIENT)).toEqual({
      barcode: "5941234567890",
      name: "Biscuiți ovăz",
      brand: "Belvita",
      unit: "g",
      calories: 450,
      protein: 7,
      carbs: 68,
      fat: 16,
      fiber: 6,
      sugar: 22,
      sat_fat: 7,
      salt: 0.9,
      micronutrients: { iron_mg: 2 },
      serving_size: 50,
      serving_label: "50 g",
      package_size: 250,
      source: "off",
      status: "active",
      created_by_client_id: CLIENT,
    });
  });

  it("rejects per-serving-only data", () => {
    expect(mapOffToFood(lookup({}, { perServingOnly: true }), "5941234567890", CLIENT)).toBeNull();
  });

  it.each(["calories", "protein", "carbs", "fat"] as const)("rejects a missing %s", (key) => {
    expect(mapOffToFood(lookup({ [key]: null }), "5941234567890", CLIENT)).toBeNull();
  });

  it("rejects impossible values", () => {
    expect(mapOffToFood(lookup({ calories: 5000 }), "5941234567890", CLIENT)).toBeNull();
    expect(mapOffToFood(lookup({ protein: -1 }), "5941234567890", CLIENT)).toBeNull();
    expect(mapOffToFood(lookup({ protein: 60, carbs: 60, fat: 20 }), "5941234567890", CLIENT)).toBeNull();
  });

  it("rejects a product without a name", () => {
    const l = lookup();
    l.result.name = "  ";
    expect(mapOffToFood(l, "5941234567890", CLIENT)).toBeNull();
  });

  it("keeps zero values and nulls bad optional nutrients", () => {
    const f = mapOffToFood(lookup({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 500, salt: null }), "5941234567890", CLIENT);
    expect(f).toMatchObject({ calories: 0, fat: 0, fiber: null, salt: null });
  });

  it("maps drinks to ml and tolerates a missing serving", () => {
    const f = mapOffToFood(lookup({}, { unit: "ml", serving: null, packageSize: null }), "5941234567890", CLIENT);
    expect(f).toMatchObject({ unit: "ml", serving_size: null, serving_label: null, package_size: null });
  });
});

describe("parseServing", () => {
  it("prefers the numeric serving_quantity", () => {
    expect(parseServing({ serving_quantity: "30", serving_size: "1 biscuit (30 g)" })).toEqual({
      size: 30,
      unit: null,
      label: "1 biscuit (30 g)",
    });
    expect(parseServing({ serving_quantity: 250, serving_quantity_unit: "ml", serving_size: "250 ml" })).toMatchObject({
      size: 250,
      unit: "ml",
    });
  });

  it("falls back to parsing the label, including decimal commas and cl", () => {
    expect(parseServing({ serving_size: "12,5 g" })).toMatchObject({ size: 12.5, unit: "g" });
    expect(parseServing({ serving_size: "33 cl" })).toMatchObject({ size: 330, unit: "ml" });
  });

  it("returns null when there is no usable serving", () => {
    expect(parseServing({})).toBeNull();
    expect(parseServing({ serving_size: "1 slice" })).toBeNull();
    expect(parseServing({ serving_quantity: 0 })).toBeNull();
    expect(parseServing({ serving_quantity: 99999 })).toBeNull();
  });
});
