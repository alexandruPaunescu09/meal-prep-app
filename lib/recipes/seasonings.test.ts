import { describe, expect, it } from "vitest";
import {
  chipDefault,
  defaultRole,
  isCalorieDense,
  lineAmountText,
  pickSeasoningChips,
  seasonedWithText,
  splitLines,
  type SeasoningLine,
} from "./seasonings";

const line = (
  name: string,
  role: "main" | "seasoning",
  quantity = 5,
  to_taste = false
): SeasoningLine => ({ role, to_taste, quantity, ingredient: { name } });

describe("splitLines", () => {
  it("splits by role and keeps order", () => {
    const lines = [line("Chicken", "main"), line("Salt", "seasoning"), line("Rice", "main")];
    const { main, seasonings } = splitLines(lines);
    expect(main.map((l) => l.ingredient!.name)).toEqual(["Chicken", "Rice"]);
    expect(seasonings.map((l) => l.ingredient!.name)).toEqual(["Salt"]);
  });
  it("handles empty input", () => {
    expect(splitLines([])).toEqual({ main: [], seasonings: [] });
  });
});

describe("lineAmountText", () => {
  it("says to taste for a to-taste line", () => {
    expect(lineAmountText({ to_taste: true, quantity: 0 }, "g")).toBe("to taste");
  });
  it("formats a weighed amount with its unit", () => {
    expect(lineAmountText({ to_taste: false, quantity: 3 }, "g")).toBe("3 g");
    expect(lineAmountText({ to_taste: false, quantity: 0.5 }, "g")).toBe("0,5 g");
    expect(lineAmountText({ to_taste: false, quantity: 2 })).toBe("2");
  });
});

describe("seasonedWithText", () => {
  it("lists seasoning names only, deduped and sorted", () => {
    const lines = [
      line("Chicken", "main", 200),
      line("Thyme", "seasoning", 1),
      line("Garlic", "seasoning", 8),
      line("Thyme", "seasoning", 0, true),
    ];
    expect(seasonedWithText(lines)).toBe("Seasoned with: Garlic, Thyme");
  });
  it("never leaks amounts", () => {
    expect(seasonedWithText([line("Salt", "seasoning", 3)])).not.toMatch(/\d/);
  });
  it("is null without seasonings", () => {
    expect(seasonedWithText([line("Chicken", "main")])).toBeNull();
    expect(seasonedWithText([])).toBeNull();
  });
});

describe("isCalorieDense", () => {
  it("is true only above 300 kcal per 100 g", () => {
    expect(isCalorieDense({ calories: 884 })).toBe(true);
    expect(isCalorieDense({ calories: 300 })).toBe(false);
    expect(isCalorieDense({ calories: 0 })).toBe(false);
    expect(isCalorieDense({ calories: null })).toBe(false);
  });
});

describe("defaultRole", () => {
  it("follows is_seasoning", () => {
    expect(defaultRole({ is_seasoning: true })).toBe("seasoning");
    expect(defaultRole({ is_seasoning: false })).toBe("main");
  });
});

describe("chipDefault", () => {
  const ing = (category: string, unit: string, calories: number | null) => ({ category, unit, calories });
  it("keeps spices and herbs to taste", () => {
    expect(chipDefault(ing("spices_herbs", "g", 250))).toEqual({ toTaste: true, quantity: 0 });
    expect(chipDefault(ing("spices_herbs", "buc", null))).toEqual({ toTaste: true, quantity: 0 });
  });
  it("weighs pieces as 1", () => {
    expect(chipDefault(ing("vegetables", "buc", 40))).toEqual({ toTaste: false, quantity: 1 });
  });
  it("weighs calorie-dense ingredients as 10", () => {
    expect(chipDefault(ing("fats", "ml", 884))).toEqual({ toTaste: false, quantity: 10 });
    expect(chipDefault(ing("other", "g", 301))).toEqual({ toTaste: false, quantity: 10 });
  });
  it("weighs everything else as 5", () => {
    expect(chipDefault(ing("other", "ml", 20))).toEqual({ toTaste: false, quantity: 5 });
    expect(chipDefault(ing("other", "g", 300))).toEqual({ toTaste: false, quantity: 5 });
    expect(chipDefault(ing("other", "g", null))).toEqual({ toTaste: false, quantity: 5 });
  });
});

describe("pickSeasoningChips", () => {
  const mk = (id: string, name: string, is_seasoning = true) => ({ id, name, is_seasoning });
  const all = [mk("a", "Salt"), mk("b", "Oil"), mk("c", "Chicken", false), mk("d", "Basil")];
  it("only offers unused seasonings, by name without usage data", () => {
    expect(pickSeasoningChips(all, new Set(["a"])).map((i) => i.id)).toEqual(["d", "b"]);
  });
  it("orders by recipe usage first", () => {
    const usage = new Map([["a", 5], ["b", 9]]);
    expect(pickSeasoningChips(all, new Set(), usage).map((i) => i.id)).toEqual(["b", "a", "d"]);
  });
  it("caps at the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => mk(String(i), `S${String(i).padStart(2, "0")}`));
    expect(pickSeasoningChips(many, new Set())).toHaveLength(12);
    expect(pickSeasoningChips(many, new Set(), undefined, 3)).toHaveLength(3);
  });
});
