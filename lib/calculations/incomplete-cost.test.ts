import { describe, expect, it } from "vitest";
import { calculateRecipe } from "./recipe";
import { calculateDay, calculateWeek } from "./meal-plan";
import { generateShoppingList } from "./shopping-list";
import { formatCost } from "@/lib/format";
import type { Ingredient } from "@/lib/supabase/types";

function ing(id: string, name: string, ppu: number | null): Ingredient {
  return {
    id,
    name,
    brand: null,
    category: "other",
    quantity_purchased: 1000,
    unit: "g",
    package_price: ppu == null ? null : ppu * 1000,
    price_per_unit: ppu,
    piece_weight_g: null,
    calories: 100,
    protein: 10,
    carbs: 10,
    fat: 1,
    fiber: null,
    sugar: null,
    sat_fat: null,
    salt: null,
    micronutrients: {},
    api_source: null,
    barcode: null,
  } as unknown as Ingredient;
}

const rice = ing("1", "Rice", 0.01);
const oil = ing("2", "Oil", 0.02);
const saffron = ing("3", "Saffron", null);
const sumac = ing("4", "Sumac", null);

describe("calculateRecipe cost", () => {
  it("all priced: exact cost, nothing unpriced", () => {
    const c = calculateRecipe(
      [
        { ingredient: rice, quantity: 200 },
        { ingredient: oil, quantity: 100 },
      ],
      2
    );
    expect(c.totalCost).toBeCloseTo(4);
    expect(c.costPerPortion).toBeCloseTo(2);
    expect(c.unpricedCount).toBe(0);
    expect(c.unpricedNames).toEqual([]);
  });

  it("some unpriced: lower bound plus the missing names, nutrition unaffected", () => {
    const c = calculateRecipe(
      [
        { ingredient: rice, quantity: 200 },
        { ingredient: saffron, quantity: 1 },
        { ingredient: sumac, quantity: 5 },
      ],
      1
    );
    expect(c.totalCost).toBeCloseTo(2);
    expect(c.unpricedCount).toBe(2);
    expect(c.unpricedNames).toEqual(["Saffron", "Sumac"]);
    expect(c.totals.calories).toBeCloseTo(206);
  });

  it("none priced: zero known cost, all counted", () => {
    const c = calculateRecipe([{ ingredient: saffron, quantity: 1 }], 1);
    expect(c.totalCost).toBe(0);
    expect(c.unpricedCount).toBe(1);
  });

  it("counts a repeated unpriced ingredient once", () => {
    const c = calculateRecipe(
      [
        { ingredient: saffron, quantity: 1 },
        { ingredient: saffron, quantity: 2 },
      ],
      1
    );
    expect(c.unpricedCount).toBe(1);
  });
});

describe("calculateDay / calculateWeek cost", () => {
  const recipe = {
    id: "r",
    portions: 2,
    recipe_ingredients: [
      { ingredient: rice, quantity: 200 },
      { ingredient: saffron, quantity: 1 },
    ],
  };
  const entries = [
    { day_of_week: 1, recipe, portions: 2, ingredient: undefined, quantity: null },
    { day_of_week: 2, ingredient: sumac, quantity: 10, portions: 1 },
    { day_of_week: 2, ingredient: oil, quantity: 100, portions: 1 },
  ] as never[];

  it("day: known cost and distinct unpriced names", () => {
    const d = calculateDay([entries[0]]);
    expect(d.cost).toBeCloseTo(2);
    expect(d.unpricedNames).toEqual(["Saffron"]);
    const d2 = calculateDay([entries[1], entries[2]]);
    expect(d2.cost).toBeCloseTo(2);
    expect(d2.unpricedNames).toEqual(["Sumac"]);
  });

  it("week: lower-bound cost and selling price, deduped names", () => {
    const w = calculateWeek(entries, 2.5);
    expect(w.totalCost).toBeCloseTo(4);
    expect(w.sellingPrice).toBeCloseTo(10);
    expect(w.unpricedCount).toBe(2);
    expect(w.unpricedNames).toEqual(["Saffron", "Sumac"]);
  });

  it("week with only priced items has no unpriced names", () => {
    const w = calculateWeek([entries[2]], 2);
    expect(w.unpricedCount).toBe(0);
  });
});

describe("generateShoppingList cost", () => {
  it("unpriced items cost 0, are flagged, and counted per group and in total", () => {
    const entries = [
      { ingredient: rice, quantity: 100, portions: 1 },
      { ingredient: saffron, quantity: 1, portions: 1 },
    ] as never[];
    const { groups, totalCost, unpricedCount } = generateShoppingList(entries);
    expect(totalCost).toBeCloseTo(1);
    expect(unpricedCount).toBe(1);
    expect(groups[0].unpricedCount).toBe(1);
    expect(groups[0].items.find((i) => i.name === "Saffron")?.unpriced).toBe(true);
  });
});

describe("formatCost", () => {
  it("complete cost is a plain lei amount", () => {
    expect(formatCost(23.4, 0)).toBe("23,40 lei");
  });
  it("incomplete cost is a lower bound with the count", () => {
    expect(formatCost(23.4, 2)).toBe("≥ 23,40 lei · 2 without a price");
    expect(formatCost(5, 1)).toBe("≥ 5,00 lei · 1 without a price");
  });
  it("nothing priced reads Price pending", () => {
    expect(formatCost(0, 3)).toBe("Price pending");
  });
});
