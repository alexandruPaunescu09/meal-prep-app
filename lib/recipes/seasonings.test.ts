import { describe, expect, it } from "vitest";
import {
  defaultRole,
  isCalorieDense,
  lineAmountText,
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
