import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { dropQueued, queueWrite } from "@/lib/portal/write-queue";

/**
 * Saves (upserts) a diary entry. Resolves 'saved' on success, 'queued' when the
 * write was stored for later (offline or network-level failure). Throws an Error
 * with the server message on HTTP errors. The body's `id` is client-generated,
 * so replaying the same write is idempotent.
 */
export async function saveDiaryEntry(body: DiaryEntryInput): Promise<"saved" | "queued"> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    queueWrite({ kind: "diary-upsert", payload: body });
    return "queued";
  }
  let r: Response;
  try {
    r = await fetch("/api/portal/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    queueWrite({ kind: "diary-upsert", payload: body });
    return "queued";
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? "Could not save entry");
  }
  dropQueued("diary-upsert", body.id);
  return "saved";
}

/** Deletes a diary entry. Same 'saved' | 'queued' contract as saveDiaryEntry(). */
export async function deleteDiaryEntry(id: string): Promise<"saved" | "queued"> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    queueWrite({ kind: "diary-delete", payload: { id } });
    return "queued";
  }
  let r: Response;
  try {
    r = await fetch(`/api/portal/diary?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    queueWrite({ kind: "diary-delete", payload: { id } });
    return "queued";
  }
  // 404 = already gone (e.g. a queued delete replayed twice): treat as success.
  if (!r.ok && r.status !== 404) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? "Could not delete entry");
  }
  dropQueued("diary-delete", id);
  return "saved";
}
