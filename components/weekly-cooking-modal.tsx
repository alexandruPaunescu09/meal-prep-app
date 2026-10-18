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
import { escapeHtml, printHtml } from "@/lib/browser";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { addDays, currentWeekStart, formatWeekRange, nextWeekStart } from "@/lib/format";
import {
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsUpDown,
  Printer,
  RotateCcw,
} from "lucide-react";

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

function defaultWeek(weeks: string[]): string {
  const cur = currentWeekStart();
  const next = nextWeekStart();
  if (weeks.includes(cur)) return cur;
  if (weeks.includes(next)) return next;
  return weeks[0] ?? cur;
}

export default function WeeklyCookingModal({
  weeks,
  onClose,
}: {
  weeks: string[];
  onClose: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedWeek, setSelectedWeek] = useState<string>(() =>
    defaultWeek(weeks)
  );
  const weekOptions = useMemo(() => {
    const set = new Set(weeks);
    if (selectedWeek) set.add(selectedWeek);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [weeks, selectedWeek]);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanInWeek[]>([]);
  const [entries, setEntries] = useState<FullEntry[]>([]);
  const {
    checkedItems,
    toggle: toggleRecipe,
    clearAll: clearAllChecks,
  } = useCookingChecks(selectedWeek || null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedWeek) return;
    let cancelled = false;
    async function loadWeek() {
      setLoading(true);

      const { data: plansData, error: plansErr } = await supabase
        .from("meal_plans")
        .select("id, name, client:clients(name)")
        .eq("week_start", selectedWeek);

      if (plansErr) {
        if (!cancelled) {
          toast.error(`Could not load plans: ${plansErr.message}`);
          setPlans([]);
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      const planList = (plansData as unknown as (PlanInWeek[] | null)) ?? [];
      const planIds = planList.map((p) => p.id);

      if (planIds.length === 0) {
        if (!cancelled) {
          setPlans([]);
          setEntries([]);
          setLoading(false);
        }
        return;
      }

      const { data: entriesData, error: entriesErr } = await supabase
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
        if (entriesErr) {
          toast.error(`Could not load entries: ${entriesErr.message}`);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function shiftWeek(days: number) {
    if (selectedWeek) setSelectedWeek(addDays(selectedWeek, days));
  }

  const allExpanded =
    recipes.length > 0 && recipes.every((r) => expanded.has(r.recipeId));

  function toggleAll() {
    setExpanded(
      allExpanded ? new Set() : new Set(recipes.map((r) => r.recipeId))
    );
  }

  function handlePrint() {
    const recipeHtml = recipes
      .map(
        (r) => `<h2>${checkedItems.has(r.recipeId) ? "&#9745;" : "&#9744;"} ${escapeHtml(r.name)} <span>${formatQty(r.totalPortions)} portion${r.totalPortions !== 1 ? "s" : ""}${r.totalFinalWeightG != null ? " · " + formatWeight(r.totalFinalWeightG) : ""}</span></h2>
        ${
          r.clientBreakdown.length
            ? `<p class="h">Per client</p><table>${r.clientBreakdown
                .map(
                  (c) =>
                    `<tr><td>${escapeHtml(c.clientName)}</td><td class="r">${formatQty(c.portions)} portion${c.portions !== 1 ? "s" : ""}${c.weightG != null ? " · " + formatWeight(c.weightG) : ""}</td></tr>`
                )
                .join("")}</table>`
            : ""
        }
        ${
          r.ingredients.length
            ? `<p class="h">Scaled ingredients</p><table>${r.ingredients
                .map(
                  (i) =>
                    `<tr><td>${escapeHtml(i.name)}</td><td class="r">${formatQty(i.quantity)}${escapeHtml(i.unit)}</td></tr>`
                )
                .join("")}</table>`
            : ""
        }`
      )
      .join("");
    const directHtml = directIngredients.length
      ? `<h2>Raw / direct ingredients</h2><table>${directIngredients
          .map(
            (d) =>
              `<tr><td>${escapeHtml(d.name)}</td><td class="r">${formatQty(d.totalQuantity)}${escapeHtml(d.unit)}</td></tr>`
          )
          .join("")}</table>`
      : "";
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cooking plan</title><style>
      body{font-family:system-ui,sans-serif;color:#111;margin:24px}
      h1{font-size:18px;margin:0 0 4px} p{margin:0 0 8px;font-size:12px;color:#555}
      h2{font-size:14px;margin:18px 0 4px;border-bottom:1px solid #999;padding-bottom:2px} h2 span{font-weight:normal;color:#555;font-size:12px}
      .h{text-transform:uppercase;letter-spacing:.05em;font-size:10px;margin:6px 0 2px}
      table{width:100%;border-collapse:collapse;font-size:13px} td{padding:2px 6px;border-bottom:1px solid #eee} .r{text-align:right;white-space:nowrap}
    </style></head><body><h1>Cooking plan · ${escapeHtml(formatWeekRange(selectedWeek))}</h1>
    <p>${escapeHtml(plans.map((p) => p.client?.name ?? p.name).join(", "))}</p>
    ${recipeHtml}${directHtml}</body></html>`;
    if (!printHtml(html)) toast.error("Could not open the print view.");
  }

  async function handleClearChecks() {
    const count = checkedItems.size;
    const ok = await confirm({
      title: "Clear all checks?",
      message: `Unmark ${count} recipe${count !== 1 ? "s" : ""} for ${formatWeekRange(selectedWeek)}. This is shared across all plans that week.`,
      confirmLabel: "Clear checks",
      tone: "danger",
    });
    if (!ok) return;
    clearAllChecks();
  }

  const checkedCount = checkedItems.size;
  const hasContent = recipes.length > 0 || directIngredients.length > 0;

  return (
    <Modal open onClose={onClose} title="Weekly Cooking Plan" size="lg">
      <div className="space-y-3 mb-4">
        <div className="flex items-end gap-2">
          <IconButton
            label="Previous week"
            onClick={() => shiftWeek(-7)}
            disabled={!selectedWeek}
          >
            <ChevronLeft className="w-5 h-5" />
          </IconButton>
          <div className="flex-1">
            <label
              htmlFor="cooking-week"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Week
            </label>
            <select
              id="cooking-week"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  {formatWeekRange(w)}
                  {weeks.includes(w) ? "" : " (no plans)"}
                </option>
              ))}
            </select>
          </div>
          <IconButton
            label="Next week"
            onClick={() => shiftWeek(7)}
            disabled={!selectedWeek}
          >
            <ChevronRight className="w-5 h-5" />
          </IconButton>
        </div>
        {plans.length > 0 && (
          <p className="text-xs text-gray-500">
            Plans included ({plans.length}):{" "}
            {plans.map((p) => p.client?.name ?? p.name).join(", ")}
          </p>
        )}
        {hasContent && !loading && (
          <div className="flex flex-wrap items-center gap-2">
            {recipes.length > 0 && (
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
                {allExpanded ? "Collapse all" : "Expand all"}
              </button>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            {checkedCount > 0 && (
              <button
                onClick={handleClearChecks}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Clear checks
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : !hasContent ? (
        <p className="text-sm text-gray-400 text-center py-8">
          {plans.length === 0
            ? "No meal plans for this week."
            : "No entries in this week’s meal plans yet."}
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
    </Modal>
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
          aria-label={`Cooked: ${recipe.name}`}
          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
        />
        <button
          onClick={onToggleExpand}
          aria-expanded={expanded}
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
