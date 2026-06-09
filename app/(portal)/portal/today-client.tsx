"use client";

import { useMemo, useState } from "react";
import {
  Ingredient,
  MealEntryStatus,
  MealPlanEntry,
  MealReview,
  Recipe,
  RecipeIngredient,
} from "@/lib/supabase/types";
import MealCard, { MealCardData } from "@/components/portal/meal-card";
import MealDetailSheet from "@/components/portal/meal-detail-sheet";
import { entryNutrition, sortByMealType } from "@/lib/portal/entry-helpers";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

export default function TodayClient({
  planId,
  planName,
  todayStr,
  entries,
  statuses,
  reviews,
}: {
  planId: string;
  planName: string;
  sellingPriceMarkup: number;
  todayStr: string;
  entries: FullEntry[];
  statuses: MealEntryStatus[];
  reviews: MealReview[];
}) {
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  const sorted = useMemo(() => sortByMealType(entries), [entries]);

  const cards: MealCardData[] = useMemo(() => {
    const byEntry = new Map(statuses.map((s) => [s.meal_plan_entry_id, s]));
    const reviewByEntry = new Map(reviews.map((r) => [r.meal_plan_entry_id, r]));
    return sorted.map((e) => {
      const n = entryNutrition(e);
      return {
        entryId: e.id,
        mealType: e.meal_type,
        recipeName: e.recipe?.name ?? null,
        ingredientName: e.ingredient?.name ?? null,
        portions: e.portions,
        quantity: e.quantity,
        calories: n.calories,
        protein: n.protein,
        carbs: n.carbs,
        fat: n.fat,
        status: byEntry.get(e.id)?.status ?? null,
        rating: reviewByEntry.get(e.id)?.rating ?? null,
      };
    });
  }, [sorted, statuses, reviews]);

  const totalKcal = cards.reduce((s, c) => s + c.calories, 0);

  const today = new Date(todayStr);
  const dateLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const open = openEntryId
    ? sorted.find((e) => e.id === openEntryId) ?? null
    : null;
  const openReview = open ? reviews.find((r) => r.meal_plan_entry_id === open.id) ?? null : null;
  const openStatus = open ? statuses.find((s) => s.meal_plan_entry_id === open.id) ?? null : null;

  return (
    <div className="space-y-4">
      <section>
        <p className="text-xs uppercase tracking-wide text-emerald-600 font-medium">
          Today
        </p>
        <h1 className="text-2xl font-bold text-gray-900">{dateLabel}</h1>
        <p className="text-sm text-gray-600 mt-1">
          <span className="font-medium text-gray-900">{Math.round(totalKcal)} kcal</span>
          {" · "}
          <span className="text-gray-500">{planName}</span>
        </p>
      </section>

      {cards.length === 0 ? (
        <div className="bg-white rounded-2xl border p-6 text-center text-gray-500 text-sm">
          No meals scheduled for today.
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <MealCard key={c.entryId} meal={c} onTap={() => setOpenEntryId(c.entryId)} />
          ))}
        </div>
      )}

      {open && (
        <MealDetailSheet
          entry={open}
          existingReview={openReview}
          existingStatus={openStatus?.status ?? null}
          onClose={() => setOpenEntryId(null)}
        />
      )}
    </div>
  );
}
