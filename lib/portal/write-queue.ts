"use client";

import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { createClient } from "@/lib/supabase/client";
import {
  enqueue,
  isVisibleTo,
  requestFor,
  runFlush,
  stubFor,
  dropSuperseded,
  type SendOutcome,
} from "@/lib/portal/write-queue-logic";
import { getOwnerId, setOwnerId, subscribeOwner } from "@/lib/portal/owner";

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
  payload: {
    meal_plan_entry_id: string;
    status: "eaten" | "skipped" | null;
    portion_factor?: number | null;
  };
};

type DiaryUpsertQueued = { kind: "diary-upsert"; payload: DiaryEntryInput };
type DiaryDeleteQueued = { kind: "diary-delete"; payload: { id: string } };

export type QueuedWrite = ReviewQueued | StatusQueued | DiaryUpsertQueued | DiaryDeleteQueued;
/** `owner` = auth user id that queued the write; absent on items queued before owner tracking. */
type StoredWrite = QueuedWrite & { id: string; owner?: string };

// Auth user id of the current session. The owner (lib/portal/owner.ts) is cached so queueWrite()
// can stay synchronous and is NEVER cleared by a null session (an expired token while offline
// returns {session:null} without throwing); only an explicit SIGNED_OUT (auth watcher) clears it.
async function currentUserId(): Promise<string | undefined> {
  try {
    const { data } = await createClient().auth.getSession();
    const id = data.session?.user.id;
    if (id) setOwnerId(id);
  } catch {
    /* offline / storage blocked: keep the last known owner */
  }
  return getOwnerId();
}

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
    // Older queues have no ids: assign one and persist at once (ids must be stable across reads,
    // because flush removes by id against freshly read storage).
    let assigned = false;
    const items = v.map((i: QueuedWrite & { id?: string }) => {
      if (i.id) return i;
      assigned = true;
      return { ...i, id: newId() };
    }) as StoredWrite[];
    if (assigned) localStorage.setItem(KEY, JSON.stringify(items));
    return items;
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

/** Number of writes waiting to sync for the current user (other users' kept items are not shown). */
export function queueSize(): number {
  if (cachedSize < 0) {
    const owner = getOwnerId();
    cachedSize = read().filter((i) => isVisibleTo(i, owner)).length;
  }
  return cachedSize;
}

/** Ids of diary entries that still have a write waiting in the queue. */
export function queuedDiaryIds(): Set<string> {
  const ids = new Set<string>();
  for (const i of read()) {
    if (i.kind === "diary-upsert" || i.kind === "diary-delete") ids.add(i.payload.id);
  }
  return ids;
}

export function queueWrite(w: QueuedWrite) {
  // A newer write for the same entry supersedes an older queued one (see queueKey).
  // Only the current user's writes can be superseded; other users' kept items are untouched.
  write(enqueue(read(), w, newId(), getOwnerId()));
}

/**
 * Drop queued writes for an entry (a newer direct save/delete made them stale).
 * `id` is the meal_plan_entry_id for review/status and the diary entry id for diary kinds.
 */
export function dropQueued(kind: QueuedWrite["kind"], id: string) {
  const items = read();
  const next = dropSuperseded(items, stubFor(kind, id), getOwnerId());
  if (next.length !== items.length) write(next);
}

// The visible count depends on the owner.
if (typeof window !== "undefined") subscribeOwner(notify);

/** Removes every queued write (explicit sign-out). */
export function clearQueue() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  notify();
}

export function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function send(item: StoredWrite): Promise<SendOutcome> {
  const req = requestFor(item);
  try {
    const r = await fetch(req.url, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.body,
    });
    if (r.ok) return "ok";
    if (r.status >= 400 && r.status < 500 && ![401, 408, 429].includes(r.status)) {
      // Will never succeed (forbidden / invalid): drop instead of retrying forever.
      console.warn("write-queue: dropping rejected write", r.status, item.kind);
      return "drop";
    }
  } catch {
    /* network failure: keep for the next flush */
  }
  return "keep";
}

async function doFlush(): Promise<{ flushed: number; remaining: number }> {
  const result = await runFlush<StoredWrite>({ read, write, getUserId: currentUserId, send });
  if (result.flushed > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("portal:queue-flushed", { detail: { flushed: result.flushed } }));
  }
  return result;
}

export function attachQueueFlusher(): (() => void) | undefined {
  if (typeof window === "undefined") return;
  void currentUserId(); // prime the owner cache so queued writes are tagged
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
