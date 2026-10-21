"use client";

import { useSyncExternalStore } from "react";

// Who the portal's device-local state (write queue, pending diary) belongs to: the auth user id.
// `LAST_USER_KEY` is a DEVICE-level key: it is deliberately NOT cleared by the per-user wipe, so a
// later sign-in as a different user can be detected even after the session expired silently.
export const LAST_USER_KEY = "portal:last-user";

let owner: string | undefined;
let loaded = false;
const listeners = new Set<() => void>();

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    owner = localStorage.getItem(LAST_USER_KEY) ?? undefined;
  } catch {
    /* storage blocked */
  }
}

/** The last known owner. Survives a null session (expired token while offline) on purpose. */
export function getOwnerId(): string | undefined {
  ensureLoaded();
  return owner;
}

/** The user id remembered from the previous sign-in on this device (survives wipes). */
export function getLastUserId(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

/**
 * Sets the owner. A user id is also remembered as the device's last user; `undefined` (an
 * explicit SIGNED_OUT) only forgets the in-memory owner, never the remembered last user.
 */
export function setOwnerId(id: string | undefined) {
  ensureLoaded();
  if (id) {
    try {
      localStorage.setItem(LAST_USER_KEY, id);
    } catch {
      /* ignore */
    }
  }
  if (owner === id) return;
  owner = id;
  listeners.forEach((l) => l());
}

export function subscribeOwner(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Reactive owner id (undefined on the server and while unknown). */
export function useOwnerId(): string | undefined {
  return useSyncExternalStore(subscribeOwner, getOwnerId, () => undefined);
}
