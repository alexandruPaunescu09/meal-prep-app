import { describe, expect, it } from "vitest";
import { inactiveClients, topOffPlanFoods, type InsightLog } from "./client-insights";

const log = (over: Partial<InsightLog>): InsightLog => ({
  log_date: "2026-10-10",
  source_kind: "food",
  food_id: null,
  ingredient_id: null,
  recipe_id: null,
  name: "x",
  brand: null,
  calories: 100,
  ...over,
});

describe("topOffPlanFoods", () => {
  it("groups by catalog id, sums kcal, tracks last date and ranks by kcal", () => {
    const top = topOffPlanFoods([
      log({ food_id: "a", name: "Granola", calories: 300, log_date: "2026-10-01" }),
      log({ food_id: "a", name: "Granola", calories: 300, log_date: "2026-10-05" }),
      log({ food_id: "b", name: "Apple", calories: 80 }),
      log({ ingredient_id: "i", source_kind: "ingredient", name: "Oats", calories: 500 }),
    ]);
    expect(top.map((t) => t.name)).toEqual(["Granola", "Oats", "Apple"]);
    expect(top[0]).toMatchObject({ count: 2, calories: 600, lastDate: "2026-10-05" });
  });

  it("groups quick adds by case-insensitive name and keeps kinds apart", () => {
    const top = topOffPlanFoods([
      log({ source_kind: "quick", name: "Pizza ", calories: 700 }),
      log({ source_kind: "quick", name: "pizza", calories: 600 }),
      log({ source_kind: "food", name: "pizza", calories: 10 }),
    ]);
    expect(top).toHaveLength(2);
    expect(top[0]).toMatchObject({ count: 2, calories: 1300, kind: "quick" });
  });

  it("limits and tolerates null kcal", () => {
    const logs = Array.from({ length: 15 }, (_, i) => log({ food_id: `f${i}`, calories: i === 0 ? null : i }));
    expect(topOffPlanFoods(logs)).toHaveLength(10);
    expect(topOffPlanFoods(logs, 3).map((t) => t.calories)).toEqual([14, 13, 12]);
  });
});

describe("inactiveClients", () => {
  const base = {
    today: "2026-10-19",
    thresholdDays: 3,
    lookbackDays: 14,
    portalClients: [
      { clientId: "a", name: "Ana", since: "2026-09-01" },
      { clientId: "b", name: "Bob", since: "2026-09-01" },
      { clientId: "c", name: "Cris", since: "2026-10-18" },
      { clientId: "d", name: "Dan", since: "2026-10-10" },
      { clientId: "e", name: "Eva", since: "2026-08-01" },
    ],
  };
  const res = inactiveClients({
    ...base,
    activity: [
      { clientId: "a", date: "2026-10-16" }, // exactly 3 days: flagged
      { clientId: "a", date: "2026-10-12" },
      { clientId: "b", date: "2026-10-17" }, // 2 days: fine
      { clientId: "e", date: "2026-10-19" }, // today: fine
    ],
  });

  it("flags 3+ idle days, not 2", () => {
    expect(res.find((r) => r.clientId === "a")).toMatchObject({ daysSince: 3, lastActivity: "2026-10-16" });
    expect(res.find((r) => r.clientId === "b")).toBeUndefined();
    expect(res.find((r) => r.clientId === "e")).toBeUndefined();
  });

  it("never-active clients are flagged only once access is old enough", () => {
    expect(res.find((r) => r.clientId === "c")).toBeUndefined();
    expect(res.find((r) => r.clientId === "d")).toMatchObject({ daysSince: 9, lastActivity: null });
  });

  it("reports null when idle beyond the lookback and sorts most idle first", () => {
    const r = inactiveClients({ ...base, activity: [] });
    expect(r[0]).toMatchObject({ daysSince: null });
    expect(r.map((x) => x.clientId)).toEqual(["a", "b", "e", "d"]);
  });

  it("ignores future-dated activity", () => {
    const r = inactiveClients({ ...base, activity: [{ clientId: "a", date: "2026-10-25" }] });
    expect(r.find((x) => x.clientId === "a")?.lastActivity).toBeNull();
  });
});
