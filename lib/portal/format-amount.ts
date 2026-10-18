import type { DiaryQuantityUnit } from "@/lib/supabase/types";
import { formatDecimal, formatQuantity } from "@/lib/format";

const UNIT_LABEL: Record<DiaryQuantityUnit, [string, string]> = {
  g: ["g", "g"],
  ml: ["ml", "ml"],
  serving: ["serving", "servings"],
  portion: ["portion", "portions"],
};

/** "150g", "1 serving", "1,5 servings", "2,5 portions" (plural follows the displayed number). */
export function formatEntryAmount(q: number, unit: DiaryQuantityUnit): string {
  const [one, many] = UNIT_LABEL[unit];
  if (unit === "g" || unit === "ml") return `${formatQuantity(q)}${one}`;
  const shown = formatDecimal(q, 2);
  return `${shown} ${shown === "1" ? one : many}`;
}
