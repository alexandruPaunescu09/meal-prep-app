import { describe, expect, it } from "vitest";
import { generateShoppingList, shoppingListToText } from "./shopping-list";
import type { Ingredient } from "@/lib/supabase/types";

function ing(id: string, name: string, ppu: number | null, category = "other"): Ingredient {
  return {
    id,
    name,
    category,
    unit: "g",
    quantity_purchased: 1000,
    package_price: ppu == null ? null : ppu * 1000,
    price_per_unit: ppu,
  } as unknown as Ingredient;
}

const rice = ing("rice", "Rice", 0.01, "grains");
const oil = ing("oil", "Olive oil", 0.02, "fats");
const salt = ing("salt", "Salt", 0.005, "spices");
const sumac = ing("sumac", "Sumac", null, "spices");

type Line = { ingredient: Ingredient; quantity: number; role?: "main" | "seasoning"; to_taste?: boolean };

function recipeEntry(lines: Line[], portions = 2, entryPortions = 2) {
  return {
    portions: entryPortions,
    recipe: {
      portions,
      recipe_ingredients: lines.map((l) => ({
        role: l.role ?? "main",
        to_taste: l.to_taste ?? false,
        quantity: l.quantity,
        ingredient: l.ingredient,
      })),
    },
  } as never;
}

function directEntry(ingredient: Ingredient, quantity: number, portions = 1) {
  return { portions, quantity, ingredient } as never;
}

describe("generateShoppingList pantry", () => {
  it("sends an ingredient used only as seasoning to the pantry group", () => {
    const entries = [
      recipeEntry([
        { ingredient: rice, quantity: 200 },
        { ingredient: oil, quantity: 10, role: "seasoning" },
        { ingredient: salt, quantity: 0, role: "seasoning", to_taste: true },
      ]),
    ];
    const { groups, pantry } = generateShoppingList(entries);
    expect(groups.flatMap((g) => g.items.map((i) => i.name))).toEqual(["Rice"]);
    expect(pantry?.items.map((i) => i.name)).toEqual(["Olive oil", "Salt"]);
    expect(pantry?.items[0].totalQuantity).toBe(10);
  });

  it("returns null pantry when there are no seasoning-only items", () => {
    const { pantry } = generateShoppingList([recipeEntry([{ ingredient: rice, quantity: 100 }])]);
    expect(pantry).toBeNull();
  });

  it("keeps an ingredient in its category with the full total when also used as main", () => {
    const entries = [
      recipeEntry([{ ingredient: oil, quantity: 10, role: "seasoning" }], 2, 2),
      recipeEntry([{ ingredient: oil, quantity: 30 }], 2, 2),
    ];
    const { groups, pantry, totalCost } = generateShoppingList(entries);
    expect(pantry).toBeNull();
    const item = groups.flatMap((g) => g.items)[0];
    expect(item.name).toBe("Olive oil");
    expect(item.totalQuantity).toBe(40);
    expect(totalCost).toBeCloseTo(0.8);
  });

  it("counts a direct ingredient entry as main", () => {
    const entries = [
      recipeEntry([{ ingredient: oil, quantity: 10, role: "seasoning" }]),
      directEntry(oil, 50),
    ];
    const { groups, pantry } = generateShoppingList(entries);
    expect(pantry).toBeNull();
    expect(groups[0].items[0].totalQuantity).toBe(60);
  });

  it("shows to-taste-only items as 'to taste' with total 0 and not unpriced", () => {
    const entries = [
      recipeEntry([{ ingredient: sumac, quantity: 0, role: "seasoning", to_taste: true }]),
    ];
    const { pantry, unpricedCount } = generateShoppingList(entries);
    const item = pantry!.items[0];
    expect(item.toTasteOnly).toBe(true);
    expect(item.totalQuantity).toBe(0);
    expect(item.unpriced).toBe(false);
    expect(pantry!.unpricedCount).toBe(0);
    expect(unpricedCount).toBe(0);
  });

  it("marks a priced-pending seasoning with a quantity as unpriced", () => {
    const { pantry } = generateShoppingList([
      recipeEntry([{ ingredient: sumac, quantity: 5, role: "seasoning" }]),
    ]);
    expect(pantry!.items[0].unpriced).toBe(true);
    expect(pantry!.items[0].toTasteOnly).toBe(false);
  });

  it("keeps pantry cost out of the total and category subtotals", () => {
    const entries = [
      recipeEntry([
        { ingredient: rice, quantity: 100 },
        { ingredient: oil, quantity: 100, role: "seasoning" },
      ]),
    ];
    const { groups, pantry, totalCost } = generateShoppingList(entries);
    expect(totalCost).toBeCloseTo(1);
    expect(groups).toHaveLength(1);
    expect(groups[0].subtotal).toBeCloseTo(1);
    expect(pantry!.subtotal).toBeCloseTo(2);
  });

  it("puts a PANTRY CHECK section after TOTAL in the text", () => {
    const entries = [
      recipeEntry([
        { ingredient: rice, quantity: 100 },
        { ingredient: salt, quantity: 0, role: "seasoning", to_taste: true },
        { ingredient: oil, quantity: 10, role: "seasoning" },
      ]),
    ];
    const { groups, pantry, totalCost, unpricedCount } = generateShoppingList(entries);
    const text = shoppingListToText(groups, totalCost, unpricedCount, pantry);
    expect(text.indexOf("PANTRY CHECK")).toBeGreaterThan(text.indexOf("TOTAL:"));
    expect(text).toContain("- Salt: to taste");
    expect(text).toContain("- Olive oil: 10g");
    expect(text).toContain("not in the total");
    expect(text.slice(0, text.indexOf("TOTAL:"))).not.toContain("Salt");
  });

  it("has no PANTRY CHECK section without a pantry", () => {
    const { groups, totalCost } = generateShoppingList([recipeEntry([{ ingredient: rice, quantity: 100 }])]);
    expect(shoppingListToText(groups, totalCost)).not.toContain("PANTRY");
  });
});
