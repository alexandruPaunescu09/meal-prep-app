"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MealPlanEntry,
  Recipe,
  RecipeIngredient,
  Ingredient,
} from "@/lib/supabase/types";
import {
  generateCookingPlan,
  CookingPlanRecipe,
} from "@/lib/calculations/cooking-plan";
import { useCookingChecks } from "@/lib/hooks/use-cooking-checks";
import { X, Loader2, ChevronDown, ChevronRight } from "lucide-react";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
  meal_plan?: {
    name: string;
    client?: { name: string } | null;
  };
};

type PlanInWeek = {
  id: string;
  name: string;
  client: { name: string } | null;
};

export default function WeeklyCookingModal({
  weeks,
  onClose,
}: {
  weeks: string[];
  onClose: () => void;
}) {
  const supabase = createClient();
  const [selectedWeek, setSelectedWeek] = useState<string>(weeks[0] ?? "");
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanInWeek[]>([]);
  const [entries, setEntries] = useState<FullEntry[]>([]);
  const { checkedItems, toggle: toggleRecipe } = useCookingChecks(
    selectedWeek || null
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedWeek) return;
    let cancelled = false;
    async function loadWeek() {
      setLoading(true);

      const { data: plansData } = await supabase
        .from("meal_plans")
        .select("id, name, client:clients(name)")
        .eq("week_start", selectedWeek);

      const planList = (plansData as any[] | null) ?? [];
      const planIds = planList.map((p) => p.id);

      if (planIds.length === 0) {
        if (!cancelled) {
          setPlans([]);
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      const { data: entriesData } = await supabase
        .from("meal_plan_entries")
        .select(`
          *,
          recipe:recipes (
            *,
            recipe_ingredients (
              *,
              ingredient:ingredients (*)
            )
          ),
          ingredient:ingredients (*),
          meal_plan:meal_plans (
            name,
            client:clients (name)
          )
        `)
        .in("meal_plan_id", planIds);

      if (!cancelled) {
        setPlans(planList as PlanInWeek[]);
        setEntries((entriesData as FullEntry[]) ?? []);
        setExpanded(new Set());
        setLoading(false);
      }
    }
    loadWeek();
    return () => {
      cancelled = true;
    };
  }, [selectedWeek, supabase]);

  const { recipes, directIngredients } = useMemo(
    () => generateCookingPlan(entries),
    [entries]
  );

  function toggleExpanded(recipeId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Weekly Cooking Plan
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-3 border-b bg-gray-50 space-y-2">
          <label className="block text-xs font-medium text-gray-700">Week</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                Week of {formatWeekLabel(w)}
              </option>
            ))}
          </select>
          {plans.length > 0 && (
            <p className="text-xs text-gray-500">
              Plans included ({plans.length}):{" "}
              {plans.map((p) => p.client?.name ?? p.name).join(", ")}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : recipes.length === 0 && directIngredients.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No entries in this week&apos;s meal plans yet.
            </p>
          ) : (
            <div className="space-y-6">
              {recipes.length > 0 && (
                <div className="space-y-2">
                  {recipes.map((r) => (
                    <RecipeRow
                      key={r.recipeId}
                      recipe={r}
                      checked={checkedItems.has(r.recipeId)}
                      expanded={expanded.has(r.recipeId)}
                      onToggleCheck={() => toggleRecipe(r.recipeId)}
                      onToggleExpand={() => toggleExpanded(r.recipeId)}
                    />
                  ))}
                </div>
              )}

              {directIngredients.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Raw / direct ingredients
                  </h3>
                  <div className="space-y-1">
                    {directIngredients.map((d) => (
                      <div
                        key={d.ingredientId}
                        className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg"
                      >
                        <span className="text-sm font-medium text-gray-900">
                          {d.name}
                        </span>
                        <span className="text-sm text-gray-600">
                          {formatQty(d.totalQuantity)}
                          {d.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecipeRow({
  recipe,
  checked,
  expanded,
  onToggleCheck,
  onToggleExpand,
}: {
  recipe: CookingPlanRecipe;
  checked: boolean;
  expanded: boolean;
  onToggleCheck: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div
      className={`bg-gray-50 rounded-lg ${checked ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleCheck}
          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
        />
        <button
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          )}
          <span
            className={`text-sm font-medium text-gray-900 flex-1 ${checked ? "line-through" : ""}`}
          >
            {recipe.name}
          </span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-600">
              {formatQty(recipe.totalPortions)} portion
              {recipe.totalPortions !== 1 ? "s" : ""}
            </span>
            {recipe.totalFinalWeightG != null && (
              <span className="text-emerald-700 font-medium w-20 text-right">
                {formatWeight(recipe.totalFinalWeightG)}
              </span>
            )}
          </div>
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-200">
          {recipe.clientBreakdown.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 mt-2">
                Per client
              </p>
              <div className="space-y-1">
                {recipe.clientBreakdown.map((c) => (
                  <div
                    key={c.clientName}
                    className="flex items-center justify-between text-sm px-2 py-1"
                  >
                    <span className="text-gray-700">{c.clientName}</span>
                    <span className="text-gray-600">
                      {formatQty(c.portions)} portion
                      {c.portions !== 1 ? "s" : ""}
                      {c.weightG != null && (
                        <>
                          {" · "}
                          <span className="text-emerald-700 font-medium">
                            {formatWeight(c.weightG)}
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recipe.ingredients.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Scaled ingredients
              </p>
              <div className="space-y-1">
                {recipe.ingredients.map((ing) => (
                  <div
                    key={ing.ingredientId}
                    className="flex items-center justify-between text-sm px-2 py-1"
                  >
                    <span className="text-gray-700">{ing.name}</span>
                    <span className="text-gray-600">
                      {formatQty(ing.quantity)}
                      {ing.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatQty(n: number): string {
  if (n % 1 === 0) return n.toString();
  return n.toFixed(1);
}

function formatWeight(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
  return `${Math.round(g)} g`;
}

function formatWeekLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
