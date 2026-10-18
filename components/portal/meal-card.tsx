"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Check, X as XIcon, Loader2 } from "lucide-react";
import { MealStatus } from "@/lib/supabase/types";
import { saveMealStatus } from "@/lib/portal/save-status";
import { useToast } from "@/components/ui/toast";

interface MealCardData {
  entryId: string;
  mealType: string;
  recipeName: string | null;
  ingredientName: string | null;
  portions: number;
  quantity: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  status: MealStatus | null;
  rating: number | null;
}

const mealTypeLabels: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export default function MealCard({
  meal,
  onTap,
  canLog = false,
}: {
  meal: MealCardData;
  onTap: () => void;
  /** Show a one-tap "Eaten" toggle (false for future days). */
  canLog?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<MealStatus | null>(meal.status);
  const [propStatus, setPropStatus] = useState<MealStatus | null>(meal.status);
  const [saving, setSaving] = useState(false);

  // Re-sync when the server value changes (after router.refresh()).
  if (meal.status !== propStatus) {
    setPropStatus(meal.status);
    setStatus(meal.status);
  }

  const title =
    meal.recipeName ??
    (meal.ingredientName ? `${meal.ingredientName}${meal.quantity ? ` (${meal.quantity}g)` : ""}` : "—");

  async function toggleEaten() {
    if (saving) return;
    const previous = status;
    const next: MealStatus | null = status === "eaten" ? null : "eaten";
    setStatus(next);
    setSaving(true);
    try {
      const result = await saveMealStatus(meal.entryId, next);
      if (result === "queued") {
        toast.info("Saved offline — will sync when you're back online");
      } else {
        router.refresh();
      }
    } catch (e) {
      setStatus(previous);
      toast.error(e instanceof Error && e.message ? e.message : "Could not save", {
        action: { label: "Retry", onClick: () => void toggleEaten() },
      });
    } finally {
      setSaving(false);
    }
  }

  const eaten = status === "eaten";

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
              {mealTypeLabels[meal.mealType] ?? meal.mealType}
            </p>
            <h3 className="font-semibold text-gray-900 mt-0.5 line-clamp-2 break-words">{title}</h3>
          </div>
          <div className="flex flex-col items-end gap-1">
            {status === "eaten" && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                <Check className="w-3 h-3" />
                Eaten
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
            {Math.round(meal.calories)} kcal
            {meal.portions !== 1 && (
              <span className="font-normal text-gray-500"> (×{meal.portions} portions)</span>
            )}
          </span>
          <span>Protein {Math.round(meal.protein)} g</span>
          <span>Carbs {Math.round(meal.carbs)} g</span>
          <span>Fat {Math.round(meal.fat)} g</span>
        </div>
      </button>

      {canLog && (
        <div className="px-4 pb-3 -mt-1">
          <button
            type="button"
            onClick={toggleEaten}
            disabled={saving}
            aria-pressed={eaten}
            aria-label={`Mark ${mealTypeLabels[meal.mealType] ?? meal.mealType} (${meal.recipeName ?? meal.ingredientName ?? "meal"}) as eaten`}
            className={`w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border text-sm font-medium disabled:opacity-70 ${
              eaten
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            }`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {eaten ? "Eaten" : "Mark as eaten"}
          </button>
        </div>
      )}
    </div>
  );
}

export type { MealCardData };
