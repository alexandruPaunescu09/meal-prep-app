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
import { formatCost, formatLei, formatNumber, formatPricePerUnit, humanizeSlug, parseDecimal } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Plus, Trash2, Search, Check, ExternalLink, ArrowDown, ArrowUp } from "lucide-react";
import {
  chipDefault,
  isCalorieDense,
  pickSeasoningChips,
  splitLines,
  type LineRole,
} from "@/lib/recipes/seasonings";
import {
  normalizeSourceUrl,
  normalizeSteps,
  validateSourceUrl,
  validateSteps,
} from "@/lib/recipes/steps";
import RecipeStepsEditor, { type StepEntry } from "@/components/recipe-steps-editor";
import ScaleRecipeModal from "@/components/scale-recipe-modal";
import { canScale, type ScaleLineInput } from "@/lib/recipes/scale";
import { qtyToText } from "@/lib/recipes/import/draft";

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
  /** Which list the line sits in. */
  role: LineRole;
  /** "To taste": saved as quantity 0 (seasonings only). */
  toTaste: boolean;
}

/** The quantity that is saved and calculated: a to-taste line is always 0. */
function entryQty(e: Pick<IngredientEntry, "qty" | "toTaste">): number {
  return e.toTaste ? 0 : qtyToNumber(e.qty);
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
      qty: ri.to_taste ? "" : String(ri.quantity),
      role: ri.role ?? "main",
      toTaste: ri.to_taste ?? false,
    })) ?? []
  );

  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  /** ingredient id -> number of recipes using it as a seasoning (orders the chips). */
  const [seasoningUsage, setSeasoningUsage] = useState<Map<string, number>>(new Map());
  /** Which list the picker adds to. */
  const [pickerRole, setPickerRole] = useState<LineRole>("main");
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
      es.map((e) => [e.ingredient.id, e.qty, e.role, e.toTaste]),
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
    // Only orders the quick-add chips; a failure just falls back to name order.
    supabase
      .from("recipe_ingredients")
      .select("ingredient_id")
      .eq("role", "seasoning")
      .then(({ data }) => {
        if (!data) return;
        const counts = new Map<string, number>();
        for (const row of data as { ingredient_id: string }[]) {
          counts.set(row.ingredient_id, (counts.get(row.ingredient_id) ?? 0) + 1);
        }
        setSeasoningUsage(counts);
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

  const { main: mainEntries, seasonings: seasoningEntries } = useMemo(() => splitLines(entries), [entries]);

  /** An ingredient may appear once per section. */
  const usedByRole = useMemo(
    () => ({
      main: new Set(mainEntries.map((e) => e.ingredient.id)),
      seasoning: new Set(seasoningEntries.map((e) => e.ingredient.id)),
    }),
    [mainEntries, seasoningEntries]
  );
  const usedIds = usedByRole[pickerRole];

  const chips = useMemo(
    () => pickSeasoningChips(allIngredients, usedByRole.seasoning, seasoningUsage),
    [allIngredients, usedByRole.seasoning, seasoningUsage]
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
      entries.map((e) => ({ ingredient: e.ingredient, quantity: entryQty(e) })),
      portionsValid ? portions : 1
    );
  }, [entries, portions, portionsValid]);

  const finalWeight = parseDecimal(finalWeightStr);

  const [showScale, setShowScale] = useState(false);
  const scaleLines = useMemo<ScaleLineInput[]>(
    () =>
      entries
        .filter((e) => entryQty(e) > 0)
        .map((e) => ({ key: e.id, ingredient: e.ingredient, quantity: entryQty(e) })),
    [entries]
  );
  const scalable = canScale(scaleLines);
  function applyScale(quantities: Map<string, number>) {
    setEntries((prev) =>
      prev.map((e) => (quantities.has(e.id) ? { ...e, qty: qtyToText(quantities.get(e.id)!) } : e))
    );
  }

  /** Adds a line to one section. Seasonings start from the chip default (to taste for spices). */
  function addIngredient(ingredient: Ingredient, role: LineRole) {
    if (usedByRole[role].has(ingredient.id)) return;
    const id = crypto.randomUUID();
    let entry: IngredientEntry = { id, ingredient, qty: "100", role: "main", toTaste: false };
    if (role === "seasoning") {
      const d = chipDefault(ingredient);
      entry = { id, ingredient, qty: d.toTaste ? "" : String(d.quantity), role, toTaste: d.toTaste };
    }
    setEntries((prev) => [...prev, entry]);
    if (!entry.toTaste) focusEntryId.current = id;
    setIngredientsError("");
  }

  function openPicker(role: LineRole) {
    setPickerRole(role);
    setShowPicker(true);
  }

  function updateQty(id: string, qty: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, qty } : e)));
  }

  function setToTaste(id: string, toTaste: boolean) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, toTaste, qty: "" } : e)));
    // Focus the amount once the input has re-rendered.
    if (!toTaste) requestAnimationFrame(() => qtyRefs.current.get(id)?.focus());
  }

  /** Moves a line to the other section. To taste is cleared on the way to Ingredients (amount left empty). */
  function moveEntry(id: string, role: LineRole) {
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.role === role) return;
    if (usedByRole[role].has(entry.ingredient.id)) {
      toast.error(
        `${entry.ingredient.name} is already in ${role === "main" ? "Ingredients" : "Seasonings"}. Remove one of the two lines first.`
      );
      return;
    }
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, role, toTaste: false, qty: e.toTaste ? "" : e.qty }
          : e
      )
    );
    setIngredientsError("");
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
    if (mainEntries.length === 0) {
      setIngredientsError("Add at least one ingredient.");
      invalid = true;
    } else if (entries.some((en) => !en.toTaste && qtyToNumber(en.qty) <= 0)) {
      setIngredientsError("Every ingredient needs a quantity greater than 0 (seasonings can be to taste).");
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
      quantity: entryQty(en),
      role: en.role,
      to_taste: en.toTaste,
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

  /** One recipe line, in either section. */
  function renderRow(entry: IngredientEntry) {
    const q = entryQty(entry);
    const isSeasoning = entry.role === "seasoning";
    const rowCost =
      entry.ingredient.price_per_unit == null ? null : q * entry.ingredient.price_per_unit;
    const rowKcal = ((entry.ingredient.calories ?? 0) * nutritionGrams(entry.ingredient, q)) / 100;
    const needsAmount = !entry.toTaste && qtyToNumber(entry.qty) <= 0;
    const calorieWarning = entry.toTaste && isCalorieDense(entry.ingredient);
    return (
      <div
        key={entry.id}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gray-50 rounded-lg px-3 py-2"
      >
        <div className="flex-1 min-w-[8rem]">
          <p className="text-sm font-medium text-gray-900">{entry.ingredient.name}</p>
          <p className="text-xs text-gray-500">
            {entry.toTaste
              ? "To taste · adds 0 kcal"
              : `${rowCost == null ? "Price pending" : formatLei(rowCost)} · ${Math.round(rowKcal)} kcal`}
          </p>
          {!entry.toTaste && missingPieceWeight(entry.ingredient) && (
            <p className="text-xs text-amber-700">Counts as grams until you set a weight per piece</p>
          )}
          {calorieWarning && (
            <p className="text-xs text-amber-700">Not counted in calories — enter an amount</p>
          )}
          {needsAmount && entry.qty.trim() === "" && (
            <p className="text-xs text-amber-700">Enter an amount</p>
          )}
        </div>
        {isSeasoning && (
          <label className="flex min-h-10 items-center gap-2 text-xs text-gray-700 md:min-h-8">
            <input
              type="checkbox"
              checked={entry.toTaste}
              onChange={(e) => setToTaste(entry.id, e.target.checked)}
              aria-label={`${entry.ingredient.name} to taste`}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            To taste
          </label>
        )}
        <div className="flex items-center gap-1">
          <input
            ref={(el) => {
              if (el) qtyRefs.current.set(entry.id, el);
              else qtyRefs.current.delete(entry.id);
            }}
            type="text"
            inputMode="decimal"
            disabled={entry.toTaste}
            aria-label={`Quantity of ${entry.ingredient.name} in ${entry.ingredient.unit}`}
            value={entry.toTaste ? "" : entry.qty}
            placeholder={entry.toTaste ? "—" : undefined}
            onChange={(e) => updateQty(entry.id, e.target.value)}
            className="w-20 px-2 py-1.5 border rounded text-sm text-gray-900 text-right focus:ring-1 focus:ring-emerald-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
          />
          <span className="text-xs text-gray-500 w-9">{entry.ingredient.unit}</span>
        </div>
        <IconButton
          label={
            isSeasoning
              ? `Move ${entry.ingredient.name} to Ingredients`
              : `Move ${entry.ingredient.name} to Seasonings`
          }
          onClick={() => moveEntry(entry.id, isSeasoning ? "main" : "seasoning")}
        >
          {isSeasoning ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
        </IconButton>
        <IconButton
          label={`Remove ${entry.ingredient.name}`}
          tone="danger"
          onClick={() => removeEntry(entry.id)}
        >
          <Trash2 size={16} />
        </IconButton>
      </div>
    );
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
                Ingredients ({mainEntries.length})
              </h3>
              <div className="flex items-center gap-3">
                {ingredientsError && (
                  <p role="alert" className="text-xs text-red-600">
                    {ingredientsError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowScale(true)}
                  disabled={!scalable}
                  title={scalable ? "Scale quantities to a calorie target" : "Needs ingredients with nutrition"}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Scale
                </button>
                <button
                  type="button"
                  onClick={() => openPicker("main")}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Ingredient
                </button>
              </div>
            </div>

            {mainEntries.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No ingredients added yet.
              </p>
            ) : (
              <div className="space-y-2">{mainEntries.map(renderRow)}</div>
            )}
          </div>

          {/* Seasonings */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h3 className="text-sm font-semibold text-gray-700">
                Seasonings ({seasoningEntries.length})
              </h3>
              <button
                type="button"
                onClick={() => openPicker("seasoning")}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Seasoning
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Spices, herbs, salt, oil, garlic and sauces. Customers see only their names. Weighed seasonings count in cost and calories.
            </p>

            {chips.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Quick add seasonings">
                {chips.map((ing) => (
                  <button
                    type="button"
                    key={ing.id}
                    onClick={() => addIngredient(ing, "seasoning")}
                    className="inline-flex min-h-10 items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-50 md:min-h-8"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    {ing.name}
                  </button>
                ))}
              </div>
            )}

            {seasoningEntries.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-3">No seasonings added.</p>
            ) : (
              <div className="space-y-2">{seasoningEntries.map(renderRow)}</div>
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
                  <p
                    className={`font-bold text-emerald-700 ${
                      calc.unpricedCount > 0 ? "text-xs leading-tight" : "text-sm"
                    }`}
                  >
                    {formatCost(calc.costPerPortion, calc.unpricedCount)}
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
                Total cost: {formatCost(calc.totalCost, calc.unpricedCount)} for {portionsValid ? portions : 1} portion
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
          <RecipeStepsEditor steps={steps} setSteps={setSteps} error={stepsError} />

          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}
        </form>
      </Modal>

      <ScaleRecipeModal
        open={showScale}
        onClose={() => setShowScale(false)}
        lines={scaleLines}
        portions={portionsValid ? portions : 1}
        onApply={applyScale}
      />

      {/* Ingredient picker (multi-add) */}
      <Modal
        open={showPicker}
        onClose={closePicker}
        title={pickerRole === "seasoning" ? "Pick Seasonings" : "Pick Ingredients"}
        size="md"
        footer={
          <button
            type="button"
            onClick={closePicker}
            className="py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
          >
            Done{usedIds.size > 0 ? ` (${usedIds.size} added)` : ""}
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
                      onClick={() => addIngredient(ing, pickerRole)}
                      className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-lg hover:bg-emerald-50 disabled:hover:bg-transparent text-sm transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-gray-900">{ing.name}</span>
                        {ing.brand && (
                          <span className="ml-1 text-xs text-gray-500">({ing.brand})</span>
                        )}
                        <span className="block text-xs text-gray-500">
                          {humanizeSlug(ing.category)} ·{" "}
                          {ing.price_per_unit == null ? "Price pending" : formatPricePerUnit(ing.price_per_unit, ing.unit)}
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
