import { describe, expect, it } from "vitest";
import {
  batchFirstDay,
  cleanSteps,
  cookDateFor,
  generateCookingBatches,
  generateCookingPlan,
} from "./cooking-plan";

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

describe("cook batches", () => {
  const dayEntry = (day: number, planName: string, r: Record<string, unknown>, portions = 1) => ({
    ...entry(planName, r, portions),
    day_of_week: day,
  });

  it("maps days to the first day of their pair", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(batchFirstDay)).toEqual([1, 1, 3, 3, 5, 5, 7]);
  });

  it("splits entries by day pair and keeps per-batch portions for a shared recipe", () => {
    const r = recipe("a", ["Cook"]);
    const batches = generateCookingBatches(
      [
        dayEntry(1, "Ana", r, 1),
        dayEntry(2, "Bob", r, 2),
        dayEntry(3, "Ana", r, 4),
        dayEntry(6, "Ana", recipe("z"), 1),
      ] as never,
      "2026-11-02"
    );
    expect(batches.map((b) => b.firstDay)).toEqual([1, 3, 5]);
    expect(batches[0].recipes[0].totalPortions).toBe(3);
    expect(batches[0].recipes[0].clientBreakdown.map((c) => c.portions)).toEqual([1, 2]);
    expect(batches[1].recipes[0].totalPortions).toBe(4);
    expect(batches[2].recipes.map((x) => x.recipeId)).toEqual(["z"]);
    expect(batches[0].days).toEqual([1, 2]);
    expect([batches[0].firstDate, batches[0].lastDate]).toEqual(["2026-11-02", "2026-11-03"]);
    expect([batches[2].firstDate, batches[2].lastDate]).toEqual(["2026-11-06", "2026-11-07"]);
  });

  it("drops empty batches and ignores Sunday entries", () => {
    const r = recipe("a");
    expect(generateCookingBatches([dayEntry(4, "Ana", r)] as never, "2026-11-02").map((b) => b.firstDay)).toEqual([3]);
    expect(generateCookingBatches([dayEntry(7, "Ana", r)] as never, "2026-11-02")).toEqual([]);
    const mixed = generateCookingBatches([dayEntry(7, "Ana", r), dayEntry(1, "Ana", r)] as never, "2026-11-02");
    expect(mixed.map((b) => b.firstDay)).toEqual([1]);
    expect(mixed[0].recipes[0].totalPortions).toBe(1);
    expect(generateCookingBatches([], "2026-11-02")).toEqual([]);
  });

  it("cooks the day before the first day of each batch", () => {
    expect([1, 3, 5].map((d) => cookDateFor("2026-11-02", d))).toEqual([
      "2026-11-01",
      "2026-11-03",
      "2026-11-05",
    ]);
  });

  it("handles the DST change (week of 2026-10-26)", () => {
    expect(cookDateFor("2026-10-26", 1)).toBe("2026-10-25");
    expect(cookDateFor("2026-10-26", 3)).toBe("2026-10-27");
    expect(cookDateFor("2026-10-26", 5)).toBe("2026-10-29");
  });
});
