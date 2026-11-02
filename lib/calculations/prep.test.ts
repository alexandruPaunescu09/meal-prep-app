import { describe, expect, it } from "vitest";
import { generatePrepTasks } from "./prep";

const ingredient = (id: string, name: string) => ({ id, name, unit: "g", category: "veg" });
const ri = (id: string, name: string, quantity: number, role: "main" | "seasoning", toTaste = false) => ({
  role,
  to_taste: toTaste,
  quantity,
  ingredient: ingredient(id, name),
});

const rules = [
  { id: "r1", ingredient_category: "veg", ingredient_id: null, prep_type: "chop", advance_days: 1 },
] as never;

describe("generatePrepTasks seasonings", () => {
  it("skips to-taste lines but keeps weighed seasonings", () => {
    const entry = {
      day_of_week: 3,
      portions: 2,
      recipe: {
        name: "Stew",
        portions: 2,
        recipe_ingredients: [
          ri("onion", "Onion", 100, "main"),
          ri("garlic", "Garlic", 12, "seasoning"),
          ri("pepper", "Pepper", 0, "seasoning", true),
        ],
      },
    };
    const tasks = generatePrepTasks([entry] as never, rules, "2027-01-11");
    expect(tasks.map((t) => [t.ingredient_id, t.quantity]).sort()).toEqual([
      ["garlic", 12],
      ["onion", 100],
    ]);
    expect(tasks.every((t) => t.quantity > 0)).toBe(true);
  });
});
