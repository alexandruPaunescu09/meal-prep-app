"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MealPlanEntry,
  Recipe,
  RecipeIngredient,
  Ingredient,
  Category,
} from "@/lib/supabase/types";
import {
  generateShoppingList,
  shoppingListToText,
} from "@/lib/calculations/shopping-list";
import { useShoppingChecks } from "@/lib/hooks/use-shopping-checks";
import { Copy, Check, X, Loader2 } from "lucide-react";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

type PlanInWeek = {
  id: string;
  name: string;
  client: { name: string } | null;
};

export default function WeeklyShoppingModal({
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
  const [categories, setCategories] = useState<Category[]>([]);
  const { checkedItems, toggle: toggleItem } = useShoppingChecks(selectedWeek || null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      const { data } = await supabase
        .from("ingredient_categories")
        .select("*")
        .order("sort_order");
      if (!cancelled) setCategories((data as Category[]) ?? []);
    }
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

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
          ingredient:ingredients (*)
        `)
        .in("meal_plan_id", planIds);

      if (!cancelled) {
        setPlans(planList as PlanInWeek[]);
        setEntries((entriesData as FullEntry[]) ?? []);
        setLoading(false);
      }
    }
    loadWeek();
    return () => {
      cancelled = true;
    };
  }, [selectedWeek, supabase]);

  const { groups, totalCost } = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const c of categories) labels[c.slug] = c.name;
    return generateShoppingList(entries, labels);
  }, [entries, categories]);

  function handleCopy() {
    const filteredGroups = groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => !checkedItems.has(i.ingredientId)),
        subtotal: g.items
          .filter((i) => !checkedItems.has(i.ingredientId))
          .reduce((sum, i) => sum + i.estimatedCost, 0),
      }))
      .filter((g) => g.items.length > 0);
    const filteredCost = filteredGroups.reduce((s, g) => s + g.subtotal, 0);
    const text = shoppingListToText(filteredGroups, filteredCost);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Weekly Shopping List
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={groups.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b bg-gray-50 space-y-2">
          <label className="block text-xs font-medium text-gray-700">
            Week
          </label>
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
              {plans
                .map((p) => p.client?.name ?? p.name)
                .join(", ")}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No entries in this week&apos;s meal plans yet.
            </p>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.category}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {group.label}
                  </h3>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <div
                        key={item.ingredientId}
                        className={`flex items-center gap-2 py-1.5 px-3 bg-gray-50 rounded-lg ${checkedItems.has(item.ingredientId) ? "opacity-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checkedItems.has(item.ingredientId)}
                          onChange={() => toggleItem(item.ingredientId)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                        />
                        <span
                          className={`text-sm font-medium text-gray-900 flex-1 ${checkedItems.has(item.ingredientId) ? "line-through" : ""}`}
                        >
                          {item.name}
                        </span>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-gray-600">
                            {item.totalQuantity % 1 === 0
                              ? item.totalQuantity
                              : item.totalQuantity.toFixed(1)}
                            {item.unit}
                          </span>
                          <span className="text-emerald-700 font-medium w-20 text-right">
                            {item.estimatedCost.toFixed(2)} lei
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 text-right mt-1">
                    Subtotal: {group.subtotal.toFixed(2)} lei
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {!loading && groups.length > 0 && (
          <div className="px-6 py-4 border-t bg-emerald-50 rounded-b-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                Total Estimated Cost
              </span>
              <span className="text-lg font-bold text-emerald-700">
                {totalCost.toFixed(2)} lei
              </span>
            </div>
            {checkedItems.size > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {checkedItems.size} item{checkedItems.size !== 1 ? "s" : ""}{" "}
                checked (in stock)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
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
