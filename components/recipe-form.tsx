"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  Recipe,
  RecipeIngredient,
  Ingredient,
  MealType,
} from "@/lib/supabase/types";
import { calculateRecipe, RecipeCalculation } from "@/lib/calculations/recipe";
import { X, Plus, Trash2, Search } from "lucide-react";

type RecipeWithIngredients = Recipe & {
  recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
};

interface RecipeFormProps {
  recipe?: RecipeWithIngredients;
  onClose: () => void;
}

interface IngredientEntry {
  id: string;
  ingredient: Ingredient;
  quantity: number;
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

export default function RecipeForm({ recipe, onClose }: RecipeFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(recipe?.name ?? "");
  const [category, setCategory] = useState<MealType>(recipe?.category ?? "lunch");
  const [portions, setPortions] = useState(recipe?.portions ?? 1);
  const [notes, setNotes] = useState(recipe?.notes ?? "");

  const [entries, setEntries] = useState<IngredientEntry[]>(
    recipe?.recipe_ingredients.map((ri) => ({
      id: ri.id,
      ingredient: ri.ingredient,
      quantity: ri.quantity,
    })) ?? []
  );

  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    supabase
      .from("ingredients")
      .select("*")
      .order("name")
      .then(({ data }) => {
        if (data) setAllIngredients(data as Ingredient[]);
      });
  }, []);

  const filteredIngredients = useMemo(() => {
    const usedIds = new Set(entries.map((e) => e.ingredient.id));
    return allIngredients
      .filter((i) => !usedIds.has(i.id))
      .filter(
        (i) =>
          searchQuery.length === 0 ||
          i.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [allIngredients, entries, searchQuery]);

  const calc: RecipeCalculation = useMemo(() => {
    return calculateRecipe(
      entries.map((e) => ({ ingredient: e.ingredient, quantity: e.quantity })),
      portions
    );
  }, [entries, portions]);

  function addIngredient(ingredient: Ingredient) {
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), ingredient, quantity: 100 },
    ]);
    setShowPicker(false);
    setSearchQuery("");
  }

  function updateQuantity(id: string, quantity: number) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, quantity } : e))
    );
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (entries.length === 0) {
      setError("Add at least one ingredient.");
      return;
    }
    setSaving(true);
    setError("");

    if (recipe) {
      const { error: updateErr } = await supabase
        .from("recipes")
        .update({ name: name.trim(), category, portions, notes: notes || null })
        .eq("id", recipe.id);

      if (updateErr) {
        setError(updateErr.message);
        setSaving(false);
        return;
      }

      await supabase
        .from("recipe_ingredients")
        .delete()
        .eq("recipe_id", recipe.id);

      const { error: riErr } = await supabase.from("recipe_ingredients").insert(
        entries.map((e) => ({
          recipe_id: recipe.id,
          ingredient_id: e.ingredient.id,
          quantity: e.quantity,
        }))
      );

      if (riErr) {
        setError(riErr.message);
        setSaving(false);
        return;
      }
    } else {
      const { data: newRecipe, error: createErr } = await supabase
        .from("recipes")
        .insert({ name: name.trim(), category, portions, notes: notes || null })
        .select("id")
        .single();

      if (createErr || !newRecipe) {
        setError(createErr?.message ?? "Failed to create recipe");
        setSaving(false);
        return;
      }

      const { error: riErr } = await supabase.from("recipe_ingredients").insert(
        entries.map((e) => ({
          recipe_id: newRecipe.id,
          ingredient_id: e.ingredient.id,
          quantity: e.quantity,
        }))
      );

      if (riErr) {
        setError(riErr.message);
        setSaving(false);
        return;
      }
    }

    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            {recipe ? "Edit Recipe" : "New Recipe"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name + Category + Portions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MealType)}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              >
                {MEAL_TYPES.map((mt) => (
                  <option key={mt.value} value={mt.value}>
                    {mt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Portions *
              </label>
              <input
                type="number"
                min={1}
                value={portions}
                onChange={(e) => setPortions(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                required
              />
            </div>
          </div>

          {/* Ingredients */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Ingredients ({entries.length})
              </h3>
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Ingredient
              </button>
            </div>

            {entries.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No ingredients added yet.
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <span className="flex-1 text-sm font-medium text-gray-900">
                      {entry.ingredient.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={entry.quantity}
                        onChange={(e) =>
                          updateQuantity(
                            entry.id,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-20 px-2 py-1 border rounded text-sm text-gray-900 text-right focus:ring-1 focus:ring-emerald-500 outline-none"
                      />
                      <span className="text-xs text-gray-500 w-6">
                        {entry.ingredient.unit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEntry(entry.id)}
                      className="p-1 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live calculation sidebar */}
          {entries.length > 0 && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Per Portion Summary
              </h3>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Cost</p>
                  <p className="text-sm font-bold text-emerald-700">
                    {calc.costPerPortion.toFixed(2)} lei
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Calories</p>
                  <p className="text-sm font-bold text-gray-900">
                    {Math.round(calc.perPortion.calories)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Protein</p>
                  <p className="text-sm font-bold text-gray-900">
                    {calc.perPortion.protein.toFixed(1)}g
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Carbs</p>
                  <p className="text-sm font-bold text-gray-900">
                    {calc.perPortion.carbs.toFixed(1)}g
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Fat</p>
                  <p className="text-sm font-bold text-gray-900">
                    {calc.perPortion.fat.toFixed(1)}g
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Total cost: {calc.totalCost.toFixed(2)} lei for {portions} portion
                {portions > 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

          {/* Actions */}
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
              {saving ? "Saving..." : recipe ? "Update Recipe" : "Create Recipe"}
            </button>
          </div>
        </form>
      </div>

      {/* Ingredient picker dropdown */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[60vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-900">
                Pick Ingredient
              </h3>
              <button
                onClick={() => {
                  setShowPicker(false);
                  setSearchQuery("");
                }}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="px-4 py-2 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ingredients..."
                  className="w-full pl-10 pr-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredIngredients.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No ingredients available.
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredIngredients.map((ing) => (
                    <button
                      key={ing.id}
                      type="button"
                      onClick={() => addIngredient(ing)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-sm transition-colors"
                    >
                      <span className="font-medium text-gray-900">
                        {ing.name}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {ing.category.replace("_", " ")} •{" "}
                        {ing.price_per_unit.toFixed(4)} lei/{ing.unit}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
