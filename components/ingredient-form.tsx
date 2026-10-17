"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  Ingredient,
  Category,
  IngredientPriceHistory,
  NutritionSearchResult,
} from "@/lib/supabase/types";
import NutritionSearch from "./nutrition-search";
import { invalidateIngredients } from "@/lib/actions/revalidate";
import BarcodeScanner from "./barcode-scanner";
import { Search, X, ChevronDown, ChevronUp, ScanBarcode, Loader2 } from "lucide-react";
import type { BarcodeLookup } from "@/lib/nutrition/open-food-facts";

export interface IngredientFormState {
  name: string;
  brand: string;
  category: string;
  quantity_purchased: number;
  unit: string;
  package_price: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sat_fat: number | null;
  salt: number | null;
  micronutrients: Record<string, number>;
  api_source: string | null;
  barcode: string | null;
}

interface IngredientFormProps {
  ingredient?: Ingredient;
  categories: Category[];
  onClose: () => void;
  /** Prefill values when creating a NEW ingredient (ignored when editing). */
  defaults?: Partial<IngredientFormState>;
  /** Called with the saved row after a successful save. */
  onSaved?: (ingredient: Ingredient) => void;
  /** Called when a scanned barcode matches an already-saved ingredient. */
  onOpenExisting?: (id: string) => void;
  /** Open the barcode scanner as soon as the form mounts. */
  startWithScanner?: boolean;
}

export default function IngredientForm({
  ingredient,
  categories,
  onClose,
  defaults,
  onSaved,
  onOpenExisting,
  startWithScanner,
}: IngredientFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [showNutritionSearch, setShowNutritionSearch] = useState(false);
  const [showScanner, setShowScanner] = useState(!!startWithScanner);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeNotice, setBarcodeNotice] = useState<
    | { kind: "existing"; id: string; name: string }
    | { kind: "not_found" }
    | { kind: "per_serving" }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [priceHistory, setPriceHistory] = useState<IngredientPriceHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [form, setForm] = useState<IngredientFormState>(() => ({
    name: ingredient?.name ?? "",
    brand: ingredient?.brand ?? "",
    category: ingredient?.category ?? "other",
    quantity_purchased: ingredient?.quantity_purchased ?? 0,
    unit: ingredient?.unit ?? "g",
    package_price: ingredient?.package_price ?? 0,
    calories: ingredient?.calories ?? null as number | null,
    protein: ingredient?.protein ?? null as number | null,
    carbs: ingredient?.carbs ?? null as number | null,
    fat: ingredient?.fat ?? null as number | null,
    fiber: ingredient?.fiber ?? null as number | null,
    sugar: ingredient?.sugar ?? null as number | null,
    sat_fat: ingredient?.sat_fat ?? null as number | null,
    salt: ingredient?.salt ?? null as number | null,
    micronutrients: ingredient?.micronutrients ?? {},
    api_source: ingredient?.api_source ?? null as string | null,
    barcode: ingredient?.barcode ?? null as string | null,
    ...(ingredient ? {} : defaults),
  }));

  useEffect(() => {
    if (!ingredient) return;
    supabase
      .from("ingredient_price_history")
      .select("*")
      .eq("ingredient_id", ingredient.id)
      .order("recorded_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setPriceHistory(data);
      });
  }, [ingredient?.id]);

  function handleNutritionSelect(result: NutritionSearchResult) {
    const r = (v: number | null) => (v !== null ? Math.round(v * 100) / 100 : null);
    const micros: Record<string, number> = {};
    for (const [k, v] of Object.entries(result.nutrition.micronutrients)) {
      micros[k] = Math.round(v * 100) / 100;
    }
    setForm((prev) => ({
      ...prev,
      ...(prev.name.trim() === "" && { name: result.name }),
      ...(prev.brand.trim() === "" && result.brand && { brand: result.brand }),
      calories: r(result.nutrition.calories),
      protein: r(result.nutrition.protein),
      carbs: r(result.nutrition.carbs),
      fat: r(result.nutrition.fat),
      fiber: r(result.nutrition.fiber),
      sugar: r(result.nutrition.sugar),
      sat_fat: r(result.nutrition.sat_fat),
      salt: r(result.nutrition.salt),
      micronutrients: micros,
      api_source: result.source,
      barcode: result.barcode,
    }));
    setShowNutritionSearch(false);
  }

  async function handleBarcodeDetected(code: string) {
    setShowScanner(false);
    setBarcodeLoading(true);
    setBarcodeNotice(null);
    try {
      const res = await fetch(`/api/nutrition/barcode?code=${encodeURIComponent(code)}`);
      if (res.status === 404) {
        setForm((prev) => ({ ...prev, barcode: code }));
        setBarcodeNotice({ kind: "not_found" });
        return;
      }
      if (!res.ok) throw new Error("lookup failed");
      const data: {
        existing?: { id: string; name: string };
        product?: BarcodeLookup;
      } = await res.json();

      if (data.existing) {
        // Same product as the one being edited: nothing to report.
        if (ingredient && data.existing.id === ingredient.id) return;
        setBarcodeNotice({ kind: "existing", ...data.existing });
        return;
      }
      if (data.product) {
        const { result, packageSize, perServingOnly } = data.product;
        handleNutritionSelect(result);
        setForm((prev) => ({
          ...prev,
          barcode: code,
          ...(!ingredient && packageSize && {
            quantity_purchased: packageSize.quantity,
            unit: packageSize.unit,
          }),
        }));
        const n = result.nutrition;
        const hasNutrition = [n.calories, n.protein, n.carbs, n.fat].some((v) => v !== null);
        if (perServingOnly && hasNutrition) setBarcodeNotice({ kind: "per_serving" });
      }
    } catch {
      setBarcodeNotice({
        kind: "error",
        message: "Barcode lookup failed. Check your connection and try again.",
      });
    } finally {
      setBarcodeLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category,
      quantity_purchased: form.quantity_purchased,
      unit: form.unit,
      package_price: form.package_price,
      calories: form.calories,
      protein: form.protein,
      carbs: form.carbs,
      fat: form.fat,
      fiber: form.fiber,
      sugar: form.sugar,
      sat_fat: form.sat_fat,
      salt: form.salt,
      micronutrients: form.micronutrients,
      api_source: form.api_source,
      barcode: form.barcode,
    };

    let result;
    if (ingredient) {
      const oldPPU = ingredient.quantity_purchased > 0
        ? ingredient.package_price / ingredient.quantity_purchased
        : 0;
      const newPPU = form.quantity_purchased > 0
        ? form.package_price / form.quantity_purchased
        : 0;

      const priceChanged = Math.abs(oldPPU - newPPU) > 1e-12;

      const updatePromise = supabase
        .from("ingredients")
        .update(payload)
        .eq("id", ingredient.id)
        .select()
        .single();

      if (priceChanged) {
        const [updateResult, historyResult] = await Promise.all([
          updatePromise,
          supabase.from("ingredient_price_history").insert({
            ingredient_id: ingredient.id,
            package_price: ingredient.package_price,
            quantity_purchased: ingredient.quantity_purchased,
            unit: ingredient.unit,
            price_per_unit: oldPPU,
          }),
        ]);
        result = updateResult;
        if (historyResult.error) {
          console.warn("Failed to record price history:", historyResult.error.message);
        }
      } else {
        result = await updatePromise;
      }
    } else {
      result = await supabase
        .from("ingredients")
        .insert(payload)
        .select()
        .single();
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
    } else {
      await invalidateIngredients();
      router.refresh();
      if (result.data) onSaved?.(result.data as Ingredient);
      onClose();
    }
  }

  function numVal(val: number | null): string {
    return val !== null ? String(val) : "";
  }

  function setNum(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [field]: value === "" ? null : parseFloat(value),
    }));
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("ro-RO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            {ingredient ? "Edit Ingredient" : "Add Ingredient"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                required
              />
            </div>
          </div>

          {/* Brand + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand
              </label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              >
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity + Unit + Price */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Package Qty *
              </label>
              <input
                type="number"
                step="any"
                value={form.quantity_purchased || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    quantity_purchased: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit
              </label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="buc">buc</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price (lei) *
              </label>
              <input
                type="number"
                step="0.01"
                value={form.package_price || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    package_price: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                required
              />
            </div>
          </div>

          {/* Price History */}
          {ingredient && priceHistory.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-xs font-medium text-gray-600">
                  Price History ({priceHistory.length})
                </span>
                {showHistory ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>
              {showHistory && (
                <div className="divide-y">
                  {priceHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="px-4 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="text-gray-500">
                        {formatDate(entry.recorded_at)}
                      </span>
                      <span className="text-gray-700">
                        {entry.package_price.toFixed(2)} lei / {entry.quantity_purchased}{entry.unit}
                      </span>
                      <span className="font-medium text-gray-900">
                        {entry.price_per_unit.toFixed(4)} lei/{entry.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Nutrition section */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Nutrition (per 100g/ml)
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  disabled={barcodeLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  {barcodeLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ScanBarcode className="w-3.5 h-3.5" />
                  )}
                  Scan barcode
                </button>
                <button
                  type="button"
                  onClick={() => setShowNutritionSearch(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <Search className="w-3.5 h-3.5" />
                  Search Nutrition API
                </button>
              </div>
            </div>

            {barcodeNotice?.kind === "existing" && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                <span>
                  Already saved as <strong>{barcodeNotice.name}</strong>
                </span>
                {onOpenExisting && (
                  <button
                    type="button"
                    onClick={() => onOpenExisting(barcodeNotice.id)}
                    className="shrink-0 px-2 py-1 font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Open it
                  </button>
                )}
              </div>
            )}
            {barcodeNotice?.kind === "not_found" && (
              <p className="mb-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700">
                Not found on Open Food Facts — try the text search
              </p>
            )}
            {barcodeNotice?.kind === "per_serving" && (
              <p className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Nutrition values may not be per 100 g — please verify them.
              </p>
            )}
            {barcodeNotice?.kind === "error" && (
              <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {barcodeNotice.message}
              </p>
            )}

            {form.api_source && (
              <p className="text-xs text-gray-500 mb-3">
                Data from: <span className="font-medium">{form.api_source}</span>
                {form.barcode && ` (barcode: ${form.barcode})`}
              </p>
            )}

            {/* Macros grid */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { key: "calories", label: "Calories", unit: "kcal" },
                { key: "protein", label: "Protein", unit: "g" },
                { key: "carbs", label: "Carbs", unit: "g" },
                { key: "fat", label: "Fat", unit: "g" },
                { key: "fiber", label: "Fiber", unit: "g" },
                { key: "sugar", label: "Sugar", unit: "g" },
                { key: "sat_fat", label: "Sat Fat", unit: "g" },
                { key: "salt", label: "Salt", unit: "g" },
              ].map(({ key, label, unit }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-0.5">
                    {label} ({unit})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={numVal((form as any)[key])}
                    onChange={(e) => setNum(key, e.target.value)}
                    className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
              ))}
            </div>

            {/* Micronutrients display */}
            {Object.keys(form.micronutrients).length > 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-2">
                  Micronutrients
                </p>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                  {Object.entries(form.micronutrients).map(([key, val]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-gray-500">
                        {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </span>
                      <span className="font-medium text-gray-700">
                        {typeof val === "number" ? val.toFixed(1) : val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              {saving ? "Saving..." : ingredient ? "Update" : "Add Ingredient"}
            </button>
          </div>
        </form>
      </div>

      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showNutritionSearch && (
        <NutritionSearch
          onSelect={handleNutritionSelect}
          onClose={() => setShowNutritionSearch(false)}
        />
      )}
    </div>
  );
}
