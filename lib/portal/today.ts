import { cookies } from "next/headers";
import { todayInTz } from "@/lib/format";

/**
 * The customer's local date ('YYYY-MM-DD') for server-rendered portal pages. SSR runs in UTC, so
 * this uses the browser timezone stored in the `tz` cookie (set by the Today page) and falls back
 * to the business timezone before it is known.
 */
export async function portalToday(): Promise<string> {
  return todayInTz((await cookies()).get("tz")?.value);
}
