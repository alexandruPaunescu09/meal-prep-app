import { describe, expect, it } from "vitest";
import type { Ingredient } from "@/lib/supabase/types";
import { calculateRecipe } from "./recipe";
import { calculateDay } from "./meal-plan";
import { planEntryNutrition, snapshotForCatalogItem } from "./diary";
import { missingPieceWeight, nutritionGrams } from "./piece-weight";
import { ingredientToItem, recipeToItem } from "@/lib/portal/catalog";

// Eggs per 100 g; 1 piece = 55 g when a weight is set.
const egg = (pieceWeight: number | null): Ingredient =>
  ({
    id: "egg",
    name: "Egg",
    unit: "buc",
    package_price: 10,
    quantity_purchased: 10,
    price_per_unit: 1,
    piece_weight_g: pieceWeight,
    calories: 140,
    protein: 12,
    carbs: 1,
    fat: 10,
    fiber: 0,
    sugar: 0,
    sat_fat: 3,
    salt: 0.3,
    micronutrients: { iron_mg: 2 },
  }) as unknown as Ingredient;

const flour: Ingredient = {
  ...egg(null),
  id: "flour",
  unit: "g",
  price_per_unit: 0.005,
  calories: 350,
} as Ingredient;

describe("nutritionGrams", () => {
  it("turns pieces into grams only for buc with a positive weight", () => {
    expect(nutritionGrams({ unit: "buc", piece_weight_g: 55 }, 2)).toBe(110);
    expect(nutritionGrams({ unit: "buc", piece_weight_g: null }, 2)).toBe(2);
    expect(nutritionGrams({ unit: "buc", piece_weight_g: 0 }, 2)).toBe(2);
    expect(nutritionGrams({ unit: "g", piece_weight_g: 55 }, 2)).toBe(2);
    expect(nutritionGrams({ unit: "ml" }, 150)).toBe(150);
  });

  it("flags only buc without a usable weight", () => {
    expect(missingPieceWeight({ unit: "buc", piece_weight_g: null })).toBe(true);
    expect(missingPieceWeight({ unit: "buc", piece_weight_g: 55 })).toBe(false);
    expect(missingPieceWeight({ unit: "g", piece_weight_g: null })).toBe(false);
  });
});

describe("calculateRecipe with pieces", () => {
  it("counts 2 eggs at 55 g as 110 g of egg", () => {
    const calc = calculateRecipe([{ ingredient: egg(55), quantity: 2 }], 1);
    expect(calc.totals.calories).toBeCloseTo(154);
    expect(calc.totals.protein).toBeCloseTo(13.2);
    expect(calc.totals.micronutrients.iron_mg).toBeCloseTo(2.2);
  });

  it("keeps cost per piece", () => {
    const calc = calculateRecipe([{ ingredient: egg(55), quantity: 2 }], 1);
    expect(calc.totalCost).toBeCloseTo(2);
  });

  it("is unchanged without a piece weight (count counts as grams)", () => {
    const calc = calculateRecipe([{ ingredient: egg(null), quantity: 2 }], 1);
    expect(calc.totals.calories).toBeCloseTo(2.8);
  });

  it("does not touch g ingredients", () => {
    const calc = calculateRecipe([{ ingredient: flour, quantity: 200 }], 2);
    expect(calc.perPortion.calories).toBeCloseTo(350);
  });
});

describe("calculateDay direct ingredient entries", () => {
  const entry = (ing: Ingredient) =>
    [{ ingredient: ing, quantity: 2, portions: 1, recipe: null }] as never;

  it("uses the piece weight for nutrition, price stays per piece", () => {
    const d = calculateDay(entry(egg(55)));
    expect(d.calories).toBeCloseTo(154);
    expect(d.cost).toBeCloseTo(2);
  });

  it("is unchanged without a piece weight", () => {
    expect(calculateDay(entry(egg(null))).calories).toBeCloseTo(2.8);
  });
});

describe("planEntryNutrition (diary plan entries)", () => {
  it("direct ingredient: 2 eggs at 55 g = 110 g", () => {
    const t = planEntryNutrition({
      meal_type: "breakfast",
      portions: 1,
      quantity: 2,
      ingredient: egg(55),
    });
    expect(t.calories).toBeCloseTo(154);
  });

  it("direct ingredient without a weight is unchanged", () => {
    const t = planEntryNutrition({
      meal_type: "breakfast",
      portions: 1,
      quantity: 2,
      ingredient: egg(null),
    });
    expect(t.calories).toBeCloseTo(2.8);
  });

  it("recipe line uses the piece weight", () => {
    const withW = planEntryNutrition({
      meal_type: "lunch",
      portions: 1,
      quantity: null,
      recipe: { portions: 1, recipe_ingredients: [{ quantity: 2, ingredient: egg(55) }] },
    });
    const without = planEntryNutrition({
      meal_type: "lunch",
      portions: 1,
      quantity: null,
      recipe: { portions: 1, recipe_ingredients: [{ quantity: 2, ingredient: egg(null) }] },
    });
    expect(withW.calories).toBeCloseTo(154);
    expect(without.calories).toBeCloseTo(2.8);
  });
});

describe("customer catalog mapping", () => {
  const row = (w: number | null) => ({ ...egg(w), brand: null });

  it("a buc ingredient with a weight is logged in grams with one piece as the serving", () => {
    const item = ingredientToItem(row(55));
    expect(item.unit).toBe("g");
    expect(item.servingSize).toBe(55);
    expect(item.servingLabel).toBe("piece");
    const snap = snapshotForCatalogItem(item, 2, "serving");
    expect(snap.calories).toBeCloseTo(154);
  });

  it("without a weight keeps today's mapping (no serving)", () => {
    const item = ingredientToItem(row(null));
    expect(item.unit).toBe("g");
    expect(item.servingSize).toBeUndefined();
  });

  it("a g ingredient never gets a serving from a stray weight", () => {
    const item = ingredientToItem({ ...row(55), unit: "g" });
    expect(item.servingSize).toBeUndefined();
  });

  it("recipe per-portion nutrition uses the piece weight", () => {
    const mk = (w: number | null) =>
      recipeToItem({
        id: "r",
        name: "Omelette",
        portions: 1,
        recipe_ingredients: [{ quantity: 2, ingredient: egg(w) }],
      });
    expect(mk(55).perPortion?.calories).toBeCloseTo(154);
    expect(mk(null).perPortion?.calories).toBeCloseTo(2.8);
  });
});
