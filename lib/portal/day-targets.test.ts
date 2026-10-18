import { describe, expect, it } from "vitest";
import { resolveDayTargets } from "./day-targets";

const plan = (id: string, week_start: string, over: Record<string, number | null> = {}) => ({
  id,
  week_start,
  calorie_target: 2000 as number | null,
  protein_per_kg: 2 as number | null,
  fat_per_kg: 1 as number | null,
  ...over,
});
const client = { calorie_target: 1800, weight_kg: 90, target_weight_kg: 80 };

describe("resolveDayTargets", () => {
  it("uses the plan covering the date, macros on target weight", () => {
    const t = resolveDayTargets([plan("a", "2026-10-12"), plan("b", "2026-10-19")], client, "2026-10-14");
    expect(t.calories).toBe(2000);
    expect(t.protein).toBe(160); // 80 kg x 2
    expect(t.fat).toBe(80);
  });
  it("falls back to the latest earlier plan", () => {
    const t = resolveDayTargets(
      [plan("a", "2026-09-28", { calorie_target: 1500 }), plan("b", "2026-10-05", { calorie_target: 1700 })],
      client,
      "2026-10-30"
    );
    expect(t.calories).toBe(1700);
  });
  it("ignores plans that start after the date", () => {
    const t = resolveDayTargets([plan("a", "2026-11-02")], client, "2026-10-14");
    expect(t.calories).toBe(1800);
    expect(t.protein).toBeNull();
  });
  it("uses the client calorie target only when there is no plan", () => {
    const t = resolveDayTargets([], client, "2026-10-14");
    expect(t.calories).toBe(1800);
    expect(t.protein).toBeNull();
    expect(t.fiber).toEqual({ min: 18, max: 25.2 });
  });
  it("covering plan without calories falls back to the client's", () => {
    const t = resolveDayTargets([plan("a", "2026-10-12", { calorie_target: null })], client, "2026-10-14");
    expect(t.calories).toBe(1800);
    expect(t.protein).toBe(160);
  });
  it("no plan and no client target gives empty targets", () => {
    const t = resolveDayTargets([], null, "2026-10-14");
    expect(t.calories).toBeNull();
  });
});
