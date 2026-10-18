"use client";

import { Star, Check, X as XIcon, Loader2 } from "lucide-react";
import { MealStatus } from "@/lib/supabase/types";
import { formatNumber } from "@/lib/format";
import { formatFactor } from "@/components/portal/portion-factor-sheet";

interface MealCardData {
  entryId: string;
  mealType: string;
  recipeName: string | null;
  ingredientName: string | null;
  portions: number;
  quantity: number | null;
  /** Planned nutrition of the whole entry (before any portion factor). */
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  status: MealStatus | null;
  /** Share of the planned portion eaten (null = 1). Only meaningful while eaten. */
  portionFactor: number | null;
  rating: number | null;
}

const mealTypeLabels: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

/**
 * Plan meal inside a diary section. Controlled: the diary owns the (optimistic) status so the
 * day summary updates in the same render. `onToggleEaten` / `onChangeAmount` are only wired when
 * the day can be logged.
 */
export default function MealCard({
  meal,
  onTap,
  saving = false,
  onToggleEaten,
  onChangeAmount,
}: {
  meal: MealCardData;
  onTap: () => void;
  saving?: boolean;
  /** One-tap "Eaten" toggle (omitted for future days). */
  onToggleEaten?: () => void;
  /** "Ate a different amount" (only offered while eaten). */
  onChangeAmount?: () => void;
}) {
  const status = meal.status;
  const eaten = status === "eaten";
  const factor = eaten ? (meal.portionFactor ?? 1) : 1;
  const kcal = meal.calories * factor;

  const title =
    meal.recipeName ??
    (meal.ingredientName ? `${meal.ingredientName}${meal.quantity ? ` (${meal.quantity}g)` : ""}` : "—");

  return (
    <div className="bg-white rounded-2xl border border-gray-200 hover:border-emerald-300 transition-colors">
      <button
        type="button"
        onClick={onTap}
        className="w-full text-left p-4 rounded-2xl active:bg-gray-50"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
              Plan · {mealTypeLabels[meal.mealType] ?? meal.mealType}
            </p>
            <h3 className="font-semibold text-gray-900 mt-0.5 line-clamp-2 break-words">{title}</h3>
          </div>
          <div className="flex flex-col items-end gap-1">
            {eaten && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                <Check className="w-3 h-3" />
                Eaten{meal.portionFactor != null && meal.portionFactor !== 1 ? ` ${formatFactor(meal.portionFactor)}` : ""}
              </span>
            )}
            {status === "skipped" && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
                <XIcon className="w-3 h-3" />
                Skipped
              </span>
            )}
            {meal.rating != null && (
              <span
                className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium"
                aria-label={`Rated ${meal.rating} out of 5`}
              >
                <Star className="w-3 h-3 fill-current" />
                {meal.rating}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600">
          <span className="font-medium text-gray-900">
            {formatNumber(Math.round(kcal), 0)} kcal
            {meal.portions !== 1 && (
              <span className="font-normal text-gray-500"> (×{meal.portions} portions)</span>
            )}
          </span>
          <span>Protein {formatNumber(Math.round(meal.protein * factor), 0)} g</span>
          <span>Carbs {formatNumber(Math.round(meal.carbs * factor), 0)} g</span>
          <span>Fat {formatNumber(Math.round(meal.fat * factor), 0)} g</span>
        </div>
      </button>

      {onToggleEaten && (
        <div className="px-4 pb-3 -mt-1 space-y-1">
          <button
            type="button"
            onClick={onToggleEaten}
            disabled={saving}
            aria-pressed={eaten}
            aria-label={`Mark ${mealTypeLabels[meal.mealType] ?? meal.mealType} (${meal.recipeName ?? meal.ingredientName ?? "meal"}) as eaten`}
            className={`w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border text-sm font-medium disabled:opacity-70 ${
              eaten
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {eaten ? "Eaten" : "Mark as eaten"}
          </button>
          {eaten && onChangeAmount && (
            <button
              type="button"
              onClick={onChangeAmount}
              disabled={saving}
              className="w-full min-h-[40px] text-sm font-medium text-emerald-700 hover:underline disabled:opacity-70"
            >
              Ate a different amount
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type { MealCardData };
