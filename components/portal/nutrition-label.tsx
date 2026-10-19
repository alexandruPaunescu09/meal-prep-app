import type { FoodLogEntry, NutritionTotals } from "@/lib/supabase/types";
import { entryLabel, micronutrientRows } from "@/lib/calculations/nutrition-details";
import { MACRO_NUTRIENTS } from "@/lib/nutrition/nutrients";
import { formatDecimal } from "@/lib/format";
import { NUTRITION_DISCLAIMER } from "@/lib/nutrition/disclaimer";

const n = (v: number) => formatDecimal(v, v >= 100 ? 0 : 1);

/**
 * A nutrition label for one logged entry: totals for the logged amount plus per 100 g/ml (g/ml
 * entries) or per serving / portion (serving and portion entries), whichever can be derived.
 */
export default function NutritionLabel({ entry }: { entry: FoodLogEntry }) {
  const label = entryLabel(entry);
  const second: { heading: string; values: NutritionTotals } | null = label.per100
    ? { heading: `Per 100 ${entry.quantity_unit}`, values: label.per100 }
    : label.perUnit
      ? { heading: `Per ${label.perUnit.label}`, values: label.perUnit.values }
      : null;
  const micros = micronutrientRows(label.total);

  return (
    <section aria-label="Nutrition label" className="rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-600">
          <tr>
            <th scope="col" className="text-left font-medium px-3 py-2">Nutrition</th>
            <th scope="col" className="text-right font-medium px-3 py-2">Logged amount</th>
            {second && <th scope="col" className="text-right font-medium px-3 py-2">{second.heading}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {MACRO_NUTRIENTS.map((def) => {
            const key = def.key as keyof NutritionTotals & string;
            return (
              <tr key={def.key}>
                <th scope="row" className="text-left font-normal text-gray-700 px-3 py-1.5">{def.label}</th>
                <td className="text-right text-gray-900 px-3 py-1.5">
                  {n(label.total[key] as number)} {def.unit}
                </td>
                {second && (
                  <td className="text-right text-gray-600 px-3 py-1.5">
                    {n(second.values[key] as number)} {def.unit}
                  </td>
                )}
              </tr>
            );
          })}
          {micros.map((m) => {
            const per = second?.values.micronutrients[m.key];
            return (
              <tr key={m.key}>
                <th scope="row" className="text-left font-normal text-gray-700 px-3 py-1.5">{m.label}</th>
                <td className="text-right text-gray-900 px-3 py-1.5">
                  {n(m.amount)} {m.unit}
                </td>
                {second && (
                  <td className="text-right text-gray-600 px-3 py-1.5">
                    {per != null ? `${n(per)} ${m.unit}` : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-500 px-3 py-2 border-t border-gray-100">{NUTRITION_DISCLAIMER}</p>
    </section>
  );
}
