"use client";

import { clearQueue } from "@/lib/portal/write-queue";
import { clearPending } from "@/lib/portal/pending-diary";

/**
 * Wipes everything the portal keeps on this device for the signed-in customer. Call it in every
 * sign-out path BEFORE navigating away, so the next person on the same browser never sees (or
 * replays) the previous user's data:
 *  - offline write queue and pending-diary records (localStorage, plus their in-memory caches)
 *  - all Cache Storage caches (the service worker caches /portal/* pages)
 * Device preferences (e.g. install-banner dismissal) are intentionally kept.
 * Never throws: sign-out must always proceed.
 */
export async function clearPortalLocalState(): Promise<void> {
  try {
    clearQueue();
  } catch {
    /* ignore */
  }
  try {
    clearPending();
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
}
