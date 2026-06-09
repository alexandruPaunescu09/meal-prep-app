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

function read(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(items: QueuedWrite[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function queueWrite(w: QueuedWrite) {
  const items = read();
  items.push(w);
  write(items);
}

export async function flushQueue(): Promise<{ flushed: number; remaining: number }> {
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
      if (r.ok) flushed += 1;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  write(remaining);
  return { flushed, remaining: remaining.length };
}

export function attachQueueFlusher() {
  if (typeof window === "undefined") return;
  const handler = () => {
    flushQueue().catch(() => {});
  };
  window.addEventListener("online", handler);
  // Also try once on attach.
  if (navigator.onLine) handler();
}
