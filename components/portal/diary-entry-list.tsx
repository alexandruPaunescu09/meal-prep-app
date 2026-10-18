import type { DiaryQuantityUnit, FoodLogEntry } from "@/lib/supabase/types";
import { formatNumber, formatQuantity } from "@/lib/format";

const UNIT_LABEL: Record<DiaryQuantityUnit, [string, string]> = {
  g: ["g", "g"],
  ml: ["ml", "ml"],
  serving: ["serving", "servings"],
  portion: ["portion", "portions"],
};

export function formatEntryAmount(q: number, unit: DiaryQuantityUnit): string {
  const [one, many] = UNIT_LABEL[unit];
  const label = q === 1 ? one : many;
  const compact = unit === "g" || unit === "ml";
  return `${formatQuantity(q)}${compact ? "" : " "}${label}`;
}

/** Logged (non-plan) foods of one meal. FD-3 makes rows editable through `onSelect`. */
export default function DiaryEntryList({
  entries,
  onSelect,
}: {
  entries: FoodLogEntry[];
  onSelect?: (entry: FoodLogEntry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <ul className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-200">
      {entries.map((e) => {
        const body = (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-medium text-gray-900 truncate">{e.name}</span>
              <span className="block text-xs text-gray-500 truncate">
                {[e.brand, e.source_kind === "quick" ? "Quick add" : formatEntryAmount(e.quantity, e.quantity_unit)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="text-sm font-medium text-gray-900 shrink-0">
              {formatNumber(Math.round(e.calories ?? 0), 0)} kcal
            </span>
          </>
        );
        return (
          <li key={e.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(e)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[48px] active:bg-gray-50"
              >
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 min-h-[48px]">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
