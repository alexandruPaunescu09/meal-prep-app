import { describe, expect, it } from "vitest";
import {
  buildWeightChart,
  hasLogInWeek,
  parseWeightInput,
  recentLogs,
  weightLogDateError,
  weightStats,
} from "./weight";

const logs = [
  { log_date: "2026-10-12", weight_kg: 82 },
  { log_date: "2026-10-05", weight_kg: 84 },
  { log_date: "2026-10-19", weight_kg: 80.5 },
];

describe("parseWeightInput", () => {
  it("accepts decimal comma and dot", () => {
    expect(parseWeightInput("72,5")).toEqual({ ok: true, value: 72.5 });
    expect(parseWeightInput(" 72.54 ")).toEqual({ ok: true, value: 72.5 });
  });
  it("rejects junk and out-of-range values", () => {
    for (const t of ["", "abc", "19,9", "300,1", "-5"]) expect(parseWeightInput(t).ok).toBe(false);
    expect(parseWeightInput("20").ok).toBe(true);
    expect(parseWeightInput("300").ok).toBe(true);
  });
});

describe("weightLogDateError", () => {
  const now = new Date("2026-10-18T22:30:00Z"); // 19 Oct in Bucharest
  it("allows today, past and today + 1", () => {
    expect(weightLogDateError("2026-10-19", "Europe/Bucharest", now)).toBeNull();
    expect(weightLogDateError("2026-10-20", "Europe/Bucharest", now)).toBeNull();
    expect(weightLogDateError("2025-01-01", "Europe/Bucharest", now)).toBeNull();
  });
  it("rejects later and invalid dates", () => {
    expect(weightLogDateError("2026-10-21", "Europe/Bucharest", now)).not.toBeNull();
    expect(weightLogDateError("2026-02-31", "Europe/Bucharest", now)).not.toBeNull();
    expect(weightLogDateError("nope", "Europe/Bucharest", now)).not.toBeNull();
  });
});

describe("weightStats", () => {
  it("computes change since first and distance to goal", () => {
    const s = weightStats(logs, 75);
    expect(s.first?.log_date).toBe("2026-10-05");
    expect(s.latest?.log_date).toBe("2026-10-19");
    expect(s.change).toBe(-3.5);
    expect(s.toGoal).toBe(5.5);
  });
  it("handles no goal, one log and no logs", () => {
    expect(weightStats(logs, null).toGoal).toBeNull();
    expect(weightStats([logs[0]], 75).change).toBeNull();
    expect(weightStats([], 75)).toEqual({ first: null, latest: null, change: null, toGoal: null });
  });
  it("goal below target gives a negative toGoal", () => {
    expect(weightStats([{ log_date: "2026-10-19", weight_kg: 74 }], 75).toGoal).toBe(-1);
  });
});

describe("buildWeightChart", () => {
  const opts = { width: 300, height: 200, padding: { top: 10, right: 10, bottom: 20, left: 30 } };
  it("orders points by date and scales x by calendar days", () => {
    const g = buildWeightChart(logs, opts);
    expect(g.points.map((p) => p.log_date)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(g.points[0].x).toBe(30);
    expect(g.points[2].x).toBe(290);
    expect(g.points[1].x).toBeCloseTo(160);
    expect(g.path.startsWith("M30.0 ")).toBe(true);
  });
  it("higher weight is higher on screen (smaller y) and stays inside the plot", () => {
    const g = buildWeightChart(logs, opts);
    expect(g.points[0].y).toBeLessThan(g.points[2].y);
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(180);
    }
  });
  it("includes the goal in the y domain and returns its y", () => {
    const g = buildWeightChart(logs, { ...opts, target: 70 });
    expect(g.yMin).toBeLessThanOrEqual(70);
    expect(g.goalY).not.toBeNull();
    expect(g.goalY as number).toBeGreaterThan(g.points[2].y);
    expect(g.goalY as number).toBeLessThanOrEqual(180);
  });
  it("no goal gives null goalY; single point is centred", () => {
    expect(buildWeightChart(logs, opts).goalY).toBeNull();
    const g = buildWeightChart([logs[0]], opts);
    expect(g.points[0].x).toBe(160);
    expect(g.path).toMatch(/^M/);
  });
  it("empty input is safe", () => {
    expect(buildWeightChart([], opts).points).toEqual([]);
  });
});

describe("recentLogs / hasLogInWeek", () => {
  it("filters by range", () => {
    expect(recentLogs(logs, "2026-10-19", 7).map((l) => l.log_date)).toEqual(["2026-10-12", "2026-10-19"]);
  });
  it("detects a log in the Monday-based week", () => {
    expect(hasLogInWeek(logs, "2026-10-19")).toBe(true);
    expect(hasLogInWeek(logs, "2026-10-26")).toBe(false);
  });
});
