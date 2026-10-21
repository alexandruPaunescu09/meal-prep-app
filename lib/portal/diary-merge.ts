import type { FoodLogEntry } from "@/lib/supabase/types";

/** A diary write the customer made that the server's data may not reflect yet. */
export type PendingDiaryRecord =
  | { op: "upsert"; entry: FoodLogEntry; settled: boolean; queued?: boolean; owner?: string }
  | { op: "delete"; id: string; settled: boolean; queued?: boolean; owner?: string };

/**
 * Records the given user may see: their own, plus legacy ones written before owner tracking
 * (no `owner`). Another user's records stay in storage but are never displayed.
 */
export function visiblePending(pending: PendingDiaryRecord[], owner: string | undefined): PendingDiaryRecord[] {
  return pending.filter((p) => !p.owner || p.owner === owner);
}

/**
 * The day's log entries as the customer should see them: server rows, minus pending deletes,
 * overridden by pending upserts, plus pending upserts for this date that are not on the server.
 */
export function mergeLogEntries(
  server: FoodLogEntry[],
  pending: PendingDiaryRecord[],
  date: string,
  owner?: string
): FoodLogEntry[] {
  pending = visiblePending(pending, owner);
  if (pending.length === 0) return server;
  const deleted = new Set<string>();
  const upserts = new Map<string, FoodLogEntry>();
  // Records are in write order: the last one for an id wins.
  for (const p of pending) {
    if (p.op === "delete") {
      deleted.add(p.id);
      upserts.delete(p.id);
    } else {
      deleted.delete(p.entry.id);
      upserts.set(p.entry.id, p.entry);
    }
  }
  const out: FoodLogEntry[] = [];
  const seen = new Set<string>();
  for (const e of server) {
    if (deleted.has(e.id)) continue;
    seen.add(e.id);
    out.push(upserts.get(e.id) ?? e);
  }
  for (const [id, entry] of upserts) {
    if (!seen.has(id) && entry.log_date === date) out.push(entry);
  }
  return out;
}
