"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast, type ToastApi } from "@/components/ui/toast";

/**
 * Applies `apply` optimistically, runs `write`, and on error rolls back via
 * `rollback` (only if the week is still the one shown) and shows a toast whose
 * Retry re-applies and re-writes.
 */
function persistWithRetry(
  toast: ToastApi,
  isCurrentWeek: () => boolean,
  apply: () => void,
  write: () => PromiseLike<{ error: unknown }>,
  rollback: () => void
): void {
  apply();
  write().then(({ error }) => {
    if (!error) return;
    console.error("Failed to persist cooking check:", error);
    if (isCurrentWeek()) rollback();
    toast.error("Couldn't save check-off", {
      action: {
        label: "Retry",
        onClick: () => {
          if (!isCurrentWeek()) return;
          persistWithRetry(toast, isCurrentWeek, apply, write, rollback);
        },
      },
    });
  });
}

export function useCookingChecks(weekStart: string | null) {
  const toast = useToast();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  // Week the loaded checks belong to; `loading` is derived from it.
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const [prevWeekStart, setPrevWeekStart] = useState(weekStart);
  // Latest week, so late write results never roll back a different week's state.
  const weekRef = useRef(weekStart);
  const loading = !!weekStart && loadedWeek !== weekStart;

  // Reset during render when the week changes (no setState inside an effect).
  if (prevWeekStart !== weekStart) {
    setPrevWeekStart(weekStart);
    setCheckedItems(new Set());
  }

  useEffect(() => {
    weekRef.current = weekStart;
  }, [weekStart]);

  useEffect(() => {
    if (!weekStart) return;
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("cooking_check_state")
      .select("recipe_id")
      .eq("week_start", weekStart)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load cooking checks:", error);
          toast.error("Couldn't load check-offs");
        }
        const next = new Set<string>(
          (data ?? []).map((r: { recipe_id: string }) => r.recipe_id)
        );
        setCheckedItems(error ? new Set() : next);
        setLoadedWeek(weekStart);
      });
    return () => {
      cancelled = true;
    };
    // toast is a stable memoized API from ToastProvider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const toggle = useCallback(
    (recipeId: string) => {
      if (!weekStart) return;
      const supabase = createClient();
      const wasChecked = checkedItems.has(recipeId);
      const setOn = (on: boolean) =>
        setCheckedItems((prev) => {
          const next = new Set(prev);
          if (on) next.add(recipeId);
          else next.delete(recipeId);
          return next;
        });

      persistWithRetry(
        toast,
        () => weekRef.current === weekStart,
        () => setOn(!wasChecked),
        () =>
          wasChecked
            ? supabase
                .from("cooking_check_state")
                .delete()
                .eq("week_start", weekStart)
                .eq("recipe_id", recipeId)
            : supabase
                .from("cooking_check_state")
                .upsert(
                  { week_start: weekStart, recipe_id: recipeId },
                  { onConflict: "week_start,recipe_id", ignoreDuplicates: true }
                ),
        () => setOn(wasChecked)
      );
    },
    [weekStart, checkedItems, toast]
  );

  /** Unmarks every recipe for the current week with a single DELETE. */
  const clearAll = useCallback(() => {
    if (!weekStart) return;
    const supabase = createClient();
    const snapshot = checkedItems;
    persistWithRetry(
      toast,
      () => weekRef.current === weekStart,
      () => setCheckedItems(new Set()),
      () =>
        supabase
          .from("cooking_check_state")
          .delete()
          .eq("week_start", weekStart),
      () => setCheckedItems(snapshot)
    );
  }, [weekStart, checkedItems, toast]);

  return { checkedItems, toggle, clearAll, loading };
}
