"use client";

import { useState, Fragment, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  Recipe,
  RecipeIngredient,
  Ingredient,
  RecipeRatingStats,
} from "@/lib/supabase/types";
import { calculateRecipe } from "@/lib/calculations/recipe";
import RecipeForm from "@/components/recipe-form";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Copy, Star } from "lucide-react";

type RecipeWithIngredients = Recipe & {
  recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
};

export default function RecipesClient({
  recipes,
  ratingStats,
}: {
  recipes: RecipeWithIngredients[];
  ratingStats: RecipeRatingStats[];
}) {
  const ratingMap = useMemo(() => {
    const m = new Map<string, RecipeRatingStats>();
    for (const s of ratingStats) m.set(s.recipe_id, s);
    return m;
  }, [ratingStats]);
  const router = useRouter();
  const supabase = createClient();
  const [showForm, setShowForm] = useState(false);
  const [editRecipe, setEditRecipe] = useState<RecipeWithIngredients | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function getCalc(recipe: RecipeWithIngredients) {
    const items = recipe.recipe_ingredients.map((ri) => ({
      ingredient: ri.ingredient,
      quantity: ri.quantity,
    }));
    return calculateRecipe(items, recipe.portions);
  }

  async function handleDelete(id: string, name: string) {
    const { data: refs, error: refErr } = await supabase
      .from("meal_plan_entries")
      .select("meal_plan:meal_plans(id, name)")
      .eq("recipe_id", id);

    if (refErr) {
      alert(`Could not check references for "${name}": ${refErr.message}`);
      return;
    }

    if (refs && refs.length > 0) {
      const planNames = Array.from(
        new Set(
          refs.flatMap((r: { meal_plan: { id: string; name: string }[] | { id: string; name: string } | null }) => {
            const mp = r.meal_plan;
            if (!mp) return [];
            return Array.isArray(mp) ? mp.map((p) => p.name) : [mp.name];
          })
        )
      );
      const entryWord = refs.length === 1 ? "entry" : "entries";
      const plansSuffix = planNames.length > 0 ? ` (${planNames.join(", ")})` : "";
      alert(
        `Cannot delete "${name}" — it is used in ${refs.length} meal plan ${entryWord}${plansSuffix}. Remove it from those plans first.`
      );
      return;
    }

    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }
    router.refresh();
  }

  async function handleClone(recipe: RecipeWithIngredients) {
    const { data: newRecipe, error } = await supabase
      .from("recipes")
      .insert({
        name: `${recipe.name} (copy)`,
        portions: recipe.portions,
        final_weight: recipe.final_weight,
        notes: recipe.notes,
        customer_description: recipe.customer_description,
        container_type_id: recipe.container_type_id,
      })
      .select("id")
      .single();

    if (error || !newRecipe) return;

    if (recipe.recipe_ingredients.length > 0) {
      await supabase.from("recipe_ingredients").insert(
        recipe.recipe_ingredients.map((ri) => ({
          recipe_id: newRecipe.id,
          ingredient_id: ri.ingredient_id,
          quantity: ri.quantity,
        }))
      );
    }

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

      {/* List */}
      {recipes.length === 0 ? (
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
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {recipes.map((recipe) => {
              const calc = getCalc(recipe);
              const stats = ratingMap.get(recipe.id);
              return (
                <div
                  key={recipe.id}
                  className="bg-white rounded-xl border p-4"
                  onClick={() =>
                    setExpandedId(expandedId === recipe.id ? null : recipe.id)
                  }
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{recipe.name}</p>
                      {stats && stats.review_count > 0 && (
                        <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {stats.avg_rating.toFixed(1)}
                          <span className="text-gray-400">
                            ({stats.review_count})
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2">
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
                        onClick={(e) => { e.stopPropagation(); handleClone(recipe); }}
                        className="p-1.5 rounded hover:bg-blue-50"
                        title="Clone"
                      >
                        <Copy className="w-3.5 h-3.5 text-blue-500" />
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
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Cost/p</span>
                      <p className="font-medium text-emerald-700">
                        {calc.costPerPortion.toFixed(2)} lei
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Cal/p</span>
                      <p className="font-medium text-gray-900">
                        {Math.round(calc.perPortion.calories)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">P / C / F</span>
                      <p className="font-medium text-gray-900">
                        {calc.perPortion.protein.toFixed(0)} / {calc.perPortion.carbs.toFixed(0)} / {calc.perPortion.fat.toFixed(0)}
                      </p>
                    </div>
                  </div>
                  {expandedId === recipe.id && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-semibold text-gray-600 mb-1">
                        Ingredients ({recipe.recipe_ingredients.length})
                      </p>
                      <div className="grid grid-cols-2 gap-1 mb-3">
                        {recipe.recipe_ingredients.map((ri) => (
                          <div
                            key={ri.id}
                            className="text-xs text-gray-900 flex justify-between bg-gray-50 px-2 py-1 rounded border"
                          >
                            <span>{ri.ingredient.name}</span>
                            <span className="text-gray-500 ml-2">
                              {ri.quantity}{ri.ingredient.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
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
                        <div>
                          <span className="text-gray-500">Portions</span>
                          <p className="font-medium text-gray-900">
                            {recipe.portions}
                          </p>
                        </div>
                      </div>
                      {recipe.final_weight && (
                        <span className="text-xs text-gray-500">
                          {recipe.final_weight}g total ({Math.round(recipe.final_weight / recipe.portions)}g/portion)
                        </span>
                      )}
                      {recipe.notes && (
                        <p className="mt-2 text-xs text-gray-500 italic">
                          {recipe.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
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
                  {recipes.map((recipe) => {
                    const calc = getCalc(recipe);
                    const stats = ratingMap.get(recipe.id);
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
                              <span>{recipe.name}</span>
                              {stats && stats.review_count > 0 && (
                                <span className="text-xs text-amber-600 flex items-center gap-0.5 ml-1">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  {stats.avg_rating.toFixed(1)}
                                  <span className="text-gray-400">
                                    ({stats.review_count})
                                  </span>
                                </span>
                              )}
                            </div>
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
                                onClick={(e) => { e.stopPropagation(); handleClone(recipe); }}
                                className="p-1.5 rounded hover:bg-blue-50"
                                title="Clone"
                              >
                                <Copy className="w-3.5 h-3.5 text-blue-500" />
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
                            <td colSpan={8} className="px-4 py-3 bg-gray-50">
                              <div className="space-y-3">
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
                                {recipe.final_weight && (
                                  <span className="text-xs text-gray-500">
                                    {recipe.final_weight}g total ({Math.round(recipe.final_weight / recipe.portions)}g/portion)
                                  </span>
                                )}
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
        </>
      )}

      {/* Form modal */}
      {showForm && (
        <RecipeForm recipe={editRecipe} onClose={closeForm} />
      )}
    </div>
  );
}
