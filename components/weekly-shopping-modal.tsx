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
import ShoppingListPanel from "@/components/shopping-list-panel";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { addDays, currentWeekStart, formatWeekRange, nextWeekStart } from "@/lib/format";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

function defaultWeek(weeks: string[]): string {
  const cur = currentWeekStart();
  const next = nextWeekStart();
  if (weeks.includes(cur)) return cur;
  if (weeks.includes(next)) return next;
  return weeks[0] ?? cur;
}

export default function WeeklyShoppingModal({
  weeks,
  onClose,
}: {
  weeks: string[];
  onClose: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [selectedWeek, setSelectedWeek] = useState<string>(() =>
    defaultWeek(weeks)
  );
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanInWeek[]>([]);
  const [entries, setEntries] = useState<FullEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const weekOptions = useMemo(() => {
    const set = new Set(weeks);
    if (selectedWeek) set.add(selectedWeek);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [weeks, selectedWeek]);

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
          ingredient:ingredients (*)
        `)
        .in("meal_plan_id", planIds);

      if (!cancelled) {
        if (entriesErr) {
          toast.error(`Could not load entries: ${entriesErr.message}`);
        }
        setPlans(planList as PlanInWeek[]);
        setEntries((entriesData as FullEntry[]) ?? []);
        setLoading(false);
      }
    }
    loadWeek();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, supabase]);

  const labels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.slug] = c.name;
    return m;
  }, [categories]);
  const plansLabel = plans.map((p) => p.client?.name ?? p.name).join(", ");

  function shiftWeek(days: number) {
    if (selectedWeek) setSelectedWeek(addDays(selectedWeek, days));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Weekly Shopping List"
      size="lg"
    >
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
              htmlFor="shopping-week"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Week
            </label>
            <select
              id="shopping-week"
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
      </div>

      <ShoppingListPanel
        entries={entries}
        weekStart={selectedWeek}
        categoryLabels={labels}
        plansLabel={plansLabel}
        loading={loading}
        emptyMessage={
          plans.length === 0
            ? "No meal plans for this week."
            : "No entries in this week’s meal plans yet."
        }
      />
    </Modal>
  );
}
