import { describe, expect, it } from "vitest";
import { cleanSteps, generateCookingPlan } from "./cooking-plan";

function entry(planName: string, recipe: Record<string, unknown>, portions = 1) {
  return {
    portions,
    quantity: null,
    recipe,
    meal_plan: { name: planName, client: { name: planName } },
  };
}

const recipe = (id: string, instructions?: string[] | null) => ({
  id,
  name: `Recipe ${id}`,
  portions: 2,
  final_weight: null,
  instructions,
  recipe_ingredients: [],
});

describe("generateCookingPlan steps", () => {
  it("carries steps once per recipe when several plans use it", () => {
    const r = recipe("a", ["Chop", "Cook", "Serve"]);
    const { recipes } = generateCookingPlan([
      entry("P1", r, 1),
      entry("P2", r, 2),
    ] as never);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].steps).toEqual(["Chop", "Cook", "Serve"]);
    expect(recipes[0].totalPortions).toBe(3);
  });

  it("gives an empty list for recipes without steps", () => {
    const { recipes } = generateCookingPlan([
      entry("P1", recipe("b", [])),
      entry("P1", recipe("c", null)),
      entry("P1", recipe("d", undefined)),
    ] as never);
    expect(recipes.map((x) => x.steps)).toEqual([[], [], []]);
  });
});

describe("cleanSteps", () => {
  it("trims and drops blanks", () => {
    expect(cleanSteps([" a ", "", "  ", "b"])).toEqual(["a", "b"]);
    expect(cleanSteps(null)).toEqual([]);
  });
});

describe("generateCookingPlan seasonings", () => {
  const line = (id: string, name: string, quantity: number, role: "main" | "seasoning", toTaste = false) => ({
    id: `ri-${id}`,
    role,
    to_taste: toTaste,
    quantity,
    ingredient: { id, name, unit: "g" },
  });

  it("splits mains from seasonings, scales both and keeps to taste", () => {
    const r = {
      ...recipe("s", []),
      recipe_ingredients: [
        line("rice", "Rice", 200, "main"),
        line("garlic", "Garlic", 12, "seasoning"),
        line("pepper", "Pepper", 0, "seasoning", true),
      ],
    };
    // 2 base portions, 6 cooked -> x3
    const { recipes } = generateCookingPlan([entry("P1", r, 6)] as never);
    expect(recipes[0].ingredients.map((i) => [i.name, i.quantity, i.toTaste])).toEqual([["Rice", 600, false]]);
    expect(recipes[0].seasonings.map((i) => [i.name, i.quantity, i.toTaste])).toEqual([
      ["Garlic", 36, false],
      ["Pepper", 0, true],
    ]);
  });

  it("gives an empty seasonings list when there are none", () => {
    const r = { ...recipe("t", []), recipe_ingredients: [line("rice", "Rice", 100, "main")] };
    const { recipes } = generateCookingPlan([entry("P1", r, 2)] as never);
    expect(recipes[0].seasonings).toEqual([]);
  });
});
