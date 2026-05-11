"use client";

import { useState, Fragment } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Ingredient, IngredientCategory } from "@/lib/supabase/types";
import IngredientForm from "@/components/ingredient-form";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const CATEGORIES: { value: IngredientCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "protein", label: "Protein" },
  { value: "dairy", label: "Dairy" },
  { value: "grains", label: "Grains" },
  { value: "fruits", label: "Fruits" },
  { value: "vegetables", label: "Vegetables" },
  { value: "fats", label: "Fats" },
  { value: "nuts_seeds", label: "Nuts & Seeds" },
  { value: "supplements", label: "Supplements" },
  { value: "bakery", label: "Bakery" },
  { value: "other", label: "Other" },
];

export default function IngredientsClient({
  ingredients,
}: {
  ingredients: Ingredient[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [filter, setFilter] = useState<IngredientCategory | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editIngredient, setEditIngredient] = useState<Ingredient | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered =
    filter === "all"
      ? ingredients
      : ingredients.filter((i) => i.category === filter);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await supabase.from("ingredients").delete().eq("id", id);
    router.refresh();
  }

  function openEdit(ingredient: Ingredient) {
    setEditIngredient(ingredient);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditIngredient(undefined);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ingredients</h1>
          <p className="text-sm text-gray-500 mt-1">
            {ingredients.length} ingredients in database
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Ingredient
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilter(cat.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              filter === cat.value
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No ingredients yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Add your first ingredient
          </button>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((ing) => (
              <div
                key={ing.id}
                className="bg-white rounded-xl border p-4"
                onClick={() =>
                  setExpandedId(expandedId === ing.id ? null : ing.id)
                }
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-gray-900">{ing.name}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      {ing.category.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(ing);
                      }}
                      className="p-1.5 rounded hover:bg-gray-100"
                    >
                      <Pencil className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(ing.id, ing.name);
                      }}
                      className="p-1.5 rounded hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Price/unit</span>
                    <p className="font-medium text-emerald-700">
                      {ing.price_per_unit.toFixed(4)} lei
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Cal</span>
                    <p className="font-medium text-gray-900">
                      {ing.calories ?? "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">P / C / F</span>
                    <p className="font-medium text-gray-900">
                      {ing.protein ?? "—"} / {ing.carbs ?? "—"} / {ing.fat ?? "—"}
                    </p>
                  </div>
                </div>
                {expandedId === ing.id && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Qty</span>
                        <p className="font-medium text-gray-900">
                          {ing.quantity_purchased} {ing.unit}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Package</span>
                        <p className="font-medium text-gray-900">
                          {ing.package_price.toFixed(2)} lei
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Fiber</span>
                        <p className="font-medium text-gray-900">
                          {ing.fiber !== null ? `${ing.fiber}g` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Sugar</span>
                        <p className="font-medium text-gray-900">
                          {ing.sugar !== null ? `${ing.sugar}g` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Sat Fat</span>
                        <p className="font-medium text-gray-900">
                          {ing.sat_fat !== null ? `${ing.sat_fat}g` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Salt</span>
                        <p className="font-medium text-gray-900">
                          {ing.salt !== null ? `${ing.salt}g` : "—"}
                        </p>
                      </div>
                      {Object.entries(ing.micronutrients || {}).map(
                        ([key, val]) => (
                          <div key={key}>
                            <span className="text-gray-500">
                              {key
                                .replace(/_/g, " ")
                                .replace(/\b\w/g, (c) => c.toUpperCase())}
                            </span>
                            <p className="font-medium text-gray-900">
                              {typeof val === "number" ? val.toFixed(1) : val}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                    {ing.api_source && (
                      <p className="mt-2 text-xs text-gray-400">
                        Source: {ing.api_source}
                        {ing.barcode && ` • Barcode: ${ing.barcode}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Name
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      Category
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      Qty
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      Price
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      Price/unit
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      Cal
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      P
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      C
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">
                      F
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ing) => (
                    <Fragment key={ing.id}>
                      <tr
                        className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          setExpandedId(expandedId === ing.id ? null : ing.id)
                        }
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-2">
                            {expandedId === ing.id ? (
                              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            )}
                            {ing.name}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {ing.category.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.quantity_purchased} {ing.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.package_price.toFixed(2)} lei
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {ing.price_per_unit.toFixed(4)} lei
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.calories ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.protein !== null ? `${ing.protein}g` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.carbs !== null ? `${ing.carbs}g` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.fat !== null ? `${ing.fat}g` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(ing);
                              }}
                              className="p-1.5 rounded hover:bg-gray-100"
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-500" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(ing.id, ing.name);
                              }}
                              className="p-1.5 rounded hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === ing.id && (
                        <tr key={`${ing.id}-details`} className="border-b">
                          <td colSpan={10} className="px-4 py-3 bg-gray-50">
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 text-xs">
                              <div>
                                <span className="text-gray-500">Fiber</span>
                                <p className="font-medium text-gray-900">
                                  {ing.fiber !== null ? `${ing.fiber}g` : "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Sugar</span>
                                <p className="font-medium text-gray-900">
                                  {ing.sugar !== null ? `${ing.sugar}g` : "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Sat Fat</span>
                                <p className="font-medium text-gray-900">
                                  {ing.sat_fat !== null ? `${ing.sat_fat}g` : "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Salt</span>
                                <p className="font-medium text-gray-900">
                                  {ing.salt !== null ? `${ing.salt}g` : "—"}
                                </p>
                              </div>
                              {Object.entries(ing.micronutrients || {}).map(
                                ([key, val]) => (
                                  <div key={key}>
                                    <span className="text-gray-500">
                                      {key
                                        .replace(/_/g, " ")
                                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                                    </span>
                                    <p className="font-medium text-gray-900">
                                      {typeof val === "number"
                                        ? val.toFixed(1)
                                        : val}
                                    </p>
                                  </div>
                                )
                              )}
                            </div>
                            {ing.api_source && (
                              <p className="mt-2 text-xs text-gray-400">
                                Source: {ing.api_source}
                                {ing.barcode && ` • Barcode: ${ing.barcode}`}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Form modal */}
      {showForm && (
        <IngredientForm ingredient={editIngredient} onClose={closeForm} />
      )}
    </div>
  );
}
