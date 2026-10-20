import type { DiarySourceKind } from "@/lib/supabase/types";
import { addDays } from "@/lib/format";

/** The subset of a food_log_entries row the admin insights read. */
export interface InsightLog {
  log_date: string;
  source_kind: DiarySourceKind;
  food_id: string | null;
  ingredient_id: string | null;
  recipe_id: string | null;
  name: string;
  brand: string | null;
  calories: number | null;
}

export interface TopFood {
  key: string;
  name: string;
  brand: string | null;
  kind: DiarySourceKind;
  count: number;
  calories: number;
  lastDate: string;
}

/** Grouping key: the catalog id when there is one, else (quick adds, deleted catalog items) the name. */
function groupKey(l: InsightLog): string {
  if (l.food_id) return `food:${l.food_id}`;
  if (l.ingredient_id) return `ingredient:${l.ingredient_id}`;
  if (l.recipe_id) return `recipe:${l.recipe_id}`;
  return `${l.source_kind}:${l.name.trim().toLowerCase()}`;
}

/** Most-eaten logged foods (by total kcal, then times logged), newest log date as the last tiebreak. */
export function topOffPlanFoods(logs: InsightLog[], limit = 10): TopFood[] {
  const groups = new Map<string, TopFood>();
  for (const l of logs) {
    const key = groupKey(l);
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.calories += l.calories ?? 0;
      if (l.log_date > g.lastDate) {
        g.lastDate = l.log_date;
        g.name = l.name; // show the latest spelling
      }
    } else {
      groups.set(key, {
        key,
        name: l.name,
        brand: l.brand,
        kind: l.source_kind,
        count: 1,
        calories: l.calories ?? 0,
        lastDate: l.log_date,
      });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.calories - a.calories || b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}

export interface InactivityInput {
  /** Customers with portal access. `since` = local date their access started. */
  portalClients: { clientId: string; name: string; since: string }[];
  /** Local dates with at least one eaten plan meal or logged entry, per client (any order, may repeat). */
  activity: { clientId: string; date: string }[];
  today: string;
  /** Flag at this many days without activity. */
  thresholdDays: number;
  /** How far back `activity` reaches; older activity is unknown. */
  lookbackDays: number;
}

export interface InactiveClient {
  clientId: string;
  name: string;
  /** Days since the last activity (today = 0); null = none within the lookback window. */
  daysSince: number | null;
  lastActivity: string | null;
}

const dayDiff = (later: string, earlier: string): number => {
  let n = 0;
  // Dates are at most a few weeks apart; walking avoids UTC parsing pitfalls.
  for (let d = earlier; d < later && n < 10000; d = addDays(d, 1)) n++;
  return n;
};

/** Portal clients with no eaten plan meal and no logged entry for `thresholdDays`+ days, most idle first. */
export function inactiveClients(input: InactivityInput): InactiveClient[] {
  const last = new Map<string, string>();
  for (const a of input.activity) {
    if (a.date > input.today) continue;
    const cur = last.get(a.clientId);
    if (!cur || a.date > cur) last.set(a.clientId, a.date);
  }
  const out: InactiveClient[] = [];
  for (const c of input.portalClients) {
    const lastActivity = last.get(c.clientId) ?? null;
    if (lastActivity) {
      const daysSince = dayDiff(input.today, lastActivity);
      if (daysSince >= input.thresholdDays) out.push({ clientId: c.clientId, name: c.name, daysSince, lastActivity });
    } else {
      // Never active: only flag once access is old enough, so a fresh invite isn't nagged about.
      const waited = dayDiff(input.today, c.since);
      if (waited >= input.thresholdDays) {
        out.push({ clientId: c.clientId, name: c.name, daysSince: waited >= input.lookbackDays ? null : waited, lastActivity: null });
      }
    }
  }
  return out.sort((a, b) => (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity) || a.name.localeCompare(b.name));
}
