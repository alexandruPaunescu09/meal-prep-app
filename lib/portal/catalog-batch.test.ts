import { describe, expect, it } from "vitest";
import { loadCatalogItems } from "./catalog";

const nutrition = {
  calories: 1,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
  sat_fat: 0,
  salt: 0,
  micronutrients: {},
};
const food = (id: string, status: string, owner: string | null) => ({
  id,
  name: id,
  brand: null,
  unit: "g",
  serving_size: null,
  serving_label: null,
  status,
  created_by_client_id: owner,
  ...nutrition,
});
const fakeService = (rows: unknown[]) =>
  ({ from: () => ({ select: () => ({ in: async () => ({ data: rows, error: null }) }) }) }) as never;

describe("loadCatalogItems usable filter", () => {
  it("keeps active foods and the client's own pending foods only", async () => {
    const svc = fakeService([
      food("active", "active", null),
      food("mine", "pending", "me"),
      food("theirs", "pending", "other"),
      food("hidden", "hidden", null),
    ]);
    const refs = ["active", "mine", "theirs", "hidden"].map((id) => ({ kind: "food" as const, id }));
    const out = await loadCatalogItems(svc, "me", refs);
    expect([...out.keys()].sort()).toEqual(["food:active", "food:mine"]);
    expect(out.get("food:mine")?.verified).toBe(false);
  });
});
