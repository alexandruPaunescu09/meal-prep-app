"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export function useShoppingChecks(weekStart: string | null) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!weekStart) {
      setCheckedItems(new Set());
      return;
    }
    const supabase = createClient();
    let cancelled = false;
    setLoading(true);
    supabase
      .from("shopping_check_state")
      .select("ingredient_id")
      .eq("week_start", weekStart)
      .then(({ data }) => {
        if (cancelled) return;
        const next = new Set<string>(
          (data ?? []).map((r: { ingredient_id: string }) => r.ingredient_id)
        );
        setCheckedItems(next);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const toggle = useCallback(
    (ingredientId: string) => {
      if (!weekStart) return;
      const supabase = createClient();
      const wasChecked = checkedItems.has(ingredientId);

      setCheckedItems((prev) => {
        const next = new Set(prev);
        if (wasChecked) next.delete(ingredientId);
        else next.add(ingredientId);
        return next;
      });

      const op = wasChecked
        ? supabase
            .from("shopping_check_state")
            .delete()
            .eq("week_start", weekStart)
            .eq("ingredient_id", ingredientId)
        : supabase
            .from("shopping_check_state")
            .insert({ week_start: weekStart, ingredient_id: ingredientId });

      op.then(({ error }) => {
        if (!error) return;
        console.error("Failed to persist shopping check:", error);
        setCheckedItems((prev) => {
          const next = new Set(prev);
          if (wasChecked) next.add(ingredientId);
          else next.delete(ingredientId);
          return next;
        });
      });
    },
    [weekStart, checkedItems]
  );

  return { checkedItems, toggle, loading };
}
