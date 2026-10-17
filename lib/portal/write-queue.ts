"use client";

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

export type QueuedWrite = ReviewQueued | StatusQueued;

const listeners = new Set<() => void>();
let flushing: Promise<{ flushed: number; remaining: number }> | null = null;
// Cached snapshot so useSyncExternalStore gets a stable value between changes.
let cachedSize = -1;

function read(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
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

function write(items: QueuedWrite[]) {
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
  // A newer write for the same entry supersedes an older queued one of the same kind.
  const next = read().filter(
    (i) => !(i.kind === w.kind && i.payload.meal_plan_entry_id === w.payload.meal_plan_entry_id)
  );
  next.push(w);
  write(next);
}

export function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<{ flushed: number; remaining: number }> {
  const items = read();
  if (items.length === 0) return { flushed: 0, remaining: 0 };
  const remaining: QueuedWrite[] = [];
  let flushed = 0;
  for (const item of items) {
    const url = item.kind === "review" ? "/api/portal/reviews" : "/api/portal/status";
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });
      if (r.ok) {
        flushed += 1;
      } else if (r.status >= 400 && r.status < 500 && ![401, 408, 429].includes(r.status)) {
        // Will never succeed (forbidden / invalid): drop instead of retrying forever.
        console.warn("write-queue: dropping rejected write", r.status, item.kind);
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }
  // Keep anything queued while we were flushing.
  const added = read().slice(items.length);
  const finalItems = [...remaining, ...added];
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
