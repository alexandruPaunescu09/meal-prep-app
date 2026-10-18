import type { MealStatus } from "@/lib/supabase/types";
import { dropQueued, queueWrite } from "@/lib/portal/write-queue";

/**
 * Saves a meal status. Resolves 'saved' on success, 'queued' when the write was
 * stored for later (offline or network-level failure). Throws an Error with the
 * server message on HTTP errors.
 */
export async function saveMealStatus(
  entryId: string,
  status: MealStatus | null
): Promise<"saved" | "queued"> {
  const payload = { meal_plan_entry_id: entryId, status };
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
