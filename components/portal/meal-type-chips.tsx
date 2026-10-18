import type { MealType } from "@/lib/supabase/types";
import { MEAL_TYPES } from "@/lib/calculations/diary";
import { MEAL_SECTION_LABEL } from "@/components/portal/diary-section";

/** Segmented choice of the meal a food is logged to. */
export default function MealTypeChips({
  value,
  onChange,
}: {
  value: MealType;
  onChange: (m: MealType) => void;
}) {
  return (
    <div role="group" aria-label="Meal" className="grid grid-cols-4 gap-1.5">
      {MEAL_TYPES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          onClick={() => onChange(m)}
          className={`min-h-[40px] rounded-lg border text-xs font-medium ${
            value === m
              ? "bg-emerald-600 text-white border-emerald-600"
              : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
          }`}
        >
          {MEAL_SECTION_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
