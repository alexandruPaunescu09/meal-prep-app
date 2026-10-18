"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { MealEntryStatus, MealStatus } from "@/lib/supabase/types";
import { saveMealStatus } from "@/lib/portal/save-status";
import { useToast } from "@/components/ui/toast";

export type MealStatusState = { status: MealStatus | null; factor: number | null };
export type MealStatusChange = { entryId: string; status: MealStatus | null; factor: number | null };

/**
 * Plan-meal status with an optimistic overlay over the server rows, so totals and cards update in
 * the same render as the tap. Saves are offline-aware (see saveMealStatus); failed ones roll back
 * with a Retry toast, and a successful online save refreshes the server data once per batch.
 */
export function useMealStatus(statuses: MealEntryStatus[]) {
  const router = useRouter();
  const toast = useToast();
  const [overrides, setOverrides] = useState<Record<string, MealStatusState>>({});
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [prevStatuses, setPrevStatuses] = useState(statuses);

  if (prevStatuses !== statuses) {
    setPrevStatuses(statuses);
    // Drop overrides the server now agrees with; ones still differing are in-flight or queued.
    setOverrides((cur) => {
      const byId = new Map(statuses.map((s) => [s.meal_plan_entry_id, s]));
      const next: Record<string, MealStatusState> = {};
      for (const [id, o] of Object.entries(cur)) {
        const s = byId.get(id);
        const serverStatus = s?.status ?? null;
        const serverFactor = s?.status === "eaten" ? (s.portion_factor ?? null) : null;
        if (serverStatus !== o.status || serverFactor !== o.factor) next[id] = o;
      }
      return next;
    });
  }

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
    setOverrides((cur) => {
      const next = { ...cur };
      for (const c of changes) next[c.entryId] = { status: c.status, factor: c.factor };
      return next;
    });
    setSaving((cur) => new Set([...cur, ...changes.map((c) => c.entryId)]));

    const results = await Promise.allSettled(
      changes.map((c) => saveMealStatus(c.entryId, c.status, c.factor))
    );

    const failed: MealStatusChange[] = [];
    let anySaved = false;
    let anyQueued = false;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        if (r.value === "queued") anyQueued = true;
        else anySaved = true;
      } else {
        failed.push(changes[i]);
      }
    });
    setSaving((cur) => {
      const next = new Set(cur);
      for (const c of changes) next.delete(c.entryId);
      return next;
    });
    if (failed.length > 0) {
      setOverrides((cur) => {
        const next = { ...cur };
        for (const c of failed) next[c.entryId] = previous.get(c.entryId)!;
        return next;
      });
      const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      toast.error(
        firstError?.reason instanceof Error && firstError.reason.message
          ? firstError.reason.message
          : "Could not save",
        { action: { label: "Retry", onClick: () => void applyChanges(failed) } }
      );
    }
    if (anyQueued) toast.info("Saved offline — will sync when you're back online");
    if (anySaved) router.refresh();
    return failed.length === 0;
  }

  return { stateOf, saving, applyChanges };
}
