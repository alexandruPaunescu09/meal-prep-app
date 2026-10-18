import { addDays, mondayOf, parseLocalDate, toLocalISODate } from "@/lib/format";

const MEAL_ORDER: Record<string, number> = {
  breakfast: 1,
  lunch: 2,
  dinner: 3,
  snack: 4,
};

export function sortByMealType<T extends { meal_type: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => (MEAL_ORDER[a.meal_type] ?? 9) - (MEAL_ORDER[b.meal_type] ?? 9)
  );
}

/**
 * day_of_week: 1=Monday … 7=Sunday (matches existing code).
 * Returns a Monday-based 1..7 index for a given JS date.
 */
export function dayOfWeekIndex(d: Date): number {
  const js = d.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}

// Local-date primitives live in lib/format.ts; aliased here for existing callers.
export {
  parseLocalDate,
  toLocalISODate as formatLocalDate,
  mondayOf as mondayOfWeek,
  addDays as addDaysLocal,
};

/** True iff `s` is a valid YYYY-MM-DD calendar date. */
export function isValidLocalDate(s: string): boolean {
  return parseLocalDate(s) !== null;
}

/**
 * Compare two YYYY-MM-DD strings as calendar dates.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * Lexicographic comparison is correct for this format.
 */
export function compareLocalDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
