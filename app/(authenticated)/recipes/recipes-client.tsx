"use client";

import { useState, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Recipe, RecipeIngredient, Ingredient, MealType } from "@/lib/supabase/types";
import { calculateRecipe } from "@/lib/calculations/recipe";
import RecipeForm from "@/components/recipe-form";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

type RecipeWithIngredients = Recipe & {
  recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
};

const MEAL_TYPES: { value: MealType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

export default function RecipesClient({
  recipes,
}: {
  recipes: RecipeWithIngredients[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [filter, setFilter] = useState<MealType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editRecipe, setEditRecipe] = useState<RecipeWithIngredients | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered =
    filter === "all"
      ? recipes
      : recipes.filter((r) => r.category === filter);

  function getCalc(recipe: RecipeWithIngredients) {
    const items = recipe.recipe_ingredients.map((ri) => ({
      ingredient: ri.ingredient,
      quantity: ri.quantity,
    }));
    return calculateRecipe(items, recipe.portions);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await supabase.from("recipes").delete().eq("id", id);
    router.refresh();
  }

  function openEdit(recipe: RecipeWithIngredients) {
    setEditRecipe(recipe);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditRecipe(undefined);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
          <p className="text-sm text-gray-500 mt-1">
            {recipes.length} recipes in database
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Recipe
        </button>
      </div>

      {/* Meal type tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {MEAL_TYPES.map((mt) => (
          <button
            key={mt.value}
            onClick={() => setFilter(mt.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filter === mt.value
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {mt.label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No recipes yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Create your first recipe
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Portions</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cost/portion</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cal/portion</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">P</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">C</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">F</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((recipe) => {
                  const calc = getCalc(recipe);
                  return (
                    <Fragment key={recipe.id}>
                      <tr
                        className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          setExpandedId(expandedId === recipe.id ? null : recipe.id)
                        }
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            {expandedId === recipe.id ? (
                              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            )}
                            {recipe.name}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {recipe.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {recipe.portions}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {calc.costPerPortion.toFixed(2)} lei
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {Math.round(calc.perPortion.calories)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {calc.perPortion.protein.toFixed(1)}g
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {calc.perPortion.carbs.toFixed(1)}g
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {calc.perPortion.fat.toFixed(1)}g
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(recipe);
                              }}
                              className="p-1.5 rounded hover:bg-gray-100"
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(recipe.id, recipe.name);
                              }}
                              className="p-1.5 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === recipe.id && (
                        <tr key={`${recipe.id}-details`} className="border-b">
                          <td colSpan={9} className="px-4 py-3 bg-gray-50">
                            <div className="space-y-3">
                              {/* Ingredients list */}
                              <div>
                                <p className="text-xs font-semibold text-gray-600 mb-1">
                                  Ingredients ({recipe.recipe_ingredients.length})
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                                  {recipe.recipe_ingredients.map((ri) => (
                                    <div
                                      key={ri.id}
                                      className="text-xs text-gray-900 flex justify-between bg-white px-2 py-1 rounded border"
                                    >
                                      <span>{ri.ingredient.name}</span>
                                      <span className="text-gray-500 ml-2">
                                        {ri.quantity}
                                        {ri.ingredient.unit}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Totals */}
                              <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 text-xs">
                                <div>
                                  <span className="text-gray-500">Total Cost</span>
                                  <p className="font-medium text-gray-900">
                                    {calc.totalCost.toFixed(2)} lei
                                  </p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Fiber/p</span>
                                  <p className="font-medium text-gray-900">
                                    {calc.perPortion.fiber.toFixed(1)}g
                                  </p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Sugar/p</span>
                                  <p className="font-medium text-gray-900">
                                    {calc.perPortion.sugar.toFixed(1)}g
                                  </p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Sat Fat/p</span>
                                  <p className="font-medium text-gray-900">
                                    {calc.perPortion.sat_fat.toFixed(1)}g
                                  </p>
                                </div>
                                <div>
                                  <span className="text-gray-500">Salt/p</span>
                                  <p className="font-medium text-gray-900">
                                    {calc.perPortion.salt.toFixed(1)}g
                                  </p>
                                </div>
                                {Object.entries(calc.perPortion.micronutrients).map(
                                  ([key, val]) => (
                                    <div key={key}>
                                      <span className="text-gray-500">
                                        {key
                                          .replace(/_/g, " ")
                                          .replace(/\b\w/g, (c) => c.toUpperCase())}
                                      </span>
                                      <p className="font-medium text-gray-900">
                                        {val.toFixed(1)}
                                      </p>
                                    </div>
                                  )
                                )}
                              </div>
                              {recipe.notes && (
                                <p className="text-xs text-gray-500 italic">
                                  {recipe.notes}
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <RecipeForm recipe={editRecipe} onClose={closeForm} />
      )}
    </div>
  );
}
