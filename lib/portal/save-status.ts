import type { MealStatus } from "@/lib/supabase/types";
import { dropQueued, queueWrite } from "@/lib/portal/write-queue";

/**
 * Saves a meal status. Resolves 'saved' on success, 'queued' when the write was
 * stored for later (offline or network-level failure). Throws an Error with the
 * server message on HTTP errors.
 */
export async function saveMealStatus(
  entryId: string,
  status: MealStatus | null,
  /** Share of the planned portion eaten (only used with status 'eaten'; null/omitted = 1). */
  portionFactor?: number | null
): Promise<"saved" | "queued"> {
  const payload = {
    meal_plan_entry_id: entryId,
    status,
    portion_factor: status === "eaten" ? (portionFactor ?? null) : null,
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    queueWrite({ kind: "status", payload });
    return "queued";
  }
  let r: Response;
  try {
    r = await fetch("/api/portal/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    queueWrite({ kind: "status", payload });
    return "queued";
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? "Could not save status");
  }
  dropQueued("status", entryId);
  return "saved";
}

export interface MealStatusWrite {
  entryId: string;
  status: MealStatus | null;
  portionFactor?: number | null;
}

/**
 * Saves several statuses in ONE request (all-or-nothing on the server). Offline or on a network
 * failure each change is queued individually (the queue keeps one pending write per entry).
 * Throws on an HTTP error, in which case nothing was saved.
 */
export async function saveMealStatuses(changes: MealStatusWrite[]): Promise<"saved" | "queued"> {
  if (changes.length === 1) {
    const c = changes[0];
    return saveMealStatus(c.entryId, c.status, c.portionFactor);
  }
  const payloads = changes.map((c) => ({
    meal_plan_entry_id: c.entryId,
    status: c.status,
    portion_factor: c.status === "eaten" ? (c.portionFactor ?? null) : null,
  }));
  const queueAll = () => {
    for (const payload of payloads) queueWrite({ kind: "status", payload });
    return "queued" as const;
  };
  if (typeof navigator !== "undefined" && !navigator.onLine) return queueAll();
  let r: Response;
  try {
    r = await fetch("/api/portal/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: payloads }),
    });
  } catch {
    return queueAll();
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? "Could not save status");
  }
  for (const c of changes) dropQueued("status", c.entryId);
  return "saved";
}
