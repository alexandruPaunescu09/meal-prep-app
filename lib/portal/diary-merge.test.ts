import { describe, expect, it } from "vitest";
import type { FoodLogEntry } from "@/lib/supabase/types";
import { mergeLogEntries, visiblePending, type PendingDiaryRecord } from "./diary-merge";

function row(id: string, over: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id,
    client_id: "c",
    log_date: "2026-10-19",
    meal_type: "lunch",
    source_kind: "quick",
    food_id: null,
    ingredient_id: null,
    recipe_id: null,
    quantity: 1,
    quantity_unit: "serving",
    name: id,
    brand: null,
    calories: 100,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sat_fat: 0,
    salt: 0,
    micronutrients: {},
    created_at: "",
    updated_at: "",
    ...over,
  };
}
const up = (entry: FoodLogEntry): PendingDiaryRecord => ({ op: "upsert", entry, settled: false });
const del = (id: string): PendingDiaryRecord => ({ op: "delete", id, settled: false });
const D = "2026-10-19";

describe("mergeLogEntries", () => {
  it("returns server rows untouched with nothing pending", () => {
    const s = [row("a")];
    expect(mergeLogEntries(s, [], D)).toBe(s);
  });
  it("adds a pending new entry for the date once, even if the server also has it", () => {
    expect(mergeLogEntries([], [up(row("n"))], D).map((e) => e.id)).toEqual(["n"]);
    expect(mergeLogEntries([row("n")], [up(row("n"))], D)).toHaveLength(1);
  });
  it("ignores pending entries of another date", () => {
    expect(mergeLogEntries([], [up(row("n", { log_date: "2026-10-18" }))], D)).toEqual([]);
  });
  it("a pending edit overrides the server row", () => {
    const out = mergeLogEntries([row("a")], [up(row("a", { calories: 999 }))], D);
    expect(out).toHaveLength(1);
    expect(out[0].calories).toBe(999);
  });
  it("a pending delete hides the server row; a later undo brings it back", () => {
    expect(mergeLogEntries([row("a")], [del("a")], D)).toEqual([]);
    expect(mergeLogEntries([row("a")], [del("a"), up(row("a"))], D)).toHaveLength(1);
    expect(mergeLogEntries([], [up(row("a")), del("a")], D)).toEqual([]);
  });
});

describe("pending-diary owner filtering", () => {
  const upsertBy = (id: string, owner?: string): PendingDiaryRecord => ({
    op: "upsert",
    entry: row(id),
    settled: false,
    ...(owner ? { owner } : {}),
  });
  const idOf = (p: PendingDiaryRecord) => (p.op === "upsert" ? p.entry.id : p.id);

  it("shows only the current user's pending records (plus legacy ownerless ones)", () => {
    const pending = [upsertBy("a", "A"), upsertBy("b", "B"), upsertBy("c")];
    expect(visiblePending(pending, "A").map(idOf)).toEqual(["a", "c"]);
    expect(visiblePending(pending, undefined).map(idOf)).toEqual(["c"]);
  });

  it("mergeLogEntries ignores another user's pending upserts and deletes", () => {
    const server = [row("s1")];
    const pending: PendingDiaryRecord[] = [
      upsertBy("b-new", "B"),
      { op: "delete", id: "s1", settled: false, owner: "B" },
    ];
    expect(mergeLogEntries(server, pending, "2026-10-19", "A")).toEqual(server);
    expect(mergeLogEntries(server, pending, "2026-10-19", "B").map((e) => e.id)).toEqual(["b-new"]);
  });
});
