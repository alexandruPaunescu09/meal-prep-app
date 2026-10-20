import { describe, expect, it } from "vitest";
import { buildProgressView, barHeight, chartMax, percentSplit, sliceWindow, streakMessage } from "./progress-stats";

const days = ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"].map((date) => ({ date }));

describe("sliceWindow", () => {
  it("takes the last n days up to today and drops the future", () => {
    expect(sliceWindow(days, "2026-10-16", 2).map((d) => d.date)).toEqual(["2026-10-15", "2026-10-16"]);
  });
  it("returns everything when fewer days exist", () => {
    expect(sliceWindow(days, "2026-10-17", 30)).toHaveLength(4);
  });
});

describe("chartMax / barHeight", () => {
  it("rounds up to the step and ignores nulls", () => {
    expect(chartMax([1800, null, 2210], 500)).toBe(2500);
    expect(chartMax([])).toBe(500);
  });
  it("scales bars and keeps tiny values visible", () => {
    expect(barHeight(1000, 2000, 100)).toBe(50);
    expect(barHeight(1, 2000, 100)).toBe(2);
    expect(barHeight(0, 2000, 100)).toBe(0);
    expect(barHeight(5000, 2000, 100)).toBe(100);
  });
});

describe("percentSplit", () => {
  it("sums to 100", () => {
    expect(percentSplit([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("handles zero total", () => {
    expect(percentSplit([0, 0])).toEqual([0, 0]);
  });
});

describe("buildProgressView", () => {
  it("builds windows and streak from days", () => {
    const mk = (date: string, kcal: number, active: boolean) =>
      ({
        date,
        planId: null,
        active,
        offPlan: { calories: 0 },
        targets: { calories: 2000, protein: null, carbs: null, fat: null },
        diary: {
          eaten: { calories: kcal, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sat_fat: 0, salt: 0, micronutrients: {} },
          counts: { planEaten: 0, planSkipped: 0, planPending: 0, logged: active ? 1 : 0 },
        },
      }) as unknown as import("./diary-range").DiaryRangeDay;
    const v = buildProgressView(
      [mk("2026-10-15", 1500, true), mk("2026-10-16", 0, false), mk("2026-10-17", 1800, true), mk("2026-10-18", 1900, true)],
      "2026-10-18"
    );
    expect(v.windows[7].bars).toHaveLength(4);
    expect(v.windows[7].summary.activeDays).toBe(3);
    expect(v.streak).toEqual({ current: 2, best: 2 });
    expect(v.todayActive).toBe(true);
  });
});

describe("streakMessage", () => {
  it("covers the states", () => {
    expect(streakMessage({ current: 0, best: 0 }, false)).toMatch(/start a streak/);
    expect(streakMessage({ current: 0, best: 4 }, false)).toMatch(/new streak/);
    expect(streakMessage({ current: 3, best: 5 }, false)).toMatch(/keep your 3-day/);
    expect(streakMessage({ current: 3, best: 5 }, true)).toMatch(/2 more days/);
    expect(streakMessage({ current: 5, best: 5 }, true)).toMatch(/longest/);
  });
});
