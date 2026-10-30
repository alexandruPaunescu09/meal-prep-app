"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  Recipe,
  RecipeIngredient,
  Ingredient,
  ContainerType,
  SaveRecipeInput,
  SaveRecipeIngredientInput,
} from "@/lib/supabase/types";
import { calculateRecipe, RecipeCalculation } from "@/lib/calculations/recipe";
import { nutritionGrams, missingPieceWeight } from "@/lib/calculations/piece-weight";
import { invalidateRecipes } from "@/lib/actions/revalidate";
import { formatLei, formatNumber, formatPricePerUnit, humanizeSlug, parseDecimal } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Plus, Trash2, Search, Check, ArrowUp, ArrowDown, ExternalLink } from "lucide-react";
import {
  moveItem,
  normalizeSourceUrl,
  normalizeSteps,
  validateSourceUrl,
  validateSteps,
} from "@/lib/recipes/steps";
import { RECIPE_STEP_MAX_COUNT, RECIPE_STEP_MAX_LENGTH } from "@/lib/validations/schemas";

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
  /** Raw text so partial input ("0.", "") is preserved while typing. */
  qty: string;
}

interface StepEntry {
  id: string;
  text: string;
}

const PICKER_LIMIT = 100;

/** Lower = better match. */
function relevance(ing: Ingredient, q: string): number {
  const name = ing.name.toLowerCase();
  const brand = (ing.brand ?? "").toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.split(/[\s,()-]+/).some((w) => w.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  if (brand.startsWith(q)) return 3;
  if (brand.includes(q)) return 4;
  return -1;
}

function qtyToNumber(qty: string): number {
  return parseDecimal(qty) ?? 0;
}

const inputCls =
  "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm";

export default function RecipeForm({ recipe, onClose }: RecipeFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ingredientsError, setIngredientsError] = useState("");
  const [portionsError, setPortionsError] = useState("");

  const [name, setName] = useState(recipe?.name ?? "");
  const [portionsStr, setPortionsStr] = useState(String(recipe?.portions ?? 1));
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const [customerDescription, setCustomerDescription] = useState(
    recipe?.customer_description ?? ""
  );
  const [finalWeightStr, setFinalWeightStr] = useState(
    recipe?.final_weight != null ? String(recipe.final_weight) : ""
  );
  const [containerTypeId, setContainerTypeId] = useState<string | null>(
    recipe?.container_type_id ?? null
  );

  const [sourceUrl, setSourceUrl] = useState(recipe?.source_url ?? "");
  const [sourceUrlError, setSourceUrlError] = useState("");
  const [steps, setSteps] = useState<StepEntry[]>(
    (recipe?.instructions ?? []).map((text) => ({ id: crypto.randomUUID(), text }))
  );
  const [stepsError, setStepsError] = useState("");

  const [entries, setEntries] = useState<IngredientEntry[]>(
    recipe?.recipe_ingredients.map((ri) => ({
      id: ri.id,
      ingredient: ri.ingredient,
      qty: String(ri.quantity),
    })) ?? []
  );

  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  const [ingredientsLoaded, setIngredientsLoaded] = useState(false);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const focusEntryId = useRef<string | null>(null);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());

  const snapshot = (
    n: string,
    p: string,
    no: string,
    cd: string,
    fw: string,
    ct: string | null,
    es: IngredientEntry[],
    su: string,
    st: StepEntry[]
  ) =>
    JSON.stringify([
      n,
      p,
      no,
      cd,
      fw,
      ct,
      es.map((e) => [e.ingredient.id, e.qty]),
      su,
      st.map((x) => x.text),
    ]);
  const [initialSnapshot] = useState(() =>
    snapshot(name, portionsStr, notes, customerDescription, finalWeightStr, containerTypeId, entries, sourceUrl, steps)
  );
  const isDirty =
    snapshot(name, portionsStr, notes, customerDescription, finalWeightStr, containerTypeId, entries, sourceUrl, steps) !==
    initialSnapshot;

  useEffect(() => {
    supabase
      .from("ingredients")
      .select("*")
      .order("name")
      .then(({ data, error: err }) => {
        if (err) toast.error(`Could not load ingredients: ${err.message}`);
        if (data) setAllIngredients(data as Ingredient[]);
        setIngredientsLoaded(true);
      });
    supabase
      .from("container_types")
      .select("*")
      .order("name")
      .then(({ data }) => {
        if (data) setContainerTypes(data as ContainerType[]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move focus to the newly added row's quantity once the picker has closed.
  useEffect(() => {
    if (showPicker || !focusEntryId.current) return;
    const id = focusEntryId.current;
    focusEntryId.current = null;
    const raf = requestAnimationFrame(() => {
      const el = qtyRefs.current.get(id);
      el?.focus();
      el?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [showPicker]);

  const usedIds = useMemo(
    () => new Set(entries.map((e) => e.ingredient.id)),
    [entries]
  );

  const pickerResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allIngredients;
    return allIngredients
      .map((ing) => ({ ing, score: relevance(ing, q) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.ing.name.localeCompare(b.ing.name))
      .map((x) => x.ing);
  }, [allIngredients, searchQuery]);

  const portions = parseInt(portionsStr, 10);
  const portionsValid = Number.isInteger(portions) && portions >= 1;

  const calc: RecipeCalculation = useMemo(() => {
    return calculateRecipe(
      entries.map((e) => ({ ingredient: e.ingredient, quantity: qtyToNumber(e.qty) })),
      portionsValid ? portions : 1
    );
  }, [entries, portions, portionsValid]);

  const finalWeight = parseDecimal(finalWeightStr);

  function addIngredient(ingredient: Ingredient) {
    if (usedIds.has(ingredient.id)) return;
    const id = crypto.randomUUID();
    setEntries((prev) => [...prev, { id, ingredient, qty: "100" }]);
    focusEntryId.current = id;
    setIngredientsError("");
  }

  function updateQty(id: string, qty: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, qty } : e)));
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  function closePicker() {
    setShowPicker(false);
    setSearchQuery("");
  }

  async function handleCancel() {
    if (isDirty) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "Your changes will be lost.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        tone: "danger",
      });
      if (!ok) return;
    }
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError("");
    setIngredientsError("");
    setPortionsError("");

    let invalid = false;
    if (!portionsValid || !/^\d+$/.test(portionsStr.trim())) {
      setPortionsError("Enter a whole number of portions (1 or more).");
      invalid = true;
    }
    if (entries.length === 0) {
      setIngredientsError("Add at least one ingredient.");
      invalid = true;
    } else if (entries.some((en) => qtyToNumber(en.qty) <= 0)) {
      setIngredientsError("Every ingredient needs a quantity greater than 0.");
      invalid = true;
    }
    if (finalWeightStr.trim() !== "" && (finalWeight == null || finalWeight < 0)) {
      setError("Final weight must be a number.");
      invalid = true;
    }
    const urlErr = validateSourceUrl(sourceUrl);
    setSourceUrlError(urlErr ?? "");
    if (urlErr) invalid = true;
    const stepsErr = validateSteps(steps.map((x) => x.text));
    setStepsError(stepsErr ?? "");
    if (stepsErr) invalid = true;
    if (invalid) return;

    setSaving(true);

    const p_recipe: SaveRecipeInput = {
      name: name.trim(),
      portions,
      final_weight: finalWeightStr.trim() === "" ? null : finalWeight,
      notes: notes.trim() || null,
      customer_description: customerDescription.trim() || null,
      container_type_id: containerTypeId,
      source_url: normalizeSourceUrl(sourceUrl),
      instructions: normalizeSteps(steps.map((x) => x.text)),
    };
    const p_ingredients: SaveRecipeIngredientInput[] = entries.map((en) => ({
      ingredient_id: en.ingredient.id,
      quantity: qtyToNumber(en.qty),
    }));

    const { error: rpcErr } = await supabase.rpc("save_recipe", {
      p_recipe_id: recipe?.id ?? null,
      p_recipe,
      p_ingredients,
    });

    if (rpcErr) {
      setError(rpcErr.message);
      toast.error(`Could not save recipe: ${rpcErr.message}`);
      setSaving(false);
      return;
    }

    await invalidateRecipes();
    router.refresh();
    toast.success(recipe ? "Recipe updated" : "Recipe created");
    onClose();
  }

  const footer = (
    <>
      <button
        type="button"
        onClick={handleCancel}
        className="py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="recipe-form"
        disabled={saving}
        className="py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
      >
        {saving ? "Saving..." : recipe ? "Update Recipe" : "Create Recipe"}
      </button>
    </>
  );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={recipe ? "Edit Recipe" : "New Recipe"}
        size="xl"
        dirty={isDirty}
        footer={footer}
      >
        <form id="recipe-form" onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Name + Portions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="recipe-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <input
                id="recipe-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="recipe-portions" className="block text-sm font-medium text-gray-700 mb-1">
                Portions *
              </label>
              <input
                id="recipe-portions"
                type="text"
                inputMode="numeric"
                value={portionsStr}
                onChange={(e) => {
                  setPortionsStr(e.target.value);
                  setPortionsError("");
                }}
                aria-invalid={portionsError ? true : undefined}
                aria-describedby={portionsError ? "recipe-portions-err" : undefined}
                className={inputCls}
              />
              {portionsError && (
                <p id="recipe-portions-err" className="text-xs text-red-600 mt-1">
                  {portionsError}
                </p>
              )}
            </div>
          </div>

          {/* Container Type */}
          {containerTypes.length > 0 && (
            <div>
              <label htmlFor="recipe-container" className="block text-sm font-medium text-gray-700 mb-1">
                Container Type
              </label>
              <select
                id="recipe-container"
                value={containerTypeId ?? ""}
                onChange={(e) => setContainerTypeId(e.target.value || null)}
                className={inputCls}
              >
                <option value="">No container assigned</option>
                {containerTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                    {ct.volume_ml ? ` (${ct.volume_ml}ml)` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Final Weight */}
          <div>
            <label htmlFor="recipe-weight" className="block text-sm font-medium text-gray-700 mb-1">
              Final Weight (g)
            </label>
            <input
              id="recipe-weight"
              type="text"
              inputMode="decimal"
              value={finalWeightStr}
              onChange={(e) => setFinalWeightStr(e.target.value)}
              placeholder="Optional — total cooked/prepared weight"
              className={inputCls}
            />
            {finalWeight != null && finalWeight > 0 && portionsValid && (
              <p className="text-xs text-gray-500 mt-1">
                {Math.round(finalWeight / portions)}g per portion
              </p>
            )}
          </div>

          {/* Ingredients */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Ingredients ({entries.length})
              </h3>
              <div className="flex items-center gap-3">
                {ingredientsError && (
                  <p role="alert" className="text-xs text-red-600">
                    {ingredientsError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Ingredient
                </button>
              </div>
            </div>

            {entries.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No ingredients added yet.
              </p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => {
                  const q = qtyToNumber(entry.qty);
                  const rowCost = q * entry.ingredient.price_per_unit;
                  const rowKcal = ((entry.ingredient.calories ?? 0) * nutritionGrams(entry.ingredient, q)) / 100;
                  return (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-50 rounded-lg px-3 py-2"
                    >
                      <div className="flex-1 min-w-[8rem]">
                        <p className="text-sm font-medium text-gray-900">
                          {entry.ingredient.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatLei(rowCost)} · {Math.round(rowKcal)} kcal
                        </p>
                        {missingPieceWeight(entry.ingredient) && (
                          <p className="text-xs text-amber-700">
                            Counts as grams until you set a weight per piece
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          ref={(el) => {
                            if (el) qtyRefs.current.set(entry.id, el);
                            else qtyRefs.current.delete(entry.id);
                          }}
                          type="text"
                          inputMode="decimal"
                          aria-label={`Quantity of ${entry.ingredient.name} in ${entry.ingredient.unit}`}
                          value={entry.qty}
                          onChange={(e) => updateQty(entry.id, e.target.value)}
                          className="w-20 px-2 py-1.5 border rounded text-sm text-gray-900 text-right focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                        <span className="text-xs text-gray-500 w-9">
                          {entry.ingredient.unit}
                        </span>
                      </div>
                      <IconButton
                        label={`Remove ${entry.ingredient.name}`}
                        tone="danger"
                        onClick={() => removeEntry(entry.id)}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live summary (sticky while editing ingredients) */}
          {entries.length > 0 && (
            <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t pt-3 pb-1">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Per Portion Summary
              </h3>
              <div className="grid grid-cols-5 gap-2">
                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Cost</p>
                  <p className="text-sm font-bold text-emerald-700">
                    {formatLei(calc.costPerPortion)}
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
                    {formatNumber(calc.perPortion.protein, 1)}g
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Carbs</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatNumber(calc.perPortion.carbs, 1)}g
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-500">Fat</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatNumber(calc.perPortion.fat, 1)}g
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                Total cost: {formatLei(calc.totalCost)} for {portionsValid ? portions : 1} portion
                {(portionsValid ? portions : 1) > 1 ? "s" : ""}
              </p>
            </div>
          )}

          {/* Customer-facing description */}
          <div>
            <label htmlFor="recipe-desc" className="block text-sm font-medium text-gray-700 mb-1">
              Customer description
            </label>
            <textarea
              id="recipe-desc"
              value={customerDescription}
              onChange={(e) => setCustomerDescription(e.target.value)}
              rows={2}
              placeholder="Shown to clients in the portal — short blurb about the dish."
              className={`${inputCls} resize-none`}
            />
            <p className="text-xs text-gray-500 mt-1">
              Visible in the customer portal. Notes below stay internal.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="recipe-notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="recipe-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Source link */}
          <div>
            <label htmlFor="recipe-source-url" className="block text-sm font-medium text-gray-700 mb-1">
              Source link
            </label>
            <input
              id="recipe-source-url"
              type="url"
              inputMode="url"
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
                setSourceUrlError("");
              }}
              placeholder="https://..."
              aria-invalid={sourceUrlError ? true : undefined}
              className={inputCls}
            />
            {sourceUrlError && <p className="text-xs text-red-600 mt-1">{sourceUrlError}</p>}
            {!sourceUrlError && validateSourceUrl(sourceUrl) === null && normalizeSourceUrl(sourceUrl) && (
              <a
                href={normalizeSourceUrl(sourceUrl)!}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
              >
                <ExternalLink size={12} /> Open source
              </a>
            )}
          </div>

          {/* Steps */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="block text-sm font-medium text-gray-700">Steps</span>
              <button
                type="button"
                onClick={() => setSteps((prev) => [...prev, { id: crypto.randomUUID(), text: "" }])}
                disabled={steps.length >= RECIPE_STEP_MAX_COUNT}
                className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline disabled:opacity-40"
              >
                <Plus size={14} /> Add step
              </button>
            </div>
            {steps.length === 0 ? (
              <p className="text-xs text-gray-500">No steps yet.</p>
            ) : (
              <ol className="space-y-2">
                {steps.map((step, i) => (
                  <li key={step.id} className="flex items-start gap-2">
                    <span className="mt-2 w-5 shrink-0 text-right text-sm text-gray-500">{i + 1}.</span>
                    <textarea
                      aria-label={`Step ${i + 1}`}
                      value={step.text}
                      maxLength={RECIPE_STEP_MAX_LENGTH}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((x) => (x.id === step.id ? { ...x, text: e.target.value } : x))
                        )
                      }
                      rows={2}
                      className={`${inputCls} resize-none`}
                    />
                    <div className="flex shrink-0">
                      <IconButton
                        label={`Move step ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => setSteps((prev) => moveItem(prev, i, -1))}
                      >
                        <ArrowUp size={16} />
                      </IconButton>
                      <IconButton
                        label={`Move step ${i + 1} down`}
                        disabled={i === steps.length - 1}
                        onClick={() => setSteps((prev) => moveItem(prev, i, 1))}
                      >
                        <ArrowDown size={16} />
                      </IconButton>
                      <IconButton
                        label={`Remove step ${i + 1}`}
                        tone="danger"
                        onClick={() => setSteps((prev) => prev.filter((x) => x.id !== step.id))}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {stepsError && <p className="text-xs text-red-600 mt-1">{stepsError}</p>}
            <p className="text-xs text-gray-500 mt-1">Internal for now. Empty steps are dropped on save.</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}
        </form>
      </Modal>

      {/* Ingredient picker (multi-add) */}
      <Modal
        open={showPicker}
        onClose={closePicker}
        title="Pick Ingredients"
        size="md"
        footer={
          <button
            type="button"
            onClick={closePicker}
            className="py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
          >
            Done{entries.length > 0 ? ` (${entries.length} added)` : ""}
          </button>
        }
      >
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or brand..."
            aria-label="Search ingredients"
            className="w-full pl-10 pr-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
          />
        </div>
        {!ingredientsLoaded ? (
          <p className="text-sm text-gray-500 text-center py-4">Loading ingredients...</p>
        ) : allIngredients.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500">Your ingredient library is empty.</p>
            <Link
              href="/ingredients?new=1"
              className="mt-2 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              Create your first ingredient
            </Link>
          </div>
        ) : pickerResults.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No ingredients match &ldquo;{searchQuery}&rdquo;.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {pickerResults.slice(0, PICKER_LIMIT).map((ing) => {
                const added = usedIds.has(ing.id);
                return (
                  <li key={ing.id}>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => addIngredient(ing)}
                      className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg hover:bg-emerald-50 disabled:hover:bg-transparent text-sm transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-gray-900">{ing.name}</span>
                        {ing.brand && (
                          <span className="ml-1 text-xs text-gray-500">({ing.brand})</span>
                        )}
                        <span className="block text-xs text-gray-500">
                          {humanizeSlug(ing.category)} ·{" "}
                          {formatPricePerUnit(ing.price_per_unit, ing.unit)}
                        </span>
                      </span>
                      {added && (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0">
                          <Check className="w-3.5 h-3.5" />
                          Added
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {pickerResults.length > PICKER_LIMIT && (
              <p className="text-xs text-gray-500 text-center pt-2">
                Showing {PICKER_LIMIT} of {pickerResults.length} — type to narrow down.
              </p>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
