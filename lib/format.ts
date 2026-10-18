// Pure formatting + date helpers (no React). Numbers use ro-RO, UI copy for
// dates stays English (en-GB style). Date inputs accept a Date or a
// 'YYYY-MM-DD' string; date-only strings are ALWAYS parsed as LOCAL dates
// (never via `new Date("2026-10-19")`, which is UTC and shifts in UTC+2/3).

export type DateInput = Date | string;

// ------------------------------------------------------------------ labels

/** "bread_pasta" -> "Bread Pasta". */
export function humanizeSlug(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Monday-first, index 0 = day_of_week 1. */
export const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAYS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

// ---------------------------------------------------------------- numbers

/** 1234.5 -> "1234,50" (ro-RO decimal comma, no thousands grouping). Non-finite/null -> "—". */
export function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: false,
  }).format(n);
}

/** Quantity for display: < 1 -> one decimal, otherwise whole number. */
export function formatQuantity(n: number): string {
  return n < 1 ? formatNumber(n, 1) : formatNumber(Math.round(n), 0);
}

/** 1234.5 -> "1.234,50 lei" (ro-RO, grouped). */
export function formatLei(
  n: number | null | undefined,
  { decimals = 2 }: { decimals?: number } = {}
): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const s = new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(n);
  return `${s} lei`;
}

/** g -> "8,40 lei/kg", ml -> "lei/l", buc -> "lei/buc" (pricePerUnit is per 1 g/ml/buc). */
export function formatPricePerUnit(
  pricePerUnit: number | null | undefined,
  unit: string
): string {
  if (pricePerUnit == null || !Number.isFinite(pricePerUnit)) return "—";
  if (unit === "g") return `${formatNumber(pricePerUnit * 1000)} lei/kg`;
  if (unit === "ml") return `${formatNumber(pricePerUnit * 1000)} lei/l`;
  return `${formatNumber(pricePerUnit)} lei/${unit}`;
}

/** Parse "12,5" or "12.5" (for inputMode="decimal" text inputs). null if not a number. */
export function parseDecimal(str: string | null | undefined): number | null {
  if (str == null) return null;
  const s = str.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ------------------------------------------------------------------ dates

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Parse a YYYY-MM-DD string into a local-time Date (no timezone shifts).
 * Returns null if the string is malformed or doesn't denote a real calendar date.
 */
export function parseLocalDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((p) => parseInt(p, 10));
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return dt;
}

/** Date | 'YYYY-MM-DD' | ISO timestamp -> Date (local). Throws on garbage. */
function toDate(d: DateInput): Date {
  if (d instanceof Date) return d;
  const local = parseLocalDate(d);
  if (local) return local;
  const t = new Date(d); // full timestamps (timestamptz) are real instants
  if (Number.isNaN(t.getTime())) throw new Error(`Invalid date: ${d}`);
  return t;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM-DD' from LOCAL components (never toISOString()). */
export function toLocalISODate(date: DateInput): string {
  const d = toDate(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "19 Oct 2026" */
export function formatDate(d: DateInput): string {
  const x = toDate(d);
  return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}

/** "Mon 19 Oct" */
export function formatShortDate(d: DateInput): string {
  const x = toDate(d);
  return `${DAYS[x.getDay()]} ${x.getDate()} ${MONTHS[x.getMonth()]}`;
}

/** "19 Oct 2026, 14:05" (local time; accepts timestamptz strings). */
export function formatDateTime(d: DateInput): string {
  const x = toDate(d);
  return `${formatDate(x)}, ${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/** Week range from its Monday: "19–25 Oct 2026", "28 Oct – 3 Nov 2026", "28 Dec 2026 – 3 Jan 2027". */
export function formatWeekRange(weekStart: DateInput): string {
  const a = toDate(weekStart);
  const b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
  if (a.getFullYear() !== b.getFullYear()) return `${formatDate(a)} – ${formatDate(b)}`;
  if (a.getMonth() !== b.getMonth()) {
    return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  }
  return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

/** Monday of the week containing `date`, as 'YYYY-MM-DD'. */
export function mondayOf(date: DateInput): string {
  const d = toDate(date);
  const back = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back));
}

/** 'YYYY-MM-DD' + n days (n may be negative) -> 'YYYY-MM-DD'. DST-safe. */
export function addDays(date: DateInput, n: number): string {
  const d = toDate(date);
  return toLocalISODate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Monday of the current week (app timezone). */
export function currentWeekStart(): string {
  return mondayOf(todayInAppTz());
}

/** Business timezone: SSR runs in UTC on Vercel, which is a day off for Romania around midnight. */
export const APP_TIMEZONE = "Europe/Bucharest";

/** Today's calendar date in APP_TIMEZONE as a local-midnight Date (same on server and browser). */
export function todayInAppTz(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parseLocalDate(ymd) ?? new Date();
}

/** Monday of next week (local). */
export function nextWeekStart(): string {
  return addDays(currentWeekStart(), 7);
}

/** True iff the date is a Monday (week_start values must be). */
export function isMonday(date: DateInput): boolean {
  return toDate(date).getDay() === 1;
}

/**
 * Swaps the week range embedded in a plan name ("Ana – 12–18 Oct 2026") for the
 * target week's. Returns the name unchanged when it doesn't contain the range.
 */
export function retitleForWeek(name: string, fromWeek: DateInput, toWeek: DateInput): string {
  return name.split(formatWeekRange(fromWeek)).join(formatWeekRange(toWeek));
}
