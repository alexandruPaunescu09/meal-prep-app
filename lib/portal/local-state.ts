"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { clearQueue } from "@/lib/portal/write-queue";
import { clearPending } from "@/lib/portal/pending-diary";
import { getLastUserId, setOwnerId } from "@/lib/portal/owner";

async function clearCaches() {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Wipes everything the portal keeps on this device for the signed-in customer: the offline write
 * queue, pending-diary records (plus their in-memory caches) and all Cache Storage caches (the
 * service worker caches /portal/* pages). Device preferences (install-banner dismissal) and the
 * device-level `portal:last-user` key are kept. Never throws.
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
  await clearCaches();
}

/**
 * Signs out FIRST; local state is wiped only once the sign-out succeeded (a failed sign-out, e.g.
 * offline, leaves the user signed in with their queue intact). Returns false on failure.
 */
export async function signOutAndClear(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return false;
  } catch {
    return false;
  }
  await clearPortalLocalState();
  return true;
}

export const SIGN_OUT_FAILED_MESSAGE = "Couldn't sign out. Check your connection.";

let watching = false;

/**
 * One shared auth listener (mounted by `AuthWatcher` in the portal and admin shells):
 *  - SIGNED_OUT from any cause (explicit, session expiry, proxy, another tab): wipe local state.
 *  - a session for a DIFFERENT user than the device's last one: the previous user's pending-diary
 *    display state and cached pages go. Their queued writes are kept in storage but never shown
 *    or sent (they carry their owner id).
 */
export function startAuthWatch(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  try {
    const supabase = createClient();
    const seen = (id: string) => {
      const last = getLastUserId();
      setOwnerId(id);
      if (last && last !== id) {
        try {
          clearPending();
        } catch {
          /* ignore */
        }
        void clearCaches();
      }
    };
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setOwnerId(undefined);
        void clearPortalLocalState();
      } else if (session?.user) {
        seen(session.user.id);
      }
    });
  } catch {
    watching = false;
  }
}
