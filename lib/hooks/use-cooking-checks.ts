"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export function useCookingChecks(weekStart: string | null) {
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
      .from("cooking_check_state")
      .select("recipe_id")
      .eq("week_start", weekStart)
      .then(({ data }) => {
        if (cancelled) return;
        const next = new Set<string>(
          (data ?? []).map((r: { recipe_id: string }) => r.recipe_id)
        );
        setCheckedItems(next);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  const toggle = useCallback(
    (recipeId: string) => {
      if (!weekStart) return;
      const supabase = createClient();
      const wasChecked = checkedItems.has(recipeId);

      setCheckedItems((prev) => {
        const next = new Set(prev);
        if (wasChecked) next.delete(recipeId);
        else next.add(recipeId);
        return next;
      });

      const op = wasChecked
        ? supabase
            .from("cooking_check_state")
            .delete()
            .eq("week_start", weekStart)
            .eq("recipe_id", recipeId)
        : supabase
            .from("cooking_check_state")
            .insert({ week_start: weekStart, recipe_id: recipeId });

      op.then(({ error }) => {
        if (!error) return;
        console.error("Failed to persist cooking check:", error);
        setCheckedItems((prev) => {
          const next = new Set(prev);
          if (wasChecked) next.add(recipeId);
          else next.delete(recipeId);
          return next;
        });
      });
    },
    [weekStart, checkedItems]
  );

  return { checkedItems, toggle, loading };
}
