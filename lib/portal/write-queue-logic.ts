// Pure helpers behind the offline write queue (no browser APIs, unit-testable).

export type QueueKind = "review" | "status" | "diary-upsert" | "diary-delete";

export interface QueueLike {
  kind: QueueKind;
  payload: { meal_plan_entry_id?: string; id?: string };
}

function isDiary(kind: QueueKind): boolean {
  return kind === "diary-upsert" || kind === "diary-delete";
}

/**
 * Identity of the thing a queued write targets. A newer write with the same key
 * supersedes an older queued one.
 *  - review / status: kind + meal_plan_entry_id (one pending write per kind per entry)
 *  - diary-upsert / diary-delete: shared "diary" group + entry id, so a later delete
 *    replaces a pending upsert (and vice versa) for the same entry.
 */
export function queueKey(w: QueueLike): string {
  if (isDiary(w.kind)) return `diary:${w.payload.id ?? ""}`;
  return `${w.kind}:${w.payload.meal_plan_entry_id ?? ""}`;
}

/** Queue-like stub for a (kind, id) pair as passed to dropQueued(). */
export function stubFor(kind: QueueKind, id: string): QueueLike {
  return { kind, payload: isDiary(kind) ? { id } : { meal_plan_entry_id: id } };
}

/** Items with every write that `incoming` supersedes removed (incoming itself is not added). */
export function withoutSuperseded<T extends QueueLike>(items: T[], incoming: QueueLike): T[] {
  const key = queueKey(incoming);
  return items.filter((i) => queueKey(i) !== key);
}

/**
 * Splits queued writes by owner for a flush under `currentUserId`.
 * Items carry the auth user id that queued them. An item owned by someone else must never be
 * replayed (the API derives the client from the session, so it would land in the wrong account).
 * Legacy items queued before owner tracking shipped have no `owner`; they are kept and flushed
 * as before so pending offline writes on existing devices are never lost.
 */
export function partitionByOwner<T extends QueueLike & { owner?: string }>(
  items: T[],
  currentUserId: string
): { mine: T[]; foreign: T[] } {
  const mine: T[] = [];
  const foreign: T[] = [];
  for (const i of items) (!i.owner || i.owner === currentUserId ? mine : foreign).push(i);
  return { mine, foreign };
}

/** HTTP request used to flush a queued write. */
export function requestFor(w: { kind: QueueKind; payload: unknown }): {
  url: string;
  method: "POST" | "DELETE";
  body?: string;
} {
  switch (w.kind) {
    case "review":
      return { url: "/api/portal/reviews", method: "POST", body: JSON.stringify(w.payload) };
    case "status":
      return { url: "/api/portal/status", method: "POST", body: JSON.stringify(w.payload) };
    case "diary-upsert":
      return { url: "/api/portal/diary", method: "POST", body: JSON.stringify(w.payload) };
    case "diary-delete":
      return {
        url: `/api/portal/diary?id=${encodeURIComponent((w.payload as { id: string }).id)}`,
        method: "DELETE",
      };
  }
}
