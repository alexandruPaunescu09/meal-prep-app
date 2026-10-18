"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MealEntryStatus, MealStatus } from "@/lib/supabase/types";
import { saveMealStatuses } from "@/lib/portal/save-status";
import { useToast } from "@/components/ui/toast";

export type MealStatusState = { status: MealStatus | null; factor: number | null };
export type MealStatusChange = { entryId: string; status: MealStatus | null; factor: number | null };

/**
 * Plan-meal status with an optimistic overlay over the server rows, so totals and cards update in
 * the same render as the tap. Saves are offline-aware (see saveMealStatuses) and serialised per
 * entry, so two quick changes to the same meal reach the server in tap order. Failed saves roll
 * back with a Retry toast; a successful online save refreshes the server data once per batch.
 *
 * An override is kept only while its save is in flight or queued offline: once the server data
 * arrives it is the truth.
 */
export function useMealStatus(statuses: MealEntryStatus[]) {
  const router = useRouter();
  const toast = useToast();
  const [overrides, setOverrides] = useState<Record<string, MealStatusState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [prevStatuses, setPrevStatuses] = useState(statuses);
  // Tail of each entry's save chain.
  const chains = useRef(new Map<string, Promise<unknown>>());

  if (prevStatuses !== statuses) {
    setPrevStatuses(statuses);
    setOverrides((cur) => {
      const next: Record<string, MealStatusState> = {};
      for (const [id, o] of Object.entries(cur)) if (saving.has(id) || queued.has(id)) next[id] = o;
      return next;
    });
  }

  // Offline writes reached the server: the refreshed rows are the truth again.
  useEffect(() => {
    const onFlushed = () => setQueued(new Set());
    window.addEventListener("portal:queue-flushed", onFlushed);
    return () => window.removeEventListener("portal:queue-flushed", onFlushed);
  }, []);

  const stateOf = useCallback(
    (entryId: string): MealStatusState => {
      const o = overrides[entryId];
      if (o) return o;
      const s = statuses.find((x) => x.meal_plan_entry_id === entryId);
      return {
        status: s?.status ?? null,
        factor: s?.status === "eaten" ? (s.portion_factor ?? null) : null,
      };
    },
    [overrides, statuses]
  );

  /** Resolves true when every change was saved or queued; false if any failed (rolled back). */
  async function applyChanges(changes: MealStatusChange[]): Promise<boolean> {
    if (changes.length === 0) return true;
    const previous = new Map(changes.map((c) => [c.entryId, stateOf(c.entryId)]));
    const ids = changes.map((c) => c.entryId);
    setOverrides((cur) => {
      const next = { ...cur };
      for (const c of changes) next[c.entryId] = { status: c.status, factor: c.factor };
      return next;
    });
    setSaving((cur) => new Set([...cur, ...ids]));

    // Wait for earlier saves of the same entries, then send this batch as one request.
    const earlier = ids.map((id) => chains.current.get(id)).filter(Boolean) as Promise<unknown>[];
    const run = Promise.allSettled(earlier).then(() =>
      saveMealStatuses(changes.map((c) => ({ entryId: c.entryId, status: c.status, portionFactor: c.factor })))
    );
    const tail = run.catch(() => undefined);
    for (const id of ids) chains.current.set(id, tail);

    let outcome: "saved" | "queued" | Error;
    try {
      outcome = await run;
    } catch (e) {
      outcome = e instanceof Error ? e : new Error("Could not save");
    }
    for (const id of ids) if (chains.current.get(id) === tail) chains.current.delete(id);
    setSaving((cur) => {
      const next = new Set(cur);
      for (const id of ids) next.delete(id);
      return next;
    });

    if (outcome instanceof Error) {
      setOverrides((cur) => {
        const next = { ...cur };
        for (const c of changes) next[c.entryId] = previous.get(c.entryId)!;
        return next;
      });
      toast.error(outcome.message || "Could not save", {
        action: { label: "Retry", onClick: () => void applyChanges(changes) },
      });
      return false;
    }
    if (outcome === "queued") {
      setQueued((cur) => new Set([...cur, ...ids]));
      toast.info("Saved offline — will sync when you're back online");
    } else {
      router.refresh();
    }
    return true;
  }

  return { stateOf, saving, applyChanges };
}
