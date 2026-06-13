"use client";

import { useMemo, useState } from "react";
import {
  Ingredient,
  MealEntryStatus,
  MealPlan,
  MealPlanEntry,
  MealReview,
  Recipe,
  RecipeIngredient,
} from "@/lib/supabase/types";
import MealCard, { MealCardData } from "@/components/portal/meal-card";
import MealDetailSheet from "@/components/portal/meal-detail-sheet";
import { entryNutrition, sortByMealType, addDaysLocal, compareLocalDate, parseLocalDate } from "@/lib/portal/entry-helpers";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function PlanDetailClient({
  plan,
  entries,
  statuses,
  reviews,
  isCurrent,
  initialDow,
  todayDate,
}: {
  plan: MealPlan;
  entries: FullEntry[];
  statuses: MealEntryStatus[];
  reviews: MealReview[];
  isCurrent: boolean;
  initialDow: number;
  todayDate: string;
}) {
  const [dow, setDow] = useState(initialDow);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  const dayEntries = useMemo(
    () => sortByMealType(entries.filter((e) => e.day_of_week === dow)),
    [entries, dow]
  );

  const cards: MealCardData[] = useMemo(() => {
    const byEntry = new Map(statuses.map((s) => [s.meal_plan_entry_id, s]));
    const reviewByEntry = new Map(reviews.map((r) => [r.meal_plan_entry_id, r]));
    return dayEntries.map((e) => {
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
  }, [dayEntries, statuses, reviews]);

  const open = openEntryId ? entries.find((e) => e.id === openEntryId) ?? null : null;
  const openReview = open ? reviews.find((r) => r.meal_plan_entry_id === open.id) ?? null : null;
  const openStatus = open ? statuses.find((s) => s.meal_plan_entry_id === open.id) ?? null : null;
  const openDate = open
    ? addDaysLocal(plan.week_start, open.day_of_week - 1)
    : null;
  const openIsFuture = openDate
    ? compareLocalDate(openDate, todayDate) > 0
    : false;

  const start = plan.week_start;
  const end = addDaysLocal(plan.week_start, 6);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">{plan.name}</h1>
          {isCurrent && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-medium">
              This week
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600">{formatRange(start, end)}</p>
      </header>

      <nav className="overflow-x-auto -mx-4 px-4">
        <div className="flex gap-2 min-w-max pb-1">
          {dayLabels.map((label, idx) => {
            const dayNum = idx + 1;
            const active = dow === dayNum;
            return (
              <button
                key={label}
                onClick={() => setDow(dayNum)}
                className={`px-4 min-h-[44px] rounded-full text-sm font-medium border ${
                  active
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {cards.length === 0 ? (
        <div className="bg-white rounded-2xl border p-6 text-center text-sm text-gray-500">
          No meals scheduled for {dayLabels[dow - 1]}.
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
          isFuture={openIsFuture}
          onClose={() => setOpenEntryId(null)}
        />
      )}
    </div>
  );
}

function formatRange(start: string, end: string) {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  if (!s || !e) return `${start} – ${end}`;
  const sFmt = s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const eFmt = e.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${sFmt} – ${eFmt}`;
}
