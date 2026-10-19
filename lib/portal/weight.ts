import { addDays, parseDecimal, parseLocalDate } from "@/lib/format";
import { WEIGHT_LOG_MAX, WEIGHT_LOG_MIN } from "@/lib/validations/schemas";
import { maxLogDate } from "@/lib/portal/log-date";

export interface WeightPoint {
  log_date: string;
  weight_kg: number;
}

/** Parse what the customer typed ("72,5" / "72.5"). Returns the value or a message. */
export function parseWeightInput(text: string): { ok: true; value: number } | { ok: false; error: string } {
  const n = parseDecimal(text);
  if (n == null || n < WEIGHT_LOG_MIN || n > WEIGHT_LOG_MAX) {
    return { ok: false, error: `Enter a weight between ${WEIGHT_LOG_MIN} and ${WEIGHT_LOG_MAX} kg, e.g. 72,5.` };
  }
  // One decimal is plenty for a bathroom scale.
  return { ok: true, value: Math.round(n * 10) / 10 };
}

/** Null when `logDate` is a real calendar date no later than the customer's today + 1. */
export function weightLogDateError(logDate: string, tz?: string | null, now: Date = new Date()): string | null {
  if (!parseLocalDate(logDate)) return "Invalid date";
  if (logDate > maxLogDate(tz, now)) return "log_date cannot be in the future";
  return null;
}

export interface WeightStats {
  first: WeightPoint | null;
  latest: WeightPoint | null;
  /** latest - first, rounded to 0.1; null with fewer than two logs. */
  change: number | null;
  /** latest - goal (positive = still above goal); null without a goal or a log. */
  toGoal: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** `logs` in any order. */
export function weightStats(logs: WeightPoint[], target: number | null | undefined): WeightStats {
  if (logs.length === 0) return { first: null, latest: null, change: null, toGoal: null };
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  return {
    first,
    latest,
    change: sorted.length >= 2 ? round1(latest.weight_kg - first.weight_kg) : null,
    toGoal: target != null ? round1(latest.weight_kg - target) : null,
  };
}

export interface ChartGeometry {
  /** Pixel positions, in date order. */
  points: { x: number; y: number; log_date: string; weight_kg: number }[];
  path: string;
  goalY: number | null;
  yTicks: { y: number; value: number }[];
  /** Min/max of the y domain, after padding. */
  yMin: number;
  yMax: number;
}

export interface ChartOptions {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  target?: number | null;
}

const NICE_STEPS = [0.5, 1, 2, 5, 10, 20, 50];

/**
 * Scale logs into an SVG viewport. X is proportional to calendar days (gaps show as gaps), Y covers
 * the data plus the goal line with ~8% breathing room, snapped to a nice step.
 */
export function buildWeightChart(logs: WeightPoint[], opts: ChartOptions): ChartGeometry {
  const { width, height, padding, target } = opts;
  const sorted = [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date));
  const innerW = Math.max(1, width - padding.left - padding.right);
  const innerH = Math.max(1, height - padding.top - padding.bottom);

  const values = sorted.map((l) => l.weight_kg);
  if (target != null) values.push(target);
  if (values.length === 0) {
    return { points: [], path: "", goalY: null, yTicks: [], yMin: 0, yMax: 1 };
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 2) {
    const mid = (hi + lo) / 2;
    lo = mid - 1;
    hi = mid + 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const step = NICE_STEPS.find((s) => (hi - lo) / s <= 5) ?? 50;
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;

  const yOf = (v: number) => padding.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const dayIndex = (d: string) => {
    const t = parseLocalDate(d);
    return t ? Math.round(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 86400000) : 0;
  };
  const d0 = sorted.length ? dayIndex(sorted[0].log_date) : 0;
  const span = sorted.length ? dayIndex(sorted[sorted.length - 1].log_date) - d0 : 0;
  const xOf = (d: string) =>
    span === 0 ? padding.left + innerW / 2 : padding.left + ((dayIndex(d) - d0) / span) * innerW;

  const points = sorted.map((l) => ({ x: xOf(l.log_date), y: yOf(l.weight_kg), ...l }));
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const yTicks: ChartGeometry["yTicks"] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push({ value: round1(v), y: yOf(v) });

  return { points, path, goalY: target != null ? yOf(target) : null, yTicks, yMin, yMax };
}

/** Drop logs older than `days` before `today` (the chart range filter). */
export function recentLogs<T extends WeightPoint>(logs: T[], today: string, days: number): T[] {
  const from = addDays(today, -days);
  return logs.filter((l) => l.log_date >= from);
}

/** Monday-based week start for "has the customer logged this week". */
export function hasLogInWeek(logs: WeightPoint[], weekStart: string): boolean {
  const end = addDays(weekStart, 6);
  return logs.some((l) => l.log_date >= weekStart && l.log_date <= end);
}
