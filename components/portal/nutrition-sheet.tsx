"use client";

import type { MealType, NutritionTotals } from "@/lib/supabase/types";
import { Modal } from "@/components/ui/modal";
import {
  kcalSplit,
  limitRows,
  MEAL_ORDER,
  micronutrientRows,
  type Coverage,
  type ReferenceRow,
} from "@/lib/calculations/nutrition-details";
import { formatDecimal, formatNumber } from "@/lib/format";
import { MACRO_BG } from "@/lib/portal/macro-colors";
import { NUTRITION_DISCLAIMER } from "@/lib/nutrition/disclaimer";


const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

const n0 = (v: number) => formatNumber(Math.round(v), 0);
const amt = (v: number) => formatDecimal(v, v >= 100 ? 0 : 1);
const pct = (v: number) => `${formatNumber(Math.round(v), 0)}%`;

function ReferenceBar({ row, limit }: { row: ReferenceRow; limit: boolean }) {
  const p = row.percent;
  const over = limit && p != null && p > 100;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-gray-800">{row.label}</span>
        <span className="text-gray-600 whitespace-nowrap">
          <span className="font-semibold text-gray-900">
            {amt(row.amount)} {row.unit}
          </span>
          {p != null ? ` · ${pct(p)} ${limit ? "of RI" : "of NRV"}` : " · no EU reference"}
        </span>
      </div>
      {p != null && (
        <div
          className="h-2 mt-1 rounded-full bg-gray-100 overflow-hidden"
          role="progressbar"
          aria-label={`${row.label}, ${pct(p)} of the EU ${limit ? "reference intake" : "nutrient reference value"}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(p))}
        >
          <div
            className={`h-full rounded-full ${over ? "bg-amber-500" : limit ? "bg-gray-500" : "bg-emerald-500"}`}
            style={{ width: `${Math.min(100, p)}%` }}
          />
        </div>
      )}
    </li>
  );
}

/**
 * Full day breakdown: macro split of kcal, sugar / sat fat / salt against EU reference intakes,
 * micronutrients as % NRV, per-meal totals and a data-coverage note. `planned` switches the wording
 * to a projection (future days).
 */
export default function NutritionSheet({
  totals,
  byMeal,
  coverage,
  planned,
  dateLabel,
  onClose,
}: {
  totals: NutritionTotals;
  byMeal: Record<MealType, NutritionTotals>;
  coverage: Coverage;
  planned: boolean;
  dateLabel: string;
  onClose: () => void;
}) {
  const split = kcalSplit(totals);
  const micros = micronutrientRows(totals);
  const limits = limitRows(totals);
  const empty = coverage.total === 0 && totals.calories <= 0;
  const mealRows = MEAL_ORDER.filter((m) => byMeal[m].calories > 0 || byMeal[m].protein > 0);

  return (
    <Modal
      open
      onClose={onClose}
      variant="sheet"
      title={planned ? "Planned nutrition" : "Nutrition"}
      description={planned ? `${dateLabel} · planned, not eaten yet` : dateLabel}
    >
      {empty ? (
        <p className="text-sm text-gray-600 py-6 text-center">
          {planned
            ? "Nothing is planned for this day yet."
            : "Nothing eaten yet. Mark meals as eaten or log a food and the breakdown will appear here."}
        </p>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="nut-energy">
            <h3 id="nut-energy" className="text-sm font-semibold text-gray-900">
              {planned ? "Planned energy" : "Energy"}: {n0(totals.calories)} kcal
            </h3>
            {split ? (
              <>
                <div
                  className="flex h-3 mt-2 rounded-full overflow-hidden"
                  role="img"
                  aria-label={`Share of calories: protein ${pct(split.protein)}, carbs ${pct(split.carbs)}, fat ${pct(split.fat)}`}
                >
                  <div className={MACRO_BG.protein} style={{ width: `${split.protein}%` }} />
                  <div className={MACRO_BG.carbs} style={{ width: `${split.carbs}%` }} />
                  <div className={MACRO_BG.fat} style={{ width: `${split.fat}%` }} />
                </div>
                <ul className="grid grid-cols-3 gap-2 mt-2 text-xs text-gray-700">
                  {(
                    [
                      ["Protein", split.protein, totals.protein, MACRO_BG.protein],
                      ["Carbs", split.carbs, totals.carbs, MACRO_BG.carbs],
                      ["Fat", split.fat, totals.fat, MACRO_BG.fat],
                    ] as const
                  ).map(([label, share, grams, bg]) => (
                    <li key={label}>
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${bg}`} />
                      {label}
                      <span className="block font-semibold text-gray-900">
                        {pct(share)} · {n0(grams)} g
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-600 mt-2">Fiber {amt(totals.fiber)} g</p>
              </>
            ) : null}
          </section>

          <section aria-labelledby="nut-limits">
            <h3 id="nut-limits" className="text-sm font-semibold text-gray-900 mb-2">
              Sugars, saturated fat and salt
            </h3>
            <ul className="space-y-3">
              {limits.map((r) => (
                <ReferenceBar key={r.key} row={r} limit />
              ))}
            </ul>
            <p className="text-[11px] text-gray-500 mt-2">RI = EU reference intake for an adult (2000 kcal).</p>
          </section>

          <section aria-labelledby="nut-micros">
            <h3 id="nut-micros" className="text-sm font-semibold text-gray-900 mb-2">
              Vitamins and minerals
            </h3>
            {micros.length > 0 ? (
              <ul className="space-y-3">
                {micros.map((r) => (
                  <ReferenceBar key={r.key} row={r} limit={false} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">No vitamin or mineral data for these foods.</p>
            )}
            <p className="text-xs text-gray-600 mt-3" data-testid="micro-coverage">
              Micronutrient data for {coverage.covered} of {coverage.total} item
              {coverage.total === 1 ? "" : "s"}
              {coverage.covered < coverage.total ? ", so these may be underestimates" : ""}.
            </p>
          </section>

          {mealRows.length > 0 && (
            <section aria-labelledby="nut-meals">
              <h3 id="nut-meals" className="text-sm font-semibold text-gray-900 mb-2">
                By meal
              </h3>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {mealRows.map((m) => {
                  const t = byMeal[m];
                  return (
                    <li key={m} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="text-gray-800">{MEAL_LABEL[m]}</span>
                      <span className="text-right text-gray-600">
                        <span className="font-semibold text-gray-900">{n0(t.calories)} kcal</span>
                        <span className="block text-xs">
                          P {n0(t.protein)} · C {n0(t.carbs)} · F {n0(t.fat)} g
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <p className="text-[11px] text-gray-500">{NUTRITION_DISCLAIMER}</p>
        </div>
      )}
    </Modal>
  );
}
