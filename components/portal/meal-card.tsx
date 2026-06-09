"use client";

import { Star, Check, X as XIcon } from "lucide-react";
import { MealStatus } from "@/lib/supabase/types";

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
}: {
  meal: MealCardData;
  onTap: () => void;
}) {
  const title =
    meal.recipeName ??
    (meal.ingredientName ? `${meal.ingredientName}${meal.quantity ? ` (${meal.quantity}g)` : ""}` : "—");

  return (
    <button
      onClick={onTap}
      className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 hover:border-emerald-300 active:bg-gray-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            {mealTypeLabels[meal.mealType] ?? meal.mealType}
          </p>
          <h3 className="font-semibold text-gray-900 mt-0.5 truncate">{title}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          {meal.status === "eaten" && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              <Check className="w-3 h-3" />
              Eaten
            </span>
          )}
          {meal.status === "skipped" && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
              <XIcon className="w-3 h-3" />
              Skipped
            </span>
          )}
          {meal.rating != null && (
            <span className="inline-flex items-center gap-0.5 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
              <Star className="w-3 h-3 fill-current" />
              {meal.rating}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600">
        <span className="font-medium text-gray-900">
          {Math.round(meal.calories)} kcal
        </span>
        <span>P {Math.round(meal.protein)}g</span>
        <span>C {Math.round(meal.carbs)}g</span>
        <span>F {Math.round(meal.fat)}g</span>
        {meal.portions !== 1 && (
          <span className="ml-auto text-gray-500">×{meal.portions}</span>
        )}
      </div>
    </button>
  );
}

export type { MealCardData };
