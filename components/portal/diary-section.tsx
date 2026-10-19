import { Copy, Plus } from "lucide-react";
import type { MealType } from "@/lib/supabase/types";
import { formatNumber } from "@/lib/format";

export const MEAL_SECTION_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/**
 * One diary section (Breakfast / Lunch / Dinner / Snacks): header with the eaten kcal, the plan
 * meal cards and logged entries as children, and an "+ Add" button (hidden on future days).
 * FD-3 hooks the add-food sheet in through `onAdd`.
 */
export default function DiarySection({
  mealType,
  eatenKcal,
  canAdd,
  onAdd,
  onCopy,
  children,
}: {
  mealType: MealType;
  eatenKcal: number;
  canAdd: boolean;
  onAdd: (mealType: MealType) => void;
  /** "Copy from an earlier day" for this section; absent = no button. */
  onCopy?: (mealType: MealType) => void;
  children?: React.ReactNode;
}) {
  const label = MEAL_SECTION_LABEL[mealType];
  return (
    <section aria-label={label} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-900">
          {label}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {formatNumber(Math.round(eatenKcal), 0)} kcal
          </span>
        </h2>
        {canAdd && (
          <div className="flex items-center">
            {onCopy && (
              <button
                type="button"
                onClick={() => onCopy(mealType)}
                aria-label={`Copy ${label} from an earlier day`}
                className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 active:bg-gray-200"
              >
                <Copy className="w-4 h-4" />
                Copy
              </button>
            )}
            <button
              type="button"
              onClick={() => onAdd(mealType)}
              aria-label={`Add food to ${label}`}
              className="inline-flex items-center gap-1 min-h-[44px] px-3 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
