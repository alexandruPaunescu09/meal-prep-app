"use client";

import { useSyncExternalStore } from "react";
import type { PendingDiaryRecord } from "@/lib/portal/diary-merge";
import { queuedDiaryIds } from "@/lib/portal/write-queue";

// What the customer just did to their diary, kept so the day view reflects it immediately and
// (for offline writes) after a reload, until the server data catches up. Display only: the
// actual writes live in the offline queue.
const KEY = "portal:diary-pending:v1";
const EMPTY: PendingDiaryRecord[] = [];

/** Entry ids whose direct save/delete request is currently running. */
const inflight = new Set<string>();
export function beginInflight(id: string) {
  inflight.add(id);
}
export function endInflight(id: string) {
  inflight.delete(id);
}

const listeners = new Set<() => void>();
let cache: PendingDiaryRecord[] | null = null;

function recordId(r: PendingDiaryRecord): string {
  return r.op === "delete" ? r.id : r.entry.id;
}

function read(): PendingDiaryRecord[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(v) ? (v as PendingDiaryRecord[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: PendingDiaryRecord[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("pending-diary: could not persist", e);
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Pending diary records, in write order. Re-renders when they change. */
export function usePendingDiary(): PendingDiaryRecord[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Forgets every pending record (sign-out): clears storage and the in-memory cache. */
export function clearPending() {
  cache = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Records a write; replaces an older record for the same entry. */
export function putPending(r: PendingDiaryRecord) {
  write([...read().filter((p) => recordId(p) !== recordId(r)), r]);
}

/** Forgets a record (the write failed for good and was rolled back). */
export function removePending(id: string) {
  const cur = read();
  const next = cur.filter((p) => recordId(p) !== id);
  if (next.length !== cur.length) write(next);
}

/** The write for `id` reached the server; the record can go once fresh data renders. */
export function settlePending(id: string) {
  const cur = read();
  if (!cur.some((p) => recordId(p) === id && !p.settled)) return;
  write(cur.map((p) => (recordId(p) === id ? { ...p, settled: true } : p)));
}

/** Settles every record whose write is no longer queued (a flush finished, maybe in another tab). */
export function settleFlushed() {
  const queued = queuedDiaryIds();
  for (const id of inflight) queued.add(id); // a direct save still on its way is not "flushed"
  const cur = read();
  if (!cur.some((p) => !p.settled && !queued.has(recordId(p)))) return;
  write(cur.map((p) => (p.settled || queued.has(recordId(p)) ? p : { ...p, settled: true })));
}

/** Drops settled records; call when fresh server data has been rendered. */
export function pruneSettled() {
  const cur = read();
  if (!cur.some((p) => p.settled)) return;
  write(cur.filter((p) => !p.settled));
}

/** The write for `id` was stored in the offline queue instead of being sent. */
export function markQueued(id: string) {
  write(read().map((p) => (recordId(p) === id ? { ...p, queued: true } : p)));
}

/** True while the entry's write sits in the offline queue, waiting to reach the server. */
export function isUnsynced(records: PendingDiaryRecord[], id: string): boolean {
  return records.some((p) => recordId(p) === id && !p.settled && p.queued === true);
}
