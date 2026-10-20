import { compareLocalDate } from "@/lib/portal/entry-helpers";
import { streaks, summarizeRange, type DiaryRangeDay, type RangeSummary } from "@/lib/portal/diary-range";

/** Days (ascending) up to and including `today`, then the last `n` of them. Future days are dropped. */
export function sliceWindow<T extends { date: string }>(days: T[], today: string, n: number): T[] {
  const past = days.filter((d) => compareLocalDate(d.date, today) <= 0);
  return past.slice(Math.max(0, past.length - n));
}

/** Top of the chart's y axis: the largest bar or target, rounded up to a tidy step (never 0). */
export function chartMax(values: (number | null | undefined)[], step = 500): number {
  const max = Math.max(0, ...values.map((v) => (v != null && Number.isFinite(v) ? v : 0)));
  if (max <= 0) return step;
  return Math.ceil(max / step) * step;
}

/** Height of a bar in px (0 for empty days, at least `minPx` for any positive value so it stays visible). */
export function barHeight(value: number, max: number, plotHeight: number, minPx = 2): number {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.min(plotHeight, Math.max(minPx, (value / max) * plotHeight));
}

/** Whole-number percentages that add up to 100 (largest remainder), so stacked labels never show 101%. */
export function percentSplit(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return floors;
}

export interface ProgressBar {
  date: string;
  kcal: number;
  target: number | null;
  active: boolean;
}

export interface ProgressWindow {
  bars: ProgressBar[];
  summary: RangeSummary;
}

export interface ProgressView {
  today: string;
  windows: { 7: ProgressWindow; 30: ProgressWindow };
  streak: { current: number; best: number };
  todayActive: boolean;
  /** Any active or skipped day in the loaded history. */
  hasActivity: boolean;
}

/** Compact, JSON-safe payload for the client: bars + summary per window, streak over all loaded days. */
export function buildProgressView(days: DiaryRangeDay[], today: string): ProgressView {
  const win = (n: 7 | 30): ProgressWindow => {
    const slice = sliceWindow(days, today, n);
    return {
      bars: slice.map((d) => ({ date: d.date, kcal: d.diary.eaten.calories, target: d.targets.calories, active: d.active })),
      summary: summarizeRange(slice, today),
    };
  };
  const past = sliceWindow(days, today, days.length);
  return {
    today,
    windows: { 7: win(7), 30: win(30) },
    streak: streaks(days, today),
    todayActive: past.some((d) => d.date === today && d.active),
    hasActivity: past.some((d) => d.active || d.diary.counts.planSkipped > 0),
  };
}

/** Friendly line under the streak numbers. */
export function streakMessage(s: { current: number; best: number }, todayActive: boolean): string {
  if (s.best === 0) return "Log a meal or mark one eaten to start a streak.";
  if (s.current === 0) return "Log today to start a new streak.";
  if (!todayActive) return `Log today to keep your ${s.current}-day streak going.`;
  if (s.current >= s.best) return "Your longest streak yet. Keep it up!";
  const gap = s.best - s.current;
  return `${gap} more ${gap === 1 ? "day" : "days"} to beat your best.`;
}
