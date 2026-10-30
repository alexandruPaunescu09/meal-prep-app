"use client";

import { useState, useEffect, useRef } from "react";
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
import {
  Search,
  ChevronDown,
  ChevronUp,
  ScanBarcode,
  Loader2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type { BarcodeLookup } from "@/lib/nutrition/open-food-facts";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  formatDate,
  formatLei,
  formatNumber,
  formatPricePerUnit,
  humanizeSlug,
  parseDecimal,
} from "@/lib/format";

export interface IngredientFormState {
  name: string;
  brand: string;
  category: string;
  quantity_purchased: number;
  unit: string;
  /** null = price pending (RI-0c). */
  package_price: number | null;
  piece_weight_g: number | null;
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

type NutKey =
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "sugar"
  | "sat_fat"
  | "salt";

const NUTRITION_FIELDS: { key: NutKey; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sugar", label: "Sugar", unit: "g" },
  { key: "sat_fat", label: "Saturated fat", unit: "g" },
  { key: "salt", label: "Salt", unit: "g" },
];

/** All text-input state; numbers are kept as strings while typing. */
interface Values {
  name: string;
  brand: string;
  category: string;
  qty: string;
  unit: string;
  price: string;
  /** Price pending: saves package_price = NULL (the next receipt sets it). */
  pricePending: boolean;
  /** Package qty was filled by the pending-price default, not typed by the admin. */
  qtyAutofilled: boolean;
  pieceWeight: string;
  nut: Record<NutKey, string>;
  micronutrients: Record<string, number>;
  api_source: string | null;
  barcode: string | null;
}

function numToStr(n: number | null | undefined): string {
  return n === null || n === undefined || n === 0 ? "" : String(n);
}

function nutToStr(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

function buildInitial(
  ingredient: Ingredient | undefined,
  defaults: Partial<IngredientFormState> | undefined
): Values {
  const src: Partial<IngredientFormState> = ingredient
    ? {
        name: ingredient.name,
        brand: ingredient.brand ?? "",
        category: ingredient.category,
        quantity_purchased: ingredient.quantity_purchased,
        unit: ingredient.unit,
        package_price: ingredient.package_price,
        piece_weight_g: ingredient.piece_weight_g,
        calories: ingredient.calories,
        protein: ingredient.protein,
        carbs: ingredient.carbs,
        fat: ingredient.fat,
        fiber: ingredient.fiber,
        sugar: ingredient.sugar,
        sat_fat: ingredient.sat_fat,
        salt: ingredient.salt,
        micronutrients: ingredient.micronutrients ?? {},
        api_source: ingredient.api_source,
        barcode: ingredient.barcode,
      }
    : { ...(defaults ?? {}) };
  return {
    name: src.name ?? "",
    brand: src.brand ?? "",
    category: src.category ?? "other",
    qty: numToStr(src.quantity_purchased),
    unit: src.unit ?? "g",
    price: numToStr(src.package_price),
    pricePending: ingredient ? ingredient.package_price == null : src.package_price === null,
    qtyAutofilled: false,
    pieceWeight: numToStr(src.piece_weight_g),
    nut: {
      calories: nutToStr(src.calories),
      protein: nutToStr(src.protein),
      carbs: nutToStr(src.carbs),
      fat: nutToStr(src.fat),
      fiber: nutToStr(src.fiber),
      sugar: nutToStr(src.sugar),
      sat_fat: nutToStr(src.sat_fat),
      salt: nutToStr(src.salt),
    },
    micronutrients: src.micronutrients ?? {},
    api_source: src.api_source ?? null,
    barcode: src.barcode ?? null,
  };
}

const round2 = (v: number | null): string =>
  v !== null ? String(Math.round(v * 100) / 100) : "";

const INPUT =
  "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm";

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
  const confirm = useConfirm();
  const toast = useToast();
  const [showNutritionSearch, setShowNutritionSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  const nameRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const [v, setV] = useState<Values>(() => buildInitial(ingredient, defaults));
  const [initialJson] = useState(() => JSON.stringify(v));
  const isDirty = JSON.stringify(v) !== initialJson;

  // Latest values for async handlers.
  const vRef = useRef(v);
  useEffect(() => {
    vRef.current = v;
  });

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredient?.id]);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error]);

  async function handleNutritionSelect(result: NutritionSearchResult) {
    const cur = vRef.current;
    const incoming: Record<NutKey, string> = {
      calories: round2(result.nutrition.calories),
      protein: round2(result.nutrition.protein),
      carbs: round2(result.nutrition.carbs),
      fat: round2(result.nutrition.fat),
      fiber: round2(result.nutrition.fiber),
      sugar: round2(result.nutrition.sugar),
      sat_fat: round2(result.nutrition.sat_fat),
      salt: round2(result.nutrition.salt),
    };
    const micros: Record<string, number> = {};
    for (const [k, val] of Object.entries(result.nutrition.micronutrients)) {
      micros[k] = Math.round(val * 100) / 100;
    }

    const conflicts = NUTRITION_FIELDS.filter(({ key }) => {
      const a = cur.nut[key].trim();
      const b = incoming[key];
      return a !== "" && b !== "" && parseDecimal(a) !== parseDecimal(b);
    });
    setShowNutritionSearch(false);

    let overwrite = true;
    if (conflicts.length > 0) {
      overwrite = await confirm({
        title: "Replace existing nutrition values?",
        message: `${conflicts.length} value${conflicts.length === 1 ? "" : "s"} you already entered (${conflicts
          .map((c) => c.label.toLowerCase())
          .join(", ")}) differ from this result. Replace them, or keep yours and only fill the empty fields?`,
        confirmLabel: "Replace",
        cancelLabel: "Keep mine",
      });
    }

    setV((prev) => {
      const nut = { ...prev.nut };
      for (const { key } of NUTRITION_FIELDS) {
        if (overwrite || nut[key].trim() === "") {
          if (overwrite || incoming[key] !== "") nut[key] = incoming[key];
        }
      }
      return {
        ...prev,
        name: prev.name.trim() === "" ? result.name : prev.name,
        brand: prev.brand.trim() === "" && result.brand ? result.brand : prev.brand,
        nut,
        micronutrients: overwrite ? micros : { ...micros, ...prev.micronutrients },
        api_source: overwrite ? result.source : prev.api_source ?? result.source,
        barcode: overwrite ? result.barcode : prev.barcode ?? result.barcode,
      };
    });
  }

  async function handleOpenExisting(id: string) {
    if (!onOpenExisting) return;
    if (isDirty) {
      const ok = await confirm({
        title: "Open the saved ingredient?",
        message: "The data you entered in this form will be discarded.",
        confirmLabel: "Open it",
        cancelLabel: "Stay here",
        tone: "danger",
      });
      if (!ok) return;
    }
    onOpenExisting(id);
  }

  async function handleBarcodeDetected(code: string) {
    setShowScanner(false);
    setBarcodeLoading(true);
    setBarcodeNotice(null);
    try {
      const res = await fetch(`/api/nutrition/barcode?code=${encodeURIComponent(code)}`);
      if (res.status === 404) {
        setV((prev) => ({ ...prev, barcode: code }));
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
        await handleNutritionSelect(result);
        setV((prev) => ({
          ...prev,
          barcode: code,
          ...(!ingredient && packageSize && prev.qty.trim() === ""
            ? { qty: String(packageSize.quantity), unit: packageSize.unit }
            : {}),
        }));
        const n = result.nutrition;
        const hasNutrition = [n.calories, n.protein, n.carbs, n.fat].some((x) => x !== null);
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

  const qtyNum = parseDecimal(v.qty);
  const priceNum = parseDecimal(v.price);
  const ppuPreview =
    qtyNum !== null && priceNum !== null && qtyNum > 0 && priceNum > 0
      ? formatPricePerUnit(priceNum / qtyNum, v.unit)
      : null;

  const defaultQty = (unit: string) => (unit === "buc" ? "1" : "1000");

  function setPricePending(on: boolean) {
    setV((prev) => {
      if (!on) return { ...prev, pricePending: false, qtyAutofilled: false };
      const blank = prev.qty.trim() === "";
      return {
        ...prev,
        pricePending: true,
        price: "",
        ...(blank ? { qty: defaultQty(prev.unit), qtyAutofilled: true } : {}),
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError("");

    const name = v.name.trim();
    if (!name) return setError("Name is required.");
    if (qtyNum === null || qtyNum <= 0) return setError("Package quantity must be greater than 0.");
    if (!v.pricePending && (priceNum === null || priceNum <= 0)) {
      return setError("Price must be greater than 0, or tick Price pending.");
    }
    const newPrice = v.pricePending ? null : priceNum;
    let pieceWeight: number | null = null;
    if (v.unit === "buc" && v.pieceWeight.trim() !== "") {
      pieceWeight = parseDecimal(v.pieceWeight);
      if (pieceWeight === null || pieceWeight <= 0) {
        return setError("Weight per piece must be greater than 0.");
      }
    }

    const nutPayload = {} as Record<NutKey, number | null>;
    for (const { key, label } of NUTRITION_FIELDS) {
      const raw = v.nut[key].trim();
      if (raw === "") {
        nutPayload[key] = null;
        continue;
      }
      const n = parseDecimal(raw);
      if (n === null || n < 0) return setError(`${label} must be a number of 0 or more.`);
      nutPayload[key] = n;
    }

    setSaving(true);
    const payload = {
      name,
      brand: v.brand.trim() || null,
      category: v.category,
      quantity_purchased: qtyNum,
      unit: v.unit,
      package_price: newPrice,
      piece_weight_g: pieceWeight,
      ...nutPayload,
      micronutrients: v.micronutrients,
      api_source: v.api_source,
      barcode: v.barcode,
    };

    let result;
    if (ingredient) {
      // No history row when the old price was NULL (price pending: nothing to
      // log) or the new one is (switching to pending), only on a real change.
      const oldPPU =
        ingredient.package_price != null && ingredient.quantity_purchased > 0
          ? ingredient.package_price / ingredient.quantity_purchased
          : null;
      const newPPU = newPrice != null ? newPrice / qtyNum : null;

      const priceChanged =
        oldPPU != null && newPPU != null && Math.abs(oldPPU - newPPU) > 1e-12;

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
            price_per_unit: oldPPU as number,
          }),
        ]);
        result = updateResult;
        if (historyResult.error) {
          console.warn("Failed to record price history:", historyResult.error.message);
          toast.error("Saved, but the price history entry could not be recorded.");
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
      toast.success(ingredient ? "Ingredient updated" : "Ingredient added");
      if (result.data) onSaved?.(result.data as Ingredient);
      onClose();
    }
  }

  function setNut(key: NutKey, value: string) {
    setV((prev) => ({ ...prev, nut: { ...prev.nut, [key]: value } }));
  }

  const FORM_ID = "ingredient-form";

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={ingredient ? "Edit ingredient" : "Add ingredient"}
        size="lg"
        dirty={isDirty}
        initialFocusRef={nameRef}
        footer={
          <>
            {error && (
              <p
                ref={errorRef}
                role="alert"
                className="w-full text-sm text-red-600 bg-red-50 px-3 py-2 rounded"
              >
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              form={FORM_ID}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
            >
              {saving ? "Saving..." : ingredient ? "Update" : "Add ingredient"}
            </button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="ing-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              id="ing-name"
              ref={nameRef}
              type="text"
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              className={INPUT}
              required
            />
          </div>

          {/* Brand + Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ing-brand" className="block text-sm font-medium text-gray-700 mb-1">
                Brand
              </label>
              <input
                id="ing-brand"
                type="text"
                value={v.brand}
                onChange={(e) => setV({ ...v, brand: e.target.value })}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="ing-cat" className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                id="ing-cat"
                value={v.category}
                onChange={(e) => setV({ ...v, category: e.target.value })}
                className={INPUT}
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
          <div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label htmlFor="ing-qty" className="block text-sm font-medium text-gray-700 mb-1">
                  Package qty *
                </label>
                <input
                  id="ing-qty"
                  type="text"
                  inputMode="decimal"
                  value={v.qty}
                  onChange={(e) => setV({ ...v, qty: e.target.value, qtyAutofilled: false })}
                  className={INPUT}
                  required
                />
              </div>
              <div>
                <label htmlFor="ing-unit" className="block text-sm font-medium text-gray-700 mb-1">
                  Unit
                </label>
                <select
                  id="ing-unit"
                  value={v.unit}
                  onChange={(e) =>
                    setV({
                      ...v,
                      unit: e.target.value,
                      ...(v.qtyAutofilled ? { qty: defaultQty(e.target.value) } : {}),
                    })
                  }
                  className={INPUT}
                  title="g = grams, ml = millilitres, buc = pieces"
                >
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="buc">buc (pieces)</option>
                </select>
              </div>
              <div>
                <label htmlFor="ing-price" className="block text-sm font-medium text-gray-700 mb-1">
                  Price (lei){v.pricePending ? "" : " *"}
                </label>
                <input
                  id="ing-price"
                  type="text"
                  inputMode="decimal"
                  value={v.pricePending ? "" : v.price}
                  onChange={(e) => setV({ ...v, price: e.target.value })}
                  className={`${INPUT} disabled:bg-gray-100 disabled:text-gray-400`}
                  disabled={v.pricePending}
                  placeholder={v.pricePending ? "Price pending" : undefined}
                  required={!v.pricePending}
                />
              </div>
            </div>
            {v.unit === "buc" && (
              <div className="mt-3 max-w-xs">
                <label htmlFor="ing-piece-weight" className="block text-sm font-medium text-gray-700 mb-1">
                  Weight per piece (g)
                </label>
                <input
                  id="ing-piece-weight"
                  type="text"
                  inputMode="decimal"
                  value={v.pieceWeight}
                  onChange={(e) => setV({ ...v, pieceWeight: e.target.value })}
                  className={`${INPUT} text-base md:text-sm`}
                  placeholder="e.g. 55"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional. Lets recipes count pieces in grams for nutrition. Assumes the values below are per 100 g.
                </p>
              </div>
            )}
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={v.pricePending}
                onChange={(e) => setPricePending(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Price pending
              <span className="text-xs text-gray-500">(the next receipt import sets it)</span>
            </label>
            {v.pricePending && v.qtyAutofilled && (
              <p className="mt-1 text-xs text-amber-700">
                Package size set to {v.qty} {v.unit} as a placeholder; the next receipt sets the real size.
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-500 min-h-4">
              {v.pricePending ? (
                "Cost calculations will show this ingredient as having no price."
              ) : ppuPreview ? (
                <>
                  = <span className="font-medium text-emerald-700">{ppuPreview}</span>
                </>
              ) : (
                "Enter the package size and price to see the price per kg / l / piece."
              )}
            </p>
          </div>

          {/* Price History */}
          {ingredient && priceHistory.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                aria-expanded={showHistory}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <span className="text-xs font-medium text-gray-600">
                  Price history ({priceHistory.length}
                  {priceHistory.length >= 10 ? ", last 10 shown" : ""})
                </span>
                {showHistory ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>
              {showHistory && (
                <div className="divide-y">
                  {priceHistory.map((entry, i) => {
                    const older = priceHistory[i + 1];
                    const diff = older ? entry.price_per_unit - older.price_per_unit : 0;
                    return (
                      <div
                        key={entry.id}
                        className="px-4 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs"
                      >
                        <span className="text-gray-500">{formatDate(entry.recorded_at)}</span>
                        <span className="text-gray-700">
                          {formatLei(entry.package_price)} / {formatNumber(entry.quantity_purchased, 0)}
                          {entry.unit}
                        </span>
                        <span className="font-medium text-gray-900 flex items-center gap-1">
                          {formatPricePerUnit(entry.price_per_unit, entry.unit)}
                          {older && diff > 1e-12 && (
                            <ArrowUp
                              className="w-3 h-3 text-red-500"
                              aria-label="Higher than the previous price"
                            />
                          )}
                          {older && diff < -1e-12 && (
                            <ArrowDown
                              className="w-3 h-3 text-green-600"
                              aria-label="Lower than the previous price"
                            />
                          )}
                        </span>
                      </div>
                    );
                  })}
                  {priceHistory.length >= 10 && (
                    <p className="px-4 py-2 text-xs text-gray-400">Showing the last 10 changes.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Nutrition section */}
          <div className="border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-gray-700">Nutrition</h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  disabled={barcodeLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  {barcodeLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ScanBarcode className="w-4 h-4" />
                  )}
                  Scan barcode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setShowNutritionSearch(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  Search nutrition
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Values per 100 g / 100 ml. Leave blank if unknown.
            </p>

            {barcodeNotice?.kind === "existing" && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                <span>
                  Already saved as <strong>{barcodeNotice.name}</strong>
                </span>
                {onOpenExisting && (
                  <button
                    type="button"
                    onClick={() => void handleOpenExisting(barcodeNotice.id)}
                    className="shrink-0 px-2 py-1 font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Open it
                  </button>
                )}
              </div>
            )}
            {barcodeNotice?.kind === "not_found" && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700">
                <span>Not found on Open Food Facts.</span>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery(v.name.trim());
                    setShowNutritionSearch(true);
                  }}
                  className="shrink-0 px-2 py-1 font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700"
                >
                  Search by name
                </button>
              </div>
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

            {v.api_source && (
              <p className="text-xs text-gray-500 mb-3">
                Data from: <span className="font-medium">{v.api_source}</span>
                {v.barcode && ` (barcode: ${v.barcode})`}
              </p>
            )}

            {/* Macros grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {NUTRITION_FIELDS.map(({ key, label, unit }) => (
                <div key={key}>
                  <label htmlFor={`ing-nut-${key}`} className="block text-xs text-gray-500 mb-0.5">
                    {label} ({unit})
                  </label>
                  <input
                    id={`ing-nut-${key}`}
                    type="text"
                    inputMode="decimal"
                    value={v.nut[key]}
                    onChange={(e) => setNut(key, e.target.value)}
                    className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                  />
                </div>
              ))}
            </div>

            {/* Micronutrients display */}
            {Object.keys(v.micronutrients).length > 0 && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-600 mb-2">Micronutrients</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
                  {Object.entries(v.micronutrients).map(([key, val]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-gray-500">
                        {humanizeSlug(key)}
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
        </form>
      </Modal>

      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showNutritionSearch && (
        <NutritionSearch
          initialQuery={searchQuery || undefined}
          onSelect={handleNutritionSelect}
          onClose={() => setShowNutritionSearch(false)}
        />
      )}
    </>
  );
}
