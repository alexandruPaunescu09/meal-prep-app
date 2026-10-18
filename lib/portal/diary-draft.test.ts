import { describe, expect, it } from "vitest";
import type { CatalogItem, FoodLogEntry } from "@/lib/supabase/types";
import {
  availableUnits,
  buildCatalogInput,
  buildQuickInput,
  defaultAmount,
  entryToInput,
  isEditable,
  newEntryId,
  optimisticEntry,
  parseAmount,
  parseOptionalNumber,
  previewSnapshot,
  quickSnapshot,
  scaleEntry,
} from "./diary-draft";
import { diaryEntrySchema } from "@/lib/validations/schemas";

const per100 = {
  calories: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  fiber: 2,
  sugar: 1,
  sat_fat: 1,
  salt: 0.5,
  micronutrients: {},
};
const food: CatalogItem = {
  kind: "food",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Oats",
  brand: null,
  unit: "g",
  per100,
  servingSize: 40,
  servingLabel: "1 bowl",
  verified: true,
};
const recipe: CatalogItem = {
  kind: "recipe",
  id: "22222222-2222-4222-8222-222222222222",
  name: "Chili",
  brand: null,
  unit: "portion",
  perPortion: { ...per100, calories: 400 },
  verified: true,
};

function entry(over: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    ...optimisticEntry(
      buildCatalogInput({
        id: newEntryId(),
        logDate: "2026-10-19",
        mealType: "lunch",
        item: food,
        quantity: 100,
        unit: "g",
      }),
      previewSnapshot(food, 100, "g")!,
      "c1"
    ),
    ...over,
  };
}

describe("units and defaults", () => {
  it("offers serving first when a serving size is known", () => {
    expect(availableUnits(food)).toEqual(["serving", "g"]);
    expect(defaultAmount(food)).toEqual({ quantity: 1, unit: "serving" });
  });
  it("falls back to 100 g / ml and portions for recipes", () => {
    expect(defaultAmount({ ...food, servingSize: null })).toEqual({ quantity: 100, unit: "g" });
    expect(availableUnits({ ...food, unit: "ml", servingSize: null })).toEqual(["ml"]);
    expect(availableUnits(recipe)).toEqual(["portion"]);
    expect(defaultAmount(recipe)).toEqual({ quantity: 1, unit: "portion" });
  });
});

describe("amount parsing", () => {
  it("accepts a decimal comma and rejects out-of-range values", () => {
    expect(parseAmount("1,5")).toBe(1.5);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("5001")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
  it("optional numbers: empty is null, invalid is NaN", () => {
    expect(parseOptionalNumber("", 500)).toBeNull();
    expect(parseOptionalNumber("12,5", 500)).toBe(12.5);
    expect(parseOptionalNumber("600", 500)).toBeNaN();
  });
});

describe("previewSnapshot", () => {
  it("scales per-100 values and servings", () => {
    expect(previewSnapshot(food, 250, "g")?.calories).toBe(500);
    expect(previewSnapshot(food, 2, "serving")?.calories).toBeCloseTo(160); // 80 g
    expect(previewSnapshot(recipe, 1.5, "portion")?.calories).toBe(600);
  });
  it("is null for invalid combos", () => {
    expect(previewSnapshot(food, null, "g")).toBeNull();
    expect(previewSnapshot({ ...food, servingSize: null }, 1, "serving")).toBeNull();
  });
});

describe("input builders match the API schema", () => {
  it("catalog input", () => {
    const input = buildCatalogInput({
      id: newEntryId(),
      logDate: "2026-10-19",
      mealType: "snack",
      item: recipe,
      quantity: 1,
      unit: "portion",
    });
    expect(diaryEntrySchema.safeParse(input).success).toBe(true);
    expect(input.recipe_id).toBe(recipe.id);
    expect(input.food_id).toBeNull();
  });
  it("quick input, with and without macros", () => {
    const input = buildQuickInput({
      id: newEntryId(),
      logDate: "2026-10-19",
      mealType: "breakfast",
      name: "  ",
      calories: 120,
      protein: null,
      carbs: null,
      fat: 3,
    });
    expect(diaryEntrySchema.safeParse(input).success).toBe(true);
    expect(input.name).toBeNull();
    expect(quickSnapshot(input)).toMatchObject({ name: "Quick add", calories: 120, protein: 0, fat: 3 });
  });
  it("newEntryId makes valid, distinct v4 uuids", () => {
    const a = newEntryId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newEntryId()).not.toBe(a);
  });
});

describe("editing helpers", () => {
  it("scaleEntry scales every nutrient linearly", () => {
    const e = entry({ micronutrients: { iron_mg: 2 } });
    const s = scaleEntry(e, 250);
    expect(s.calories).toBe(500);
    expect(s.protein).toBe(25);
    expect(s.micronutrients.iron_mg).toBe(5);
    expect(s.quantity).toBe(250);
  });
  it("entryToInput round-trips catalog and quick entries through the schema", () => {
    const cat = entryToInput(entry(), { meal_type: "dinner", quantity: 150 });
    expect(diaryEntrySchema.safeParse(cat).success).toBe(true);
    expect(cat).toMatchObject({ meal_type: "dinner", quantity: 150, food_id: food.id });

    const quickIn = buildQuickInput({
      id: newEntryId(),
      logDate: "2026-10-19",
      mealType: "snack",
      name: "Bar",
      calories: 200,
      protein: 5,
      carbs: null,
      fat: null,
    });
    const q = entry({ ...optimisticEntry(quickIn, quickSnapshot(quickIn), "c1") });
    const back = entryToInput(q);
    expect(diaryEntrySchema.safeParse(back).success).toBe(true);
    expect(back).toMatchObject({ source_kind: "quick", name: "Bar", calories: 200, protein: 5 });
  });
  it("isEditable needs a live source for catalog entries", () => {
    expect(isEditable(entry())).toBe(true);
    expect(isEditable(entry({ food_id: null }))).toBe(false);
    expect(isEditable(entry({ source_kind: "quick", food_id: null }))).toBe(true);
  });
});
