"use client";

import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { requestFor, stubFor, withoutSuperseded } from "@/lib/portal/write-queue-logic";

const KEY = "portal:write-queue:v1";

type ReviewQueued = {
  kind: "review";
  payload: {
    meal_plan_entry_id: string;
    rating: number;
    comment: string | null;
    tag_ids: string[];
    photo_path?: string | null;
  };
};
type StatusQueued = {
  kind: "status";
  payload: { meal_plan_entry_id: string; status: "eaten" | "skipped" | null };
};

type DiaryUpsertQueued = { kind: "diary-upsert"; payload: DiaryEntryInput };
type DiaryDeleteQueued = { kind: "diary-delete"; payload: { id: string } };

export type QueuedWrite = ReviewQueued | StatusQueued | DiaryUpsertQueued | DiaryDeleteQueued;
type StoredWrite = QueuedWrite & { id: string };

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const listeners = new Set<() => void>();
let flushing: Promise<{ flushed: number; remaining: number }> | null = null;
// Cached snapshot so useSyncExternalStore gets a stable value between changes.
let cachedSize = -1;

function read(): StoredWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    // Older queues have no ids: assign one (persisted on the next write) so they still flush.
    return v.map((i: QueuedWrite & { id?: string }) => (i.id ? i : { ...i, id: newId() })) as StoredWrite[];
  } catch {
    return [];
  }
}

function notify() {
  cachedSize = -1;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore listener errors */
    }
  });
}

function write(items: StoredWrite[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("write-queue: could not persist queue", e);
  }
  notify();
}

/** Subscribe to queue changes (queued / flushed). Returns unsubscribe. */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Number of writes waiting to sync. */
export function queueSize(): number {
  if (cachedSize < 0) cachedSize = read().length;
  return cachedSize;
}

export function queueWrite(w: QueuedWrite) {
  // A newer write for the same entry supersedes an older queued one (see queueKey).
  const next = withoutSuperseded(read(), w);
  next.push({ ...w, id: newId() });
  write(next);
}

/**
 * Drop queued writes for an entry (a newer direct save/delete made them stale).
 * `id` is the meal_plan_entry_id for review/status and the diary entry id for diary kinds.
 */
export function dropQueued(kind: QueuedWrite["kind"], id: string) {
  const items = read();
  const next = withoutSuperseded(items, stubFor(kind, id));
  if (next.length !== items.length) write(next);
}

export function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<{ flushed: number; remaining: number }> {
  // Ids are only stable once persisted; persist any freshly assigned ids first.
  const items = read();
  if (items.length === 0) return { flushed: 0, remaining: 0 };
  write(items);
  const done = new Set<string>(); // sent successfully or permanently dropped
  let flushed = 0;
  for (const item of items) {
    const req = requestFor(item);
    try {
      const r = await fetch(req.url, {
        method: req.method,
        headers: { "Content-Type": "application/json" },
        body: req.body,
      });
      if (r.ok) {
        flushed += 1;
        done.add(item.id);
      } else if (r.status >= 400 && r.status < 500 && ![401, 408, 429].includes(r.status)) {
        // Will never succeed (forbidden / invalid): drop instead of retrying forever.
        console.warn("write-queue: dropping rejected write", r.status, item.kind);
        done.add(item.id);
      }
    } catch {
      /* network failure: keep for the next flush */
    }
  }
  // Re-read: remove only what we finished; anything added/superseded meanwhile stays as is.
  const finalItems = read().filter((i) => !done.has(i.id));
  write(finalItems);
  if (flushed > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("portal:queue-flushed", { detail: { flushed } }));
  }
  return { flushed, remaining: finalItems.length };
}

export function attachQueueFlusher(): (() => void) | undefined {
  if (typeof window === "undefined") return;
  const handler = () => {
    flushQueue().catch(() => {});
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && navigator.onLine) handler();
  };
  window.addEventListener("online", handler);
  document.addEventListener("visibilitychange", onVisible);
  // Also try once on attach.
  if (navigator.onLine) handler();
  return () => {
    window.removeEventListener("online", handler);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
