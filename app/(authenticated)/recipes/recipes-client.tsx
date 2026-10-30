"use client";

import { useState, Fragment, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  Recipe,
  RecipeIngredient,
  Ingredient,
  RecipeRatingStats,
  SaveRecipeInput,
  SaveRecipeIngredientInput,
} from "@/lib/supabase/types";
import { calculateRecipe } from "@/lib/calculations/recipe";
import RecipeForm from "@/components/recipe-form";
import { invalidateRecipes } from "@/lib/actions/revalidate";
import { formatLei, formatNumber, humanizeSlug } from "@/lib/format";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { IconButton } from "@/components/ui/icon-button";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  Star,
  Search,
  Loader2,
  ExternalLink,
} from "lucide-react";

type RecipeWithIngredients = Recipe & {
  recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
};

type SortKey = "name" | "cost-asc" | "cost-desc" | "rating-desc";

export default function RecipesClient({
  recipes,
  ratingStats,
  initialNew = false,
  initialEditId = null,
}: {
  recipes: RecipeWithIngredients[];
  ratingStats: RecipeRatingStats[];
  initialNew?: boolean;
  initialEditId?: string | null;
}) {
  const ratingMap = useMemo(() => {
    const m = new Map<string, RecipeRatingStats>();
    for (const s of ratingStats) m.set(s.recipe_id, s);
    return m;
  }, [ratingStats]);
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();
  const toast = useToast();

  const deepLinked = initialNew || initialEditId != null;
  const [showForm, setShowForm] = useState(
    () => initialNew || (initialEditId != null && recipes.some((r) => r.id === initialEditId))
  );
  const [editRecipe, setEditRecipe] = useState<RecipeWithIngredients | undefined>(() =>
    initialEditId ? recipes.find((r) => r.id === initialEditId) : undefined
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const hasRatings = ratingStats.some((s) => s.review_count > 0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = recipes
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .map((r) => ({
        recipe: r,
        calc: calculateRecipe(
          r.recipe_ingredients.map((ri) => ({
            ingredient: ri.ingredient,
            quantity: ri.quantity,
          })),
          r.portions
        ),
      }));
    const rating = (id: string) => ratingMap.get(id)?.avg_rating ?? -1;
    list.sort((a, b) => {
      switch (sort) {
        case "cost-asc":
          return a.calc.costPerPortion - b.calc.costPerPortion;
        case "cost-desc":
          return b.calc.costPerPortion - a.calc.costPerPortion;
        case "rating-desc":
          return rating(b.recipe.id) - rating(a.recipe.id);
        default:
          return a.recipe.name.localeCompare(b.recipe.name);
      }
    });
    return list;
  }, [recipes, query, sort, ratingMap]);

  async function handleDelete(id: string, name: string) {
    const { data: refs, error: refErr } = await supabase
      .from("meal_plan_entries")
      .select("meal_plan:meal_plans(id, name)")
      .eq("recipe_id", id);

    if (refErr) {
      toast.error(`Could not check references for "${name}": ${refErr.message}`);
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
      await confirm({
        title: "Recipe is in use",
        message: `Cannot delete "${name}" — it is used in ${refs.length} meal plan ${entryWord}${plansSuffix}. Remove it from those plans first.`,
        confirmLabel: "OK",
        cancelLabel: "Close",
      });
      return;
    }

    const ok = await confirm({
      title: `Delete "${name}"?`,
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    await invalidateRecipes();
    router.refresh();
    toast.success(`Deleted "${name}"`);
  }

  async function handleClone(recipe: RecipeWithIngredients) {
    if (cloningId) return;
    setCloningId(recipe.id);
    const copyName = `${recipe.name} (copy)`;
    const p_recipe: SaveRecipeInput = {
      name: copyName,
      portions: recipe.portions,
      final_weight: recipe.final_weight,
      notes: recipe.notes,
      customer_description: recipe.customer_description,
      container_type_id: recipe.container_type_id,
      source_url: recipe.source_url,
      instructions: recipe.instructions ?? [],
    };
    const p_ingredients: SaveRecipeIngredientInput[] = recipe.recipe_ingredients.map((ri) => ({
      ingredient_id: ri.ingredient_id,
      quantity: ri.quantity,
    }));

    const { data: newId, error } = await supabase.rpc("save_recipe", {
      p_recipe_id: null,
      p_recipe,
      p_ingredients,
    });
    setCloningId(null);

    if (error || !newId) {
      toast.error(`Could not clone "${recipe.name}": ${error?.message ?? "no id returned"}`);
      return;
    }

    await invalidateRecipes();
    router.refresh();
    toast.success(`Cloned as "${copyName}"`);

    // Open the clone straight in the editor (list data refreshes in background).
    const id = newId as unknown as string;
    setEditRecipe({
      ...recipe,
      ...p_recipe,
      id,
      recipe_ingredients: recipe.recipe_ingredients.map((ri) => ({
        ...ri,
        id: crypto.randomUUID(),
        recipe_id: id,
      })),
    });
    setShowForm(true);
  }

  function openEdit(recipe: RecipeWithIngredients) {
    setEditRecipe(recipe);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditRecipe(undefined);
    if (deepLinked) router.replace("/recipes");
  }

  function RowActions({ recipe }: { recipe: RecipeWithIngredients }) {
    return (
      <div className="flex items-center gap-2 md:gap-1">
        <IconButton
          label={`Edit ${recipe.name}`}
          onClick={(e) => {
            e.stopPropagation();
            openEdit(recipe);
          }}
        >
          <Pencil size={16} />
        </IconButton>
        <IconButton
          label={`Clone ${recipe.name}`}
          tone="primary"
          disabled={cloningId !== null}
          onClick={(e) => {
            e.stopPropagation();
            handleClone(recipe);
          }}
        >
          {cloningId === recipe.id ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Copy size={16} />
          )}
        </IconButton>
        <span className="w-3 md:w-0" aria-hidden="true" />
        <IconButton
          label={`Delete ${recipe.name}`}
          tone="danger"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(recipe.id, recipe.name);
          }}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>
    );
  }

  const g = (n: number) => `${formatNumber(n, 1)} g`;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
          <p className="text-sm text-gray-500 mt-1">
            {recipes.length === 0
              ? "No recipes yet"
              : `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"}`}
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

      {/* Search + sort */}
      {recipes.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes by name..."
              aria-label="Search recipes"
              className="w-full pl-10 pr-3 py-2 border rounded-lg text-gray-900 text-sm bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort recipes"
            className="px-3 py-2 border rounded-lg text-gray-900 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="name">Name (A–Z)</option>
            <option value="cost-asc">Cost per portion (low to high)</option>
            <option value="cost-desc">Cost per portion (high to low)</option>
            {hasRatings && <option value="rating-desc">Rating (high to low)</option>}
          </select>
        </div>
      )}

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
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No recipes match &ldquo;{query}&rdquo;.</p>
          <button
            onClick={() => setQuery("")}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Clear search
          </button>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map(({ recipe, calc }) => {
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
                          <span className="text-gray-500">
                            ({stats.review_count})
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="ml-2">
                      <RowActions recipe={recipe} />
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Cost per portion</span>
                      <p className="font-medium text-emerald-700">
                        {formatLei(calc.costPerPortion)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Calories per portion</span>
                      <p className="font-medium text-gray-900">
                        {Math.round(calc.perPortion.calories)} kcal
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Protein</span>
                      <p className="font-medium text-gray-900">{g(calc.perPortion.protein)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Carbs</span>
                      <p className="font-medium text-gray-900">{g(calc.perPortion.carbs)}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Fat</span>
                      <p className="font-medium text-gray-900">{g(calc.perPortion.fat)}</p>
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
                            {formatLei(calc.totalCost)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Fiber/p</span>
                          <p className="font-medium text-gray-900">
                            {g(calc.perPortion.fiber)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Sugar/p</span>
                          <p className="font-medium text-gray-900">
                            {g(calc.perPortion.sugar)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Sat Fat/p</span>
                          <p className="font-medium text-gray-900">
                            {g(calc.perPortion.sat_fat)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500">Salt/p</span>
                          <p className="font-medium text-gray-900">
                            {g(calc.perPortion.salt)}
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
                      {(recipe.source_url || (recipe.instructions?.length ?? 0) > 0) && (
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                        {recipe.source_url && (
                          <a
                            href={recipe.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                          >
                            Source <ExternalLink size={12} />
                          </a>
                        )}
                        {(recipe.instructions?.length ?? 0) > 0 && (
                          <span>{recipe.instructions.length} {recipe.instructions.length === 1 ? "step" : "steps"}</span>
                        )}
                      </p>
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
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Calories</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Protein</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Carbs</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Fat</th>
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ recipe, calc }) => {
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
                                  <span className="text-gray-500">
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
                            {formatLei(calc.costPerPortion)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {Math.round(calc.perPortion.calories)} kcal
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {g(calc.perPortion.protein)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {g(calc.perPortion.carbs)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {g(calc.perPortion.fat)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <RowActions recipe={recipe} />
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
                                      {formatLei(calc.totalCost)}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Fiber/p</span>
                                    <p className="font-medium text-gray-900">
                                      {g(calc.perPortion.fiber)}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Sugar/p</span>
                                    <p className="font-medium text-gray-900">
                                      {g(calc.perPortion.sugar)}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Sat Fat/p</span>
                                    <p className="font-medium text-gray-900">
                                      {g(calc.perPortion.sat_fat)}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Salt/p</span>
                                    <p className="font-medium text-gray-900">
                                      {g(calc.perPortion.salt)}
                                    </p>
                                  </div>
                                  {Object.entries(calc.perPortion.micronutrients).map(
                                    ([key, val]) => (
                                      <div key={key}>
                                        <span className="text-gray-500">
                                          {humanizeSlug(key)}
                                        </span>
                                        <p className="font-medium text-gray-900">
                                          {formatNumber(val, 1)}
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
                                {(recipe.source_url || (recipe.instructions?.length ?? 0) > 0) && (
                                <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
                                  {recipe.source_url && (
                                    <a
                                      href={recipe.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                                    >
                                      Source <ExternalLink size={12} />
                                    </a>
                                  )}
                                  {(recipe.instructions?.length ?? 0) > 0 && (
                                    <span>{recipe.instructions.length} {recipe.instructions.length === 1 ? "step" : "steps"}</span>
                                  )}
                                </p>
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
        <RecipeForm key={editRecipe?.id ?? "new"} recipe={editRecipe} onClose={closeForm} />
      )}
    </div>
  );
}
