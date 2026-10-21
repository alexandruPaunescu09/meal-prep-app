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

/** A stored queue item: queued write + stable id + auth user id that queued it (absent on legacy items). */
export type OwnedItem = QueueLike & { id: string; owner?: string };

/**
 * Whether `owner` may see / flush this item. Legacy items (no owner) belong to everyone, as before
 * owner tracking; items owned by another user are kept in storage but never shown or sent.
 */
export function isVisibleTo(item: { owner?: string }, owner: string | undefined): boolean {
  return !item.owner || item.owner === owner;
}

/**
 * Storage contents after queueing `w`: older writes it supersedes are removed (only the
 * caller's own, never another user's kept items), then `w` is appended tagged with `owner`.
 */
export function dropSuperseded<T extends OwnedItem>(items: T[], stub: QueueLike, owner: string | undefined): T[] {
  const key = queueKey(stub);
  return items.filter((i) => !isVisibleTo(i, owner) || queueKey(i) !== key);
}

export function enqueue<T extends OwnedItem>(items: T[], w: QueueLike, id: string, owner: string | undefined): T[] {
  return [...dropSuperseded(items, w, owner), { ...(w as object), id, ...(owner ? { owner } : {}) } as T];
}

export type SendOutcome = "ok" | "drop" | "keep";

export interface FlushDeps<T extends OwnedItem> {
  /** Reads CURRENT storage (called again after every await; never reuse an old array). */
  read(): T[];
  write(items: T[]): void;
  getUserId(): Promise<string | undefined>;
  send(item: T): Promise<SendOutcome>;
}

/**
 * Flushes the current user's queued writes. Storage is re-read after every await and only
 * written when something finished, filtered by id against the CURRENT contents, so a write queued
 * (or superseded / dropped) while we awaited is never lost or resurrected. Items owned by
 * another user stay untouched.
 */
export async function runFlush<T extends OwnedItem>(deps: FlushDeps<T>): Promise<{ flushed: number; remaining: number }> {
  if (deps.read().length === 0) return { flushed: 0, remaining: 0 };
  const uid = await deps.getUserId();
  const visible = () => deps.read().filter((i) => isVisibleTo(i, uid)).length;
  if (!uid) return { flushed: 0, remaining: visible() }; // no known owner: leave the queue alone
  const batch = deps.read().filter((i) => isVisibleTo(i, uid));
  const done = new Set<string>(); // sent successfully or permanently dropped
  let flushed = 0;
  for (const item of batch) {
    // Superseded / dropped while an earlier item was in flight: don't send stale content.
    if (!deps.read().some((i) => i.id === item.id)) continue;
    const outcome = await deps.send(item);
    if (outcome === "ok") {
      flushed += 1;
      done.add(item.id);
    } else if (outcome === "drop") {
      done.add(item.id);
    }
  }
  if (done.size > 0) {
    const cur = deps.read();
    const next = cur.filter((i) => !done.has(i.id));
    if (next.length !== cur.length) deps.write(next);
  }
  return { flushed, remaining: visible() };
}
