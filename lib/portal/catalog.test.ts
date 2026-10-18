import { describe, expect, it } from "vitest";
import type { CatalogItem } from "@/lib/supabase/types";
import { escapeLike, matchRank, rankItems } from "./catalog";
import { diaryEntrySchema } from "@/lib/validations/schemas";

const item = (name: string): CatalogItem => ({
  kind: "food",
  id: name,
  name,
  brand: null,
  unit: "g",
  verified: true,
});

describe("catalog search helpers", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });

  it("ranks exact, then prefix, then word-prefix, then contains; shorter first", () => {
    expect(matchRank("Milk", "milk")).toBe(0);
    expect(matchRank("Milk chocolate", "milk")).toBe(1);
    expect(matchRank("Oat milk", "milk")).toBe(2);
    expect(matchRank("Buttermilk", "milk")).toBe(3);
    const ranked = rankItems(
      ["Buttermilk", "Oat milk", "Milk chocolate bar", "Milk", "Milk 1l"].map(item),
      "milk"
    ).map((i) => i.name);
    expect(ranked).toEqual(["Milk", "Milk 1l", "Milk chocolate bar", "Oat milk", "Buttermilk"]);
  });
});

describe("diaryEntrySchema", () => {
  const base = {
    id: "3f2b8c1e-5d4a-4b7e-9c1a-2e8f7d6a5b4c",
    log_date: "2026-10-19",
    meal_type: "lunch",
    source_kind: "food",
    food_id: "9a1d2c3b-4e5f-4a6b-8c7d-0e1f2a3b4c5d",
    quantity: 150,
    quantity_unit: "g",
  };
  const ok = (v: object) => diaryEntrySchema.safeParse(v).success;

  it("accepts a valid catalog entry", () => {
    expect(ok(base)).toBe(true);
    expect(ok({ ...base, quantity_unit: "serving", quantity: 2 })).toBe(true);
  });
  it("rejects bad dates, quantities and unit/kind mismatches", () => {
    expect(ok({ ...base, log_date: "2026-02-30" })).toBe(false);
    expect(ok({ ...base, log_date: "19/10/2026" })).toBe(false);
    expect(ok({ ...base, quantity: 0 })).toBe(false);
    expect(ok({ ...base, quantity: 5001 })).toBe(false);
    expect(ok({ ...base, quantity_unit: "portion" })).toBe(false);
    expect(ok({ ...base, food_id: undefined })).toBe(false);
    expect(ok({ ...base, ingredient_id: base.food_id })).toBe(false);
    expect(ok({ ...base, calories: 100 })).toBe(false);
  });
  it("recipes need portion unit and recipe_id", () => {
    const r = { ...base, source_kind: "recipe", food_id: undefined, recipe_id: base.food_id, quantity_unit: "portion", quantity: 1 };
    expect(ok(r)).toBe(true);
    expect(ok({ ...r, quantity_unit: "g" })).toBe(false);
  });
  it("validates quick add", () => {
    const q = { id: base.id, log_date: base.log_date, meal_type: "snack", source_kind: "quick", quantity: 1, quantity_unit: "serving", calories: 250 };
    expect(ok(q)).toBe(true);
    expect(ok({ ...q, name: "x".repeat(101) })).toBe(false);
    expect(ok({ ...q, calories: 5001 })).toBe(false);
    expect(ok({ ...q, calories: undefined })).toBe(false);
    expect(ok({ ...q, protein: 501 })).toBe(false);
    expect(ok({ ...q, quantity: 2 })).toBe(false);
    expect(ok({ ...q, quantity_unit: "g" })).toBe(false);
    expect(ok({ ...q, food_id: base.food_id })).toBe(false);
  });
});
