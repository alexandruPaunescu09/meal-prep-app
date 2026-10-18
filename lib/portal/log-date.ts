import { addDays, todayInTz } from "@/lib/format";

/**
 * Latest `log_date` the diary accepts: the customer's today plus one day of slack (the server only
 * knows the timezone from a cookie, which can be missing or stale). Logging is for today and past.
 */
export function maxLogDate(tz?: string | null, now: Date = new Date()): string {
  return addDays(todayInTz(tz, now), 1);
}
