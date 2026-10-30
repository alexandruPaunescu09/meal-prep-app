"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { formatNumber, parseDecimal } from "@/lib/format";
import {
  clientDailyTarget,
  perMealTarget,
  scaleRecipe,
  type ScaleLineInput,
} from "@/lib/recipes/scale";
import type { Client, MealPlan } from "@/lib/supabase/types";

type ClientRow = Pick<Client, "id" | "name" | "calorie_target" | "weight_kg" | "target_weight_kg">;
type PlanRow = Pick<MealPlan, "client_id" | "week_start" | "calorie_target" | "protein_per_kg" | "fat_per_kg">;

interface ScaleRecipeModalProps {
  open: boolean;
  onClose: () => void;
  lines: ScaleLineInput[];
  portions: number;
  /** Called with the new quantity per line key. Nothing is saved here. */
  onApply: (quantities: Map<string, number>) => void;
}

const qtyText = (n: number) => formatNumber(n, n % 1 === 0 ? 0 : 1);
const kcalText = (n: number) => formatNumber(Math.round(n), 0);
const gramsText = (n: number) => formatNumber(Math.round(n * 10) / 10, 1);

const inputCls =
  "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-base md:text-sm";

export default function ScaleRecipeModal({ open, onClose, lines, portions, onApply }: ScaleRecipeModalProps) {
  const [mode, setMode] = useState<"kcal" | "client">("kcal");
  const [kcalStr, setKcalStr] = useState("");
  const [clientId, setClientId] = useState("");
  const [mealsStr, setMealsStr] = useState("3");
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open || clients) return;
    const supabase = createClient();
    let cancelled = false;
    Promise.all([
      supabase.from("clients").select("id, name, calorie_target, weight_kg, target_weight_kg").order("name"),
      supabase
        .from("meal_plans")
        .select("client_id, week_start, calorie_target, protein_per_kg, fat_per_kg")
        .not("calorie_target", "is", null)
        .not("client_id", "is", null),
    ]).then(([c, p]) => {
      if (cancelled) return;
      if (c.error || p.error) {
        setLoadError("Could not load clients. You can still type a calorie target.");
        setClients([]);
        return;
      }
      setClients((c.data as ClientRow[]) ?? []);
      setPlans((p.data as PlanRow[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [open, clients]);

  const client = clients?.find((c) => c.id === clientId) ?? null;
  const daily = client ? clientDailyTarget(client, plans.filter((p) => p.client_id === client.id)) : null;
  const meals = parseDecimal(mealsStr);
  const perMeal = mode === "client" ? perMealTarget(daily, meals ?? 0) : null;
  const typed = parseDecimal(kcalStr);
  const targetKcal = mode === "kcal" ? typed : perMeal;

  const result = targetKcal != null && targetKcal > 0 ? scaleRecipe({ lines, portions, targetKcal }) : null;
  const changes = result?.ok ? result.lines.filter((l) => l.after !== l.before).length : 0;

  function apply() {
    if (!result?.ok) return;
    onApply(new Map(result.lines.map((l) => [l.key, l.after])));
    onClose();
  }

  let hint = "";
  if (mode === "kcal" && kcalStr.trim() !== "" && (typed == null || typed <= 0)) hint = "Enter a calorie target greater than 0.";
  else if (mode === "client" && client && daily == null)
    hint = "This client has no calorie target. Set one on the client or on a meal plan, or type a number instead.";
  else if (mode === "client" && client && daily != null && perMeal == null) hint = "Meals per day must be 1 or more.";
  else if (result && !result.ok && result.reason === "no_nutrition")
    hint = "These ingredients have no calorie data, so there is nothing to scale to.";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scale to a target"
      description="Scales every quantity so one portion hits the target. Nothing is saved until you save the recipe."
      size="lg"
      footer={
        <div className="flex gap-2 justify-end w-full">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 border rounded-lg text-gray-700 hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={!result?.ok || changes === 0}
            className="py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="sr-only">Target source</legend>
          <div className="inline-flex rounded-lg border overflow-hidden text-sm" role="group" aria-label="Target source">
            {(
              [
                ["kcal", "Calories"],
                ["client", "Client"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 ${mode === m ? "bg-emerald-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {mode === "kcal" ? (
          <div>
            <label htmlFor="scale-kcal" className="block text-sm font-medium text-gray-700 mb-1">
              Calories per portion (kcal)
            </label>
            <input
              id="scale-kcal"
              inputMode="decimal"
              value={kcalStr}
              onChange={(e) => setKcalStr(e.target.value)}
              placeholder="e.g. 500"
              className={inputCls}
              autoComplete="off"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="scale-client" className="block text-sm font-medium text-gray-700 mb-1">
                Client
              </label>
              <select
                id="scale-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={inputCls}
                disabled={clients == null}
              >
                <option value="">{clients == null ? "Loading..." : "Pick a client"}</option>
                {clients?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="scale-meals" className="block text-sm font-medium text-gray-700 mb-1">
                Meals per day
              </label>
              <input
                id="scale-meals"
                inputMode="decimal"
                value={mealsStr}
                onChange={(e) => setMealsStr(e.target.value)}
                className={inputCls}
                autoComplete="off"
              />
            </div>
            {loadError && <p className="sm:col-span-3 text-xs text-red-600">{loadError}</p>}
            {client && daily != null && (
              <p className="sm:col-span-3 text-sm text-gray-600">
                Daily target {kcalText(daily)} kcal
                {perMeal != null && (
                  <>
                    {" "}
                    ÷ {formatNumber(meals ?? 0, 0)} = <strong className="text-gray-900">{kcalText(perMeal)} kcal per meal</strong>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {hint && (
          <p role="status" className="text-sm text-amber-700">
            {hint}
          </p>
        )}

        {result?.ok && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center" aria-label="Per portion before and after">
              {(
                [
                  ["Calories", kcalText(result.before.calories), kcalText(result.after.calories), "kcal"],
                  ["Protein", gramsText(result.before.protein), gramsText(result.after.protein), "g"],
                  ["Carbs", gramsText(result.before.carbs), gramsText(result.after.carbs), "g"],
                  ["Fat", gramsText(result.before.fat), gramsText(result.after.fat), "g"],
                ] as const
              ).map(([label, b, a, unit]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-xs text-gray-500">
                    {b} {unit}
                  </p>
                  <p className="text-sm font-bold text-gray-900">
                    {a} <span className="text-xs font-normal text-gray-500">{unit}</span>
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600">
              Per portion, before then after. Scaled by {formatNumber(result.factor, 2)}x; after rounding:{" "}
              {kcalText(result.after.calories)} kcal
              {Math.round(result.drift) !== 0 &&
                ` (${result.drift > 0 ? "+" : "-"}${formatNumber(Math.abs(Math.round(result.drift)), 0)} from the target)`}
              .
            </p>
            {result.noNutritionNames.length > 0 && (
              <p className="text-xs text-amber-700">
                No calorie data for {result.noNutritionNames.join(", ")}: scaled like the rest but not counted.
              </p>
            )}
            {(result.factor > 3 || result.factor < 0.33) && (
              <p className="text-xs text-amber-700">That is a big change from the original. Check the amounts.</p>
            )}

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <caption className="sr-only">Quantities before and after scaling</caption>
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th scope="col" className="text-left px-3 py-2 font-medium">
                      Ingredient
                    </th>
                    <th scope="col" className="text-right px-3 py-2 font-medium">
                      Now
                    </th>
                    <th scope="col" className="text-right px-3 py-2 font-medium">
                      Scaled
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.lines.map((l) => (
                    <tr key={l.key}>
                      <td className="px-3 py-2 text-gray-900 break-words">{l.ingredient.name}</td>
                      <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                        {qtyText(l.before)} {l.unit}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">
                        {qtyText(l.after)} {l.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
