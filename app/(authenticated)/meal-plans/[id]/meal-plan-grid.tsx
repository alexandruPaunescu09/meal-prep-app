"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  MealPlan,
  MealPlanEntry,
  Recipe,
  RecipeIngredient,
  Ingredient,
  Client,
  MealType,
} from "@/lib/supabase/types";
import { calculateWeek, DayTotals } from "@/lib/calculations/meal-plan";
import { Plus, X, ArrowLeft, Trash2, Image, Download, Settings } from "lucide-react";
import Link from "next/link";

type FullEntry = MealPlanEntry & {
  recipe: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
};

type PlanWithClient = MealPlan & { client: Client | null };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

interface SlotPickerState {
  day: number;
  mealType: MealType;
}

export default function MealPlanGrid({
  plan,
  entries,
  recipes,
  clients,
}: {
  plan: PlanWithClient;
  entries: FullEntry[];
  recipes: { id: string; name: string; category: MealType; portions: number }[];
  clients: Client[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [slotPicker, setSlotPicker] = useState<SlotPickerState | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const weekTotals = calculateWeek(entries, plan.markup_multiplier);

  function getEntriesForSlot(day: number, mealType: MealType) {
    return entries.filter(
      (e) => e.day_of_week === day && e.meal_type === mealType
    );
  }

  async function addEntry(recipeId: string, portions: number) {
    if (!slotPicker) return;
    await supabase.from("meal_plan_entries").insert({
      meal_plan_id: plan.id,
      day_of_week: slotPicker.day,
      meal_type: slotPicker.mealType,
      recipe_id: recipeId,
      portions,
    });
    setSlotPicker(null);
    router.refresh();
  }

  async function removeEntry(entryId: string) {
    await supabase.from("meal_plan_entries").delete().eq("id", entryId);
    router.refresh();
  }

  function formatDayTotals(day: DayTotals) {
    return `${Math.round(day.calories)} kcal • P:${day.protein.toFixed(0)}g C:${day.carbs.toFixed(0)}g F:${day.fat.toFixed(0)}g • ${day.cost.toFixed(2)} lei`;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/meal-plans"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{plan.name}</h1>
          <p className="text-sm text-gray-500">
            Week of {plan.week_start}
            {plan.client && ` • Client: ${plan.client.name}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Edit
          </button>
          <a
            href={`/api/og/meal-plan?id=${plan.id}&format=story`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <Image className="w-3.5 h-3.5" />
            Story
          </a>
          <a
            href={`/api/og/meal-plan?id=${plan.id}&format=landscape`}
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Landscape
          </a>
        </div>
      </div>

      {/* Weekly Grid */}
      <div className="bg-white rounded-xl border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20"></th>
                {DAYS.map((day, idx) => (
                  <th
                    key={day}
                    className="text-center px-2 py-2 font-medium text-gray-600 min-w-[140px]"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_TYPES.map((mealType) => (
                <tr key={mealType} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-gray-700 text-xs bg-gray-50 border-r">
                    {MEAL_LABELS[mealType]}
                  </td>
                  {DAYS.map((_, dayIdx) => {
                    const day = dayIdx + 1;
                    const slotEntries = getEntriesForSlot(day, mealType);
                    return (
                      <td
                        key={day}
                        className="px-2 py-2 border-r last:border-r-0 align-top"
                      >
                        <div className="space-y-1 min-h-[48px]">
                          {slotEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center justify-between bg-emerald-50 rounded px-2 py-1 group"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate">
                                  {entry.recipe.name}
                                </p>
                                <p className="text-[10px] text-gray-500">
                                  ×{entry.portions}
                                </p>
                              </div>
                              <button
                                onClick={() => removeEntry(entry.id)}
                                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-opacity"
                              >
                                <X className="w-3 h-3 text-red-500" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setSlotPicker({ day, mealType })}
                            className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Daily totals row */}
              <tr className="bg-gray-50 border-t">
                <td className="px-3 py-2 font-medium text-gray-600 text-xs border-r">
                  Daily
                </td>
                {DAYS.map((_, dayIdx) => {
                  const day = dayIdx + 1;
                  const dayTotals = weekTotals.days[day];
                  const hasEntries = dayTotals.calories > 0;
                  return (
                    <td
                      key={day}
                      className="px-2 py-2 text-center border-r last:border-r-0"
                    >
                      {hasEntries ? (
                        <div className="text-[10px] space-y-0.5">
                          <p className="font-semibold text-gray-900">
                            {Math.round(dayTotals.calories)} kcal
                          </p>
                          <p className="text-gray-500">
                            P:{dayTotals.protein.toFixed(0)} C:
                            {dayTotals.carbs.toFixed(0)} F:
                            {dayTotals.fat.toFixed(0)}
                          </p>
                          <p className="text-emerald-700 font-medium">
                            {dayTotals.cost.toFixed(2)} lei
                          </p>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly summary */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Weekly Summary
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <div>
            <p className="text-xs text-gray-500">Ingredient Cost</p>
            <p className="text-lg font-bold text-gray-900">
              {weekTotals.totalCost.toFixed(2)} lei
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">
              Selling Price ({plan.markup_multiplier}×)
            </p>
            <p className="text-lg font-bold text-emerald-700">
              {weekTotals.sellingPrice.toFixed(2)} lei
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg Daily Cal</p>
            <p className="text-lg font-bold text-gray-900">
              {Math.round(weekTotals.averageDaily.calories)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg Protein/day</p>
            <p className="text-lg font-bold text-gray-900">
              {weekTotals.averageDaily.protein.toFixed(0)}g
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg Carbs/day</p>
            <p className="text-lg font-bold text-gray-900">
              {weekTotals.averageDaily.carbs.toFixed(0)}g
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Avg Fat/day</p>
            <p className="text-lg font-bold text-gray-900">
              {weekTotals.averageDaily.fat.toFixed(0)}g
            </p>
          </div>
        </div>
      </div>

      {/* Slot picker modal */}
      {slotPicker && (
        <SlotPicker
          day={slotPicker.day}
          mealType={slotPicker.mealType}
          recipes={recipes}
          onAdd={addEntry}
          onClose={() => setSlotPicker(null)}
        />
      )}

      {/* Plan settings modal */}
      {showSettings && (
        <PlanSettings
          plan={plan}
          clients={clients}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function SlotPicker({
  day,
  mealType,
  recipes,
  onAdd,
  onClose,
}: {
  day: number;
  mealType: MealType;
  recipes: { id: string; name: string; category: MealType; portions: number }[];
  onAdd: (recipeId: string, portions: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [portions, setPortions] = useState(1);

  const filtered = recipes.filter(
    (r) =>
      search.length === 0 ||
      r.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[60vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">
            {DAYS[day - 1]} — {MEAL_LABELS[mealType]}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-4 py-2 border-b space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes..."
            className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            autoFocus
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Portions:</label>
            <input
              type="number"
              min={1}
              value={portions}
              onChange={(e) => setPortions(parseInt(e.target.value) || 1)}
              className="w-16 px-2 py-1 border rounded text-sm text-gray-900 text-center focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              No recipes found.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((recipe) => (
                <button
                  key={recipe.id}
                  onClick={() => onAdd(recipe.id, portions)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-sm transition-colors"
                >
                  <span className="font-medium text-gray-900">
                    {recipe.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    {recipe.category}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanSettings({
  plan,
  clients,
  onClose,
}: {
  plan: PlanWithClient;
  clients: Client[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: plan.name,
    client_id: plan.client_id ?? "",
    week_start: plan.week_start,
    markup_multiplier: plan.markup_multiplier,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { error: updateErr } = await supabase
      .from("meal_plans")
      .update({
        name: form.name.trim(),
        client_id: form.client_id || null,
        week_start: form.week_start,
        markup_multiplier: form.markup_multiplier,
      })
      .eq("id", plan.id);

    if (updateErr) {
      setError(updateErr.message);
      setSaving(false);
    } else {
      router.refresh();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Plan Settings</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plan Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <select
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Week Start (Monday)
            </label>
            <input
              type="date"
              value={form.week_start}
              onChange={(e) => setForm({ ...form, week_start: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Markup Multiplier
            </label>
            <input
              type="number"
              step="0.1"
              min={1}
              value={form.markup_multiplier}
              onChange={(e) =>
                setForm({
                  ...form,
                  markup_multiplier: parseFloat(e.target.value) || 1,
                })
              }
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Selling price = ingredient cost × multiplier
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
