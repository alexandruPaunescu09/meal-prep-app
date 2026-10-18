import type { NutritionTotals } from "@/lib/supabase/types";
import type { ResolvedTargets } from "@/lib/calculations/meal-plan";
import { formatNumber } from "@/lib/format";
import { MACRO_BG } from "@/lib/portal/macro-colors";

const n0 = (v: number) => formatNumber(Math.round(v), 0);

function MacroBar({
  label,
  value,
  target,
  planned,
  color,
  noBudget = false,
}: {
  label: string;
  value: number;
  target: number | null;
  planned: number;
  color: string;
  /** Protein + fat already use up the calories, so there is no carb target to show. */
  noBudget?: boolean;
}) {
  if (noBudget) target = null;
  const base = target && target > 0 ? target : Math.max(planned, value, 1);
  const pct = Math.min(100, (value / base) * 100);
  const plannedPct = Math.min(100, (planned / base) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs gap-1">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-600 whitespace-nowrap">
          <span className="font-semibold text-gray-900">{n0(value)}</span>
          {target != null ? `/${n0(target)}` : ""} g
          {noBudget && <span className="block text-[10px] text-gray-500 text-right">no carb budget</span>}
        </span>
      </div>
      <div
        className="relative h-1.5 mt-1 rounded-full bg-gray-100 overflow-hidden"
        role="progressbar"
        aria-label={`${label} eaten`}
        aria-valuemin={0}
        aria-valuemax={Math.round(base)}
        aria-valuenow={Math.round(value)}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-gray-300/70" style={{ width: `${plannedPct}%` }} />
        <div className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Day header: kcal eaten / target / remaining, a "Planned" ghost for the projection (what the day
 * totals if every unmarked plan meal gets eaten) and P/C/F + fiber against the resolved targets.
 */
export default function DiarySummary({
  eaten,
  projected,
  targets,
  hasPendingPlan,
  isFuture,
}: {
  eaten: NutritionTotals;
  projected: NutritionTotals;
  targets: ResolvedTargets;
  hasPendingPlan: boolean;
  isFuture: boolean;
}) {
  const target = targets.calories;
  const base = target && target > 0 ? target : Math.max(projected.calories, eaten.calories, 1);
  const eatenPct = Math.min(100, (eaten.calories / base) * 100);
  const plannedPct = Math.min(100, (projected.calories / base) * 100);
  const remaining = target != null ? target - eaten.calories : null;
  const over = remaining != null && remaining < 0;
  const showPlanned = hasPendingPlan && projected.calories > eaten.calories + 0.5;
  const fiber = targets.fiber;

  return (
    <section aria-label="Day summary" className="bg-white rounded-2xl border border-gray-200 p-4 space-y-4">
      <div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-3xl font-bold text-gray-900 leading-none">
            {n0(eaten.calories)}
            <span className="text-sm font-medium text-gray-500 ml-1">
              {target != null ? `/ ${n0(target)} kcal` : "kcal eaten"}
            </span>
          </p>
          {remaining != null && (
            <p className={`text-sm font-semibold ${over ? "text-amber-700" : "text-emerald-700"}`}>
              {n0(Math.abs(remaining))} kcal {over ? "over" : "left"}
            </p>
          )}
        </div>
        <div
          className="relative h-2.5 mt-3 rounded-full bg-gray-100 overflow-hidden"
          role="progressbar"
          aria-label="Calories eaten so far"
          aria-valuemin={0}
          aria-valuemax={Math.round(base)}
          aria-valuenow={Math.round(eaten.calories)}
        >
          {showPlanned && (
            <div
              data-testid="planned-ghost"
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-200"
              style={{ width: `${plannedPct}%` }}
            />
          )}
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ${
              over ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${eatenPct}%` }}
          />
        </div>
        {showPlanned && (
          <p className="text-xs text-gray-600 mt-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-200 mr-1.5 align-middle" />
            Planned: <span className="font-medium text-gray-900">{n0(projected.calories)} kcal</span>
            {isFuture ? " for this day" : " if you eat the rest of your plan"}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MacroBar label="Protein" value={eaten.protein} target={targets.protein} planned={projected.protein} color={MACRO_BG.protein} />
        <MacroBar label="Carbs" value={eaten.carbs} target={targets.carbs} planned={projected.carbs} color={MACRO_BG.carbs} noBudget={targets.carbsOverAllocated} />
        <MacroBar label="Fat" value={eaten.fat} target={targets.fat} planned={projected.fat} color={MACRO_BG.fat} />
      </div>

      <p className="text-xs text-gray-600">
        Fiber <span className="font-semibold text-gray-900">{n0(eaten.fiber)} g</span>
        {fiber && (
          <>
            {" "}
            · aim {n0(fiber.min)}–{n0(fiber.max)} g
            {eaten.fiber >= fiber.min && eaten.fiber <= fiber.max && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                in range
              </span>
            )}
          </>
        )}
      </p>
    </section>
  );
}
