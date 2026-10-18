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
    console.error("Failed to persist shopping check:", error);
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

export function useShoppingChecks(weekStart: string | null) {
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
      .from("shopping_check_state")
      .select("ingredient_id")
      .eq("week_start", weekStart)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load shopping checks:", error);
          toast.error("Couldn't load check-offs");
        }
        const next = new Set<string>(
          (data ?? []).map((r: { ingredient_id: string }) => r.ingredient_id)
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
    (ingredientId: string) => {
      if (!weekStart) return;
      const supabase = createClient();
      const wasChecked = checkedItems.has(ingredientId);
      const setOn = (on: boolean) =>
        setCheckedItems((prev) => {
          const next = new Set(prev);
          if (on) next.add(ingredientId);
          else next.delete(ingredientId);
          return next;
        });

      persistWithRetry(
        toast,
        () => weekRef.current === weekStart,
        () => setOn(!wasChecked),
        () =>
          wasChecked
            ? supabase
                .from("shopping_check_state")
                .delete()
                .eq("week_start", weekStart)
                .eq("ingredient_id", ingredientId)
            : supabase
                .from("shopping_check_state")
                .upsert(
                  { week_start: weekStart, ingredient_id: ingredientId },
                  { onConflict: "week_start,ingredient_id", ignoreDuplicates: true }
                ),
        () => setOn(wasChecked)
      );
    },
    [weekStart, checkedItems, toast]
  );

  /** Unmarks every item for the current week with a single DELETE. */
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
          .from("shopping_check_state")
          .delete()
          .eq("week_start", weekStart),
      () => setCheckedItems(snapshot)
    );
  }, [weekStart, checkedItems, toast]);

  return { checkedItems, toggle, clearAll, loading };
}
