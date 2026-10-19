import { describe, expect, it } from "vitest";
import type { CatalogItem, FoodLogEntry } from "@/lib/supabase/types";
import { attachUsable, buildLogAgain, buildMealCopies, dedupeRecents, refKey, type RecentLogRow } from "./recents";

const row = (o: Partial<RecentLogRow>): RecentLogRow => ({
  log_date: "2026-10-18",
  updated_at: "2026-10-18T10:00:00Z",
  source_kind: "food",
  food_id: "f1",
  ingredient_id: null,
  recipe_id: null,
  quantity: 100,
  quantity_unit: "g",
  ...o,
});

const item = (kind: CatalogItem["kind"], id: string): CatalogItem => ({
  kind,
  id,
  name: id,
  brand: null,
  unit: kind === "recipe" ? "portion" : "g",
  verified: true,
});

describe("dedupeRecents", () => {
  it("dedupes by target, newest first, keeping the last amount", () => {
    const out = dedupeRecents([
      row({ log_date: "2026-10-10", quantity: 50 }),
      row({ log_date: "2026-10-18", quantity: 250, updated_at: "2026-10-18T08:00:00Z" }),
      row({ log_date: "2026-10-18", quantity: 300, updated_at: "2026-10-18T12:00:00Z" }),
      row({
        log_date: "2026-10-17",
        food_id: null,
        ingredient_id: "i1",
        source_kind: "ingredient",
        quantity: 2,
        quantity_unit: "serving",
      }),
      row({
        log_date: "2026-10-19",
        food_id: null,
        recipe_id: "r1",
        source_kind: "recipe",
        quantity: 1,
        quantity_unit: "portion",
      }),
    ]);
    expect(out.map((c) => [refKey(c), c.quantity, c.unit])).toEqual([
      ["recipe:r1", 1, "portion"],
      ["food:f1", 300, "g"],
      ["ingredient:i1", 2, "serving"],
    ]);
  });

  it("skips quick adds and rows whose item was deleted, and honours the limit", () => {
    const rows = [
      row({ source_kind: "quick", food_id: null }),
      row({ food_id: null }),
      row({ food_id: "a", log_date: "2026-10-18" }),
      row({ food_id: "b", log_date: "2026-10-17" }),
    ];
    expect(dedupeRecents(rows).map((c) => c.id)).toEqual(["a", "b"]);
    expect(dedupeRecents(rows, 1).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("attachUsable", () => {
  it("drops unusable items, keeps order and amounts", () => {
    const cands = dedupeRecents([
      row({ food_id: "hidden", log_date: "2026-10-18", quantity: 10 }),
      row({ food_id: "ok", log_date: "2026-10-17", quantity: 20 }),
    ]);
    const usable = new Map([[refKey({ kind: "food", id: "ok" }), item("food", "ok")]]);
    const out = attachUsable(cands, usable);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ quantity: 20, unit: "g", lastDate: "2026-10-17" });
  });
});

const entry = (o: Partial<FoodLogEntry>): FoodLogEntry =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    client_id: "c",
    log_date: "2026-10-18",
    meal_type: "lunch",
    source_kind: "food",
    food_id: "f1",
    ingredient_id: null,
    recipe_id: null,
    quantity: 150,
    quantity_unit: "g",
    name: "Oats",
    brand: null,
    calories: 500,
    protein: 1,
    carbs: 1,
    fat: 1,
    fiber: 0,
    sugar: 0,
    sat_fat: 0,
    salt: 0,
    micronutrients: {},
    created_at: "x",
    updated_at: "x",
    ...o,
  }) as FoodLogEntry;

describe("buildMealCopies", () => {
  it("gives new ids, the target date and section, and skips deleted catalog items", () => {
    let n = 0;
    const { copies, skipped } = buildMealCopies(
      [
        entry({ id: "a" }),
        entry({
          id: "b",
          source_kind: "quick",
          food_id: null,
          name: "Snack",
          quantity: 1,
          quantity_unit: "serving",
          calories: 90,
        }),
        entry({ id: "c", food_id: null }),
      ],
      { targetDate: "2026-10-19", mealType: "dinner", newId: () => `new-${++n}` }
    );
    expect(skipped).toBe(1);
    expect(copies.map((c) => c.input.id)).toEqual(["new-1", "new-2"]);
    for (const c of copies) {
      expect(c.input.log_date).toBe("2026-10-19");
      expect(c.input.meal_type).toBe("dinner");
      expect(c.entry.id).toBe(c.input.id);
      expect(c.entry.log_date).toBe("2026-10-19");
    }
    expect(copies[0].input).toMatchObject({ source_kind: "food", food_id: "f1", quantity: 150, quantity_unit: "g" });
    expect(copies[1].input).toMatchObject({ source_kind: "quick", name: "Snack", calories: 90 });
  });
});

describe("buildLogAgain", () => {
  it("keeps item and amount with a new id on the viewed day", () => {
    const e = entry({});
    const i = buildLogAgain(e, { logDate: "2026-10-20", mealType: "snack", id: "new" });
    expect(i).toMatchObject({ id: "new", log_date: "2026-10-20", meal_type: "snack", food_id: "f1", quantity: 150 });
    expect(i.id).not.toBe(e.id);
  });
});
