"use client";

import { useState, useMemo, useEffect, useRef, useId, useSyncExternalStore } from "react";
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
  Category,
  MealReview,
  MealEntryStatus,
  MealStatus,
} from "@/lib/supabase/types";
import { calculateWeek, resolveTargets } from "@/lib/calculations/meal-plan";
import ShoppingListPanel from "@/components/shopping-list-panel";
import { invalidateMealPlan, invalidateMealPlans } from "@/lib/actions/revalidate";
import {
  Plus,
  Minus,
  X,
  ArrowLeft,
  Download,
  Settings,
  ShoppingCart,
  Copy,
  Check,
  FileText,
  Truck,
  Loader2,
  GripVertical,
  Star,
  CheckCircle2,
  MinusCircle,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import DeliveryForm from "@/components/delivery-form";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { IconButton } from "@/components/ui/icon-button";
import { formatLei, formatWeekRange, addDays, toLocalISODate, humanizeSlug, WEEKDAYS_SHORT } from "@/lib/format";
import type { MealPlanSiblings } from "@/lib/data/meal-plan-siblings";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

type PlanWithClient = MealPlan & { client: Client | null };

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

const TARGET_LEGEND =
  "Green: within ±10% of target. Amber: 10–20% off. Red: more than 20% off.";

interface SlotPickerState {
  day: number;
  mealType: MealType;
}

interface EntrySpec {
  day: number;
  mealType: MealType;
  recipeId: string | null;
  ingredientId: string | null;
  quantity: number | null;
  portions: number;
}

function entryName(e: FullEntry) {
  return e.recipe ? e.recipe.name : e.ingredient?.name ?? "Unknown";
}

function entryQty(e: FullEntry) {
  return e.recipe
    ? `×${e.portions}`
    : `${e.quantity}g${e.portions !== 1 ? ` ×${e.portions}` : ""}`;
}

/** kcal badge info for a day/average vs the calorie target. */
function calorieBadge(calories: number, target: number | null) {
  if (target == null || target <= 0) return null;
  const pct = (calories / target) * 100;
  const dev = Math.abs(pct - 100);
  const delta = Math.round(calories - target);
  const tone = dev > 20 ? "red" : dev > 10 ? "amber" : "green";
  const cls =
    tone === "red"
      ? "bg-red-50 text-red-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";
  const text = tone === "green" ? "On target" : `${delta >= 0 ? "+" : ""}${delta} kcal`;
  return { cls, text, tone, title: `${Math.round(pct)}% of ${Math.round(target)} kcal target. ${TARGET_LEGEND}` };
}

const MQ = "(min-width: 768px)";
function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(MQ);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(MQ).matches,
    () => true
  );
}

export default function MealPlanGrid({
  plan,
  entries: serverEntries,
  recipes,
  clients,
  ingredients,
  categories,
  reviews = [],
  statuses = [],
  siblings = { prev: null, next: null },
}: {
  plan: PlanWithClient;
  entries: FullEntry[];
  recipes: { id: string; name: string; portions: number }[];
  clients: Client[];
  ingredients: Ingredient[];
  categories: Category[];
  reviews?: MealReview[];
  statuses?: MealEntryStatus[];
  siblings?: MealPlanSiblings;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const confirm = useConfirm();
  const removeInFlight = useRef(new Set<string>());
  const isDesktop = useIsDesktop();
  const [slotPicker, setSlotPicker] = useState<SlotPickerState | null>(null);
  // Remembered across SlotPicker opens within this page visit.
  const [pickerDefaults, setPickerDefaults] = useState({ portions: 1, quantity: 100 });
  const [showSettings, setShowSettings] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [addingEntry, setAddingEntry] = useState(false);
  const [removingEntry, setRemovingEntry] = useState<string | null>(null);
  // editingEntry: id of the entry whose inline editor is currently open
  // (at most one at a time across desktop and mobile). null = no edit open.
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  // savingEntry: id of the entry whose updateEntry write is in flight.
  // Drives the row's dim state. Cleared on success or rollback.
  const [savingEntry, setSavingEntry] = useState<string | null>(null);
  const [activeEntry, setActiveEntry] = useState<FullEntry | null>(null);
  // 1-7 when this plan's week contains today, else null. Server snapshot is 0
  // (unknown) so SSR and hydration agree.
  const todayNum = useSyncExternalStore(
    () => () => {},
    () => {
      const today = toLocalISODate(new Date());
      for (let i = 0; i < 7; i++) {
        if (addDays(plan.week_start, i) === today) return i + 1;
      }
      return 0;
    },
    () => 0
  );
  const todayDay = todayNum || null;

  // Optimistic mirror of `serverEntries`. Mutations update this immediately
  // for an instant UI response; the corresponding Supabase write runs in the
  // background and we revalidate the cached meal-plan-detail tag on success.
  // When the server prop changes (e.g. a settings/duplicate modal triggered
  // a router.refresh() and the page re-rendered with fresh data) we resync.
  const [entries, setEntries] = useState<FullEntry[]>(serverEntries);
  const [prevServerEntries, setPrevServerEntries] = useState(serverEntries);
  if (prevServerEntries !== serverEntries) {
    setPrevServerEntries(serverEntries);
    setEntries(serverEntries);
  }

  // On mobile, scroll to today's card when this plan's week contains it.
  useEffect(() => {
    if (todayNum && !window.matchMedia(MQ).matches) {
      document.getElementById(`day-card-${todayNum}`)?.scrollIntoView({ block: "start" });
    }
  }, [todayNum]);

  const reviewMap = useMemo(() => {
    const m = new Map<string, MealReview>();
    for (const r of reviews) m.set(r.meal_plan_entry_id, r);
    return m;
  }, [reviews]);
  const statusMap = useMemo(() => {
    const m = new Map<string, MealStatus>();
    for (const s of statuses) m.set(s.meal_plan_entry_id, s.status);
    return m;
  }, [statuses]);

  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const weekTotals = calculateWeek(entries, plan.markup_multiplier);
  const targets = resolveTargets(plan, plan.client);

  function getEntriesForSlot(day: number, mealType: MealType) {
    return entries.filter(
      (e) => e.day_of_week === day && e.meal_type === mealType
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const entry = entries.find((e) => e.id === event.active.id);
    setActiveEntry(entry ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveEntry(null);
    const { active, over } = event;
    if (!over) return;
    const [, dayStr, mealType] = (over.id as string).split("-");
    void moveEntry(active.id as string, parseInt(dayStr), mealType as MealType);
  }

  // Shared by drag-and-drop and the mobile "Move to…" control.
  async function moveEntry(entryId: string, newDay: number, newMealType: MealType) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    if (entry.id.startsWith("temp-")) return;
    if (entry.day_of_week === newDay && entry.meal_type === newMealType) return;

    // Optimistic move — snapshot, apply locally, fire mutation, revalidate.
    const snapshot = entries;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? { ...e, day_of_week: newDay, meal_type: newMealType }
          : e
      )
    );

    const { error } = await supabase
      .from("meal_plan_entries")
      .update({ day_of_week: newDay, meal_type: newMealType })
      .eq("id", entryId);

    if (error) {
      setEntries(snapshot);
      toast.error(`Move failed: ${error.message}`, {
        action: { label: "Retry", onClick: () => void moveEntry(entryId, newDay, newMealType) },
      });
      return;
    }
    invalidateMealPlan(plan.id);
  }

  // Single add path used by the slot picker, ingredient picker and Undo.
  // `hydrated` (the full row from a removed entry) lets Undo restore the full
  // recipe/ingredient join without waiting for a refresh.
  async function insertEntry(spec: EntrySpec, hydrated?: FullEntry): Promise<boolean> {
    setAddingEntry(true);

    const tempId = `temp-${crypto.randomUUID()}`;
    let optimistic: FullEntry;
    if (hydrated) {
      optimistic = { ...hydrated, id: tempId };
    } else if (spec.recipeId) {
      const recipe = recipes.find((r) => r.id === spec.recipeId);
      optimistic = {
        id: tempId,
        meal_plan_id: plan.id,
        day_of_week: spec.day,
        meal_type: spec.mealType,
        recipe_id: spec.recipeId,
        ingredient_id: null,
        quantity: null,
        portions: spec.portions,
        // recipe is hydrated minimally for display until the server re-fetch
        // brings the full join back in via the cache revalidation.
        recipe: recipe
          ? ({
              id: recipe.id,
              name: recipe.name,
              portions: recipe.portions,
              recipe_ingredients: [],
            } as unknown as FullEntry["recipe"])
          : undefined,
      } as FullEntry;
    } else {
      optimistic = {
        id: tempId,
        meal_plan_id: plan.id,
        day_of_week: spec.day,
        meal_type: spec.mealType,
        recipe_id: null,
        ingredient_id: spec.ingredientId,
        quantity: spec.quantity,
        portions: spec.portions,
        ingredient: ingredients.find((i) => i.id === spec.ingredientId),
      } as FullEntry;
    }
    setEntries((prev) => [...prev, optimistic]);

    const { data, error } = await supabase
      .from("meal_plan_entries")
      .insert({
        meal_plan_id: plan.id,
        day_of_week: spec.day,
        meal_type: spec.mealType,
        recipe_id: spec.recipeId,
        ingredient_id: spec.ingredientId,
        quantity: spec.quantity,
        portions: spec.portions,
      })
      .select("id")
      .single();

    setAddingEntry(false);

    if (error || !data) {
      setEntries((prev) => prev.filter((e) => e.id !== tempId));
      toast.error(`Add failed: ${error?.message ?? "unknown error"}`, {
        action: { label: "Retry", onClick: () => void insertEntry(spec, hydrated) },
      });
      return false;
    }
    // Replace the temp row with the canonical id so subsequent mutations
    // (drag, delete) target the real row in the database.
    setEntries((prev) =>
      prev.map((e) => (e.id === tempId ? { ...e, id: data.id } : e))
    );
    if (spec.recipeId && !hydrated) {
      // Revalidate the cached detail bundle, then refresh so the new row
      // gets its full nested recipe_ingredients/ingredient join (needed for
      // cost + nutrition). The optimistic row is already visible, so the
      // refresh reads as a silent enrichment, not a flash.
      await invalidateMealPlan(plan.id);
      router.refresh();
    } else {
      // Direct ingredient entries (and Undo restores) already carry full
      // nutrition in the optimistic row; just bust the cache.
      invalidateMealPlan(plan.id);
    }
    return true;
  }

  function addEntry(recipeId: string, portions: number) {
    if (!slotPicker) return Promise.resolve(false);
    setPickerDefaults((d) => ({ ...d, portions }));
    return insertEntry({
      day: slotPicker.day,
      mealType: slotPicker.mealType,
      recipeId,
      ingredientId: null,
      quantity: null,
      portions,
    });
  }

  function addIngredientEntry(ingredientId: string, quantity: number) {
    if (!slotPicker) return Promise.resolve(false);
    setPickerDefaults((d) => ({ ...d, quantity }));
    return insertEntry({
      day: slotPicker.day,
      mealType: slotPicker.mealType,
      recipeId: null,
      ingredientId,
      quantity,
      portions: 1,
    });
  }

  async function removeEntry(entryId: string, alreadyConfirmed = false) {
    // Ignore repeat removes of the same entry while a check/confirm is pending.
    if (removeInFlight.current.has(entryId)) return;
    removeInFlight.current.add(entryId);
    try {
      await removeEntryInner(entryId, alreadyConfirmed);
    } finally {
      removeInFlight.current.delete(entryId);
    }
  }

  async function removeEntryInner(entryId: string, alreadyConfirmed: boolean) {
    const removed = entries.find((e) => e.id === entryId);
    // Reviews and eaten/skipped statuses cascade-delete with the entry and
    // cannot be restored by Undo, so confirm first and drop Undo for them.
    // The props come from a stale-while-revalidate cache, so also check the
    // database directly (fail safe: a query error counts as customer data).
    let hasCustomerData = reviewMap.has(entryId) || statusMap.has(entryId);
    if (!hasCustomerData && !alreadyConfirmed && !entryId.startsWith("temp-")) {
      const [st, rv] = await Promise.all([
        supabase
          .from("meal_entry_status")
          .select("meal_plan_entry_id")
          .eq("meal_plan_entry_id", entryId)
          .limit(1),
        supabase
          .from("meal_reviews")
          .select("meal_plan_entry_id")
          .eq("meal_plan_entry_id", entryId)
          .limit(1),
      ]);
      hasCustomerData =
        !!st.error || !!rv.error || (st.data?.length ?? 0) > 0 || (rv.data?.length ?? 0) > 0;
    }
    if (hasCustomerData && !alreadyConfirmed) {
      const ok = await confirm({
        title: "Remove this meal?",
        message:
          "The customer has already rated or logged this meal. Removing it permanently deletes their review and eaten/skipped status.",
        confirmLabel: "Remove",
        tone: "danger",
      });
      if (!ok) return;
    }
    const snapshot = entries;
    setRemovingEntry(entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));

    const { error } = await supabase
      .from("meal_plan_entries")
      .delete()
      .eq("id", entryId);
    setRemovingEntry(null);

    if (error) {
      setEntries(snapshot);
      toast.error(`Delete failed: ${error.message}`, {
        action: { label: "Retry", onClick: () => void removeEntry(entryId, hasCustomerData) },
      });
      return;
    }
    invalidateMealPlan(plan.id);
    if (hasCustomerData) {
      toast.success("Meal removed");
    } else if (removed) {
      toast.info("Entry removed", {
        action: {
          label: "Undo",
          onClick: () =>
            void insertEntry(
              {
                day: removed.day_of_week,
                mealType: removed.meal_type,
                recipeId: removed.recipe_id,
                ingredientId: removed.ingredient_id,
                quantity: removed.quantity,
                portions: removed.portions,
              },
              removed
            ),
        },
      });
    }
  }

  async function updateEntry(
    entryId: string,
    patch: { portions?: number; quantity?: number }
  ) {
    // Prevent rapid same-id calls from corrupting the rollback snapshot:
    // a second call mid-flight would capture state that already includes
    // the first optimistic patch.
    if (savingEntry === entryId) return;
    // Editor closes immediately; the "saving" dim communicates in-flight.
    setEditingEntry(null);
    const snapshot = entries;
    setSavingEntry(entryId);
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, ...patch } : e))
    );

    const { error } = await supabase
      .from("meal_plan_entries")
      .update(patch)
      .eq("id", entryId);

    setSavingEntry(null);

    if (error) {
      setEntries(snapshot);
      toast.error(`Update failed: ${error.message}`, {
        action: { label: "Retry", onClick: () => void updateEntry(entryId, patch) },
      });
      return;
    }
    // Recipe + ingredient nutrition is already in the in-memory entry, so
    // weekly totals recompute correctly without a refresh. Just bust the
    // cached detail bundle for the next navigation.
    invalidateMealPlan(plan.id);
  }

  const missingWeight = plan.client != null && plan.client.weight_kg == null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-6">
        <Link
          href="/meal-plans"
          aria-label="Back to meal plans"
          title="Back to meal plans"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1 min-w-[12rem]">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{plan.name}</h1>
          <p className="text-sm text-gray-500 flex flex-wrap items-center gap-x-1">
            {siblings.prev && (
              <Link
                href={`/meal-plans/${siblings.prev.id}`}
                aria-label={`Previous plan: week of ${formatWeekRange(siblings.prev.week_start)}`}
                title={`Previous plan: ${formatWeekRange(siblings.prev.week_start)}`}
                className="inline-flex items-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </Link>
            )}
            <span>{formatWeekRange(plan.week_start)}</span>
            {siblings.next && (
              <Link
                href={`/meal-plans/${siblings.next.id}`}
                aria-label={`Next plan: week of ${formatWeekRange(siblings.next.week_start)}`}
                title={`Next plan: ${formatWeekRange(siblings.next.week_start)}`}
                className="inline-flex items-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
            {plan.client && (
              <>
                <span aria-hidden="true">•</span>
                <Link
                  href={`/clients#client-${plan.client.id}`}
                  className="text-emerald-700 hover:underline"
                >
                  {plan.client.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setShowShoppingList(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Shopping List
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </button>
          <MoreMenu
            items={[
              { label: "Plan settings", icon: <Settings className="w-4 h-4" />, onClick: () => setShowSettings(true) },
              { label: "Duplicate plan", icon: <Copy className="w-4 h-4" />, onClick: () => setShowDuplicate(true) },
              ...(plan.client_id
                ? [{ label: "Log delivery", icon: <Truck className="w-4 h-4" />, onClick: () => setShowDelivery(true) }]
                : []),
            ]}
          />
        </div>
      </div>

      {/* Mobile stacked day view */}
      <div className="md:hidden space-y-3 mb-6">
        {WEEKDAYS_SHORT.map((dayLabel, dayIdx) => {
          const day = dayIdx + 1;
          const dayTotals = weekTotals.days[day];
          const hasEntries = dayTotals.calories > 0;
          const badge = hasEntries ? calorieBadge(dayTotals.calories, targets.calories) : null;
          const isToday = todayDay === day;
          return (
            <div
              key={dayLabel}
              id={`day-card-${day}`}
              className={`bg-white rounded-xl border overflow-hidden scroll-mt-16 ${
                isToday ? "ring-2 ring-emerald-500" : ""
              }`}
            >
              <div className={`flex items-center justify-between gap-2 px-4 py-2 border-b ${isToday ? "bg-emerald-50" : "bg-gray-50"}`}>
                <span className="text-sm font-semibold text-gray-700">
                  {dayLabel}
                  {isToday && (
                    <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Today
                    </span>
                  )}
                </span>
                {hasEntries && (
                  <span className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] text-gray-500">
                    {Math.round(dayTotals.calories)} kcal • {formatLei(dayTotals.cost)}
                    {badge && (
                      <span title={badge.title} className={`rounded px-1.5 py-0.5 ${badge.cls}`}>
                        {badge.text}
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="divide-y">
                {MEAL_TYPES.map((mealType) => {
                  const slotEntries = getEntriesForSlot(day, mealType);
                  return (
                    <div key={mealType} className="px-4 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-500">
                          {MEAL_LABELS[mealType]}
                        </span>
                        <IconButton
                          label={`Add to ${dayLabel} ${MEAL_LABELS[mealType].toLowerCase()}`}
                          onClick={() => setSlotPicker({ day, mealType })}
                        >
                          <Plus className="w-4 h-4" />
                        </IconButton>
                      </div>
                      {slotEntries.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Empty</p>
                      ) : (
                        <div className="space-y-1">
                          {slotEntries.map((entry) => {
                            const review = reviewMap.get(entry.id);
                            const status = statusMap.get(entry.id);
                            return (
                            <div
                              key={entry.id}
                              role="button"
                              tabIndex={0}
                              aria-label={`Edit ${entryName(entry)}`}
                              onClick={() => {
                                if (entry.id.startsWith("temp-")) return;
                                if (savingEntry === entry.id) return;
                                setEditingEntry(entry.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key !== "Enter" && e.key !== " ") return;
                                e.preventDefault();
                                if (entry.id.startsWith("temp-")) return;
                                if (savingEntry === entry.id) return;
                                setEditingEntry(entry.id);
                              }}
                              className={`flex items-center justify-between gap-2 bg-emerald-50 rounded px-2 py-1 transition-opacity ${
                                removingEntry === entry.id || savingEntry === entry.id
                                  ? "opacity-50 pointer-events-none"
                                  : ""
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-gray-900 truncate flex items-center gap-1">
                                  {status === "eaten" && (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" aria-label="Eaten" />
                                  )}
                                  {status === "skipped" && (
                                    <MinusCircle className="w-3 h-3 text-gray-400 flex-shrink-0" aria-label="Skipped" />
                                  )}
                                  <span className="truncate">{entryName(entry)}</span>
                                  {review && (
                                    <span className="text-[10px] text-amber-600 flex items-center gap-0.5 flex-shrink-0">
                                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                      {review.rating}
                                    </span>
                                  )}
                                </p>
                                <p className="text-[11px] text-gray-500 flex items-center gap-1">
                                  {entryQty(entry)}
                                  <Pencil className="w-2.5 h-2.5 text-gray-400" aria-hidden="true" />
                                </p>
                              </div>
                              <IconButton
                                label={`Remove ${entryName(entry)}`}
                                tone="danger"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeEntry(entry.id);
                                }}
                                disabled={removingEntry === entry.id}
                              >
                                {removingEntry === entry.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <X className="w-4 h-4" />
                                )}
                              </IconButton>
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Weekly Grid */}
      <DndContext id={dndId} sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="hidden md:block bg-white rounded-xl border overflow-hidden mb-2">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20"></th>
                {WEEKDAYS_SHORT.map((day, idx) => (
                  <th
                    key={day}
                    className={`text-center px-2 py-2 font-medium min-w-[104px] ${
                      todayDay === idx + 1 ? "text-emerald-700 bg-emerald-50" : "text-gray-600"
                    }`}
                  >
                    {day}
                    {todayDay === idx + 1 && (
                      <span className="ml-1 text-[10px] font-normal">(today)</span>
                    )}
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
                  {WEEKDAYS_SHORT.map((dayLabel, dayIdx) => {
                    const day = dayIdx + 1;
                    const slotEntries = getEntriesForSlot(day, mealType);
                    return (
                      <DroppableSlot key={`${day}-${mealType}`} day={day} mealType={mealType}>
                        <div className="space-y-1 min-h-[48px]">
                          {slotEntries.map((entry) => (
                            <DraggableEntry
                              key={entry.id}
                              entry={entry}
                              removingEntry={removingEntry}
                              savingEntry={savingEntry}
                              editingEntry={editingEntry}
                              onRemove={removeEntry}
                              onStartEdit={(id) => {
                                if (activeEntry) return; // don't open editor mid-drag
                                setEditingEntry(id);
                              }}
                              onSubmitEdit={(id, value) => {
                                const entry = entries.find((e) => e.id === id);
                                if (!entry) return;
                                if (entry.recipe) {
                                  updateEntry(id, { portions: value });
                                } else {
                                  updateEntry(id, { quantity: value });
                                }
                              }}
                              onCancelEdit={() => setEditingEntry(null)}
                              review={reviewMap.get(entry.id)}
                              status={statusMap.get(entry.id)}
                            />
                          ))}
                          <button
                            onClick={() => setSlotPicker({ day, mealType })}
                            aria-label={`Add to ${dayLabel} ${MEAL_LABELS[mealType].toLowerCase()}`}
                            title={`Add to ${dayLabel} ${MEAL_LABELS[mealType].toLowerCase()}`}
                            className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-gray-300 text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </DroppableSlot>
                    );
                  })}
                </tr>
              ))}
              {/* Daily totals row */}
              <tr className="bg-gray-50 border-t">
                <td className="px-3 py-2 font-medium text-gray-600 text-xs border-r">
                  Daily
                </td>
                {WEEKDAYS_SHORT.map((_, dayIdx) => {
                  const day = dayIdx + 1;
                  const dayTotals = weekTotals.days[day];
                  const hasEntries = dayTotals.calories > 0;
                  const badge = hasEntries ? calorieBadge(dayTotals.calories, targets.calories) : null;
                  return (
                    <td
                      key={day}
                      className="px-2 py-2 text-center border-r last:border-r-0"
                    >
                      {hasEntries ? (
                        <div className="text-[11px] space-y-0.5">
                          <p className="font-semibold text-gray-900">
                            {Math.round(dayTotals.calories)} kcal
                          </p>
                          {badge && (
                            <span
                              title={badge.title}
                              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 ${badge.cls}`}
                            >
                              {badge.tone === "green" ? (
                                <Check className="w-3 h-3" aria-hidden="true" />
                              ) : (
                                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                              )}
                              {badge.text}
                            </span>
                          )}
                          <p className="text-gray-500">
                            P:{dayTotals.protein.toFixed(0)} C:{dayTotals.carbs.toFixed(0)} F:{dayTotals.fat.toFixed(0)} Fi:{dayTotals.fiber.toFixed(0)}
                          </p>
                          <p className="text-emerald-700 font-medium">
                            {formatLei(dayTotals.cost)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-400">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <DragOverlay>
        {activeEntry && (
          <div className="bg-emerald-100 rounded px-2 py-1 shadow-lg border border-emerald-300 max-w-[140px]">
            <p className="text-xs font-medium text-gray-900 truncate">
              {entryName(activeEntry)}
            </p>
            <p className="text-[10px] text-gray-500">{entryQty(activeEntry)}</p>
          </div>
        )}
      </DragOverlay>
      </DndContext>

      {/* Target legend / nudge */}
      <p className="hidden md:block text-xs text-gray-500 mb-6">
        {targets.calories != null ? (
          <>
            Daily kcal vs your {Math.round(targets.calories)} kcal target. {TARGET_LEGEND}
          </>
        ) : (
          <>
            No calorie target set — daily totals can&apos;t be compared.{" "}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="font-medium text-emerald-700 hover:underline"
            >
              Set targets
            </button>
          </>
        )}
        {" "}Drag the grip handle (or focus it and press Space) to move an entry.
      </p>
      <div className="md:hidden mb-6 -mt-3">
        {targets.calories == null && (
          <p className="text-xs text-gray-500">
            No calorie target set.{" "}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="font-medium text-emerald-700 hover:underline"
            >
              Set targets
            </button>
          </p>
        )}
      </div>

      {/* Weekly summary */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Weekly Summary
        </h3>
        {(targets.calories == null || missingWeight) && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>
              {targets.calories == null
                ? "No nutrition targets set for this plan."
                : "Client has no weight set, so protein/fat/carb targets can't be resolved."}
            </span>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="font-medium underline"
            >
              Set targets
            </button>
            {missingWeight && plan.client && (
              <Link href={`/clients#client-${plan.client.id}`} className="font-medium underline">
                Add client weight
              </Link>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <div>
            <p className="text-xs text-gray-500">Ingredient Cost</p>
            <p className="text-lg font-bold text-gray-900">
              {formatLei(weekTotals.totalCost)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">
              Selling Price ({plan.markup_multiplier}×)
            </p>
            <p className="text-lg font-bold text-emerald-700">
              {formatLei(weekTotals.sellingPrice)}
            </p>
          </div>
          <TargetCell
            label="Avg Daily Cal"
            actual={weekTotals.averageDaily.calories}
            target={targets.calories}
            unit=""
            roundActual
          />
          <TargetCell
            label="Avg Protein/day"
            actual={weekTotals.averageDaily.protein}
            target={targets.protein}
            unit="g"
          />
          <TargetCell
            label="Avg Carbs/day"
            actual={weekTotals.averageDaily.carbs}
            target={targets.carbs}
            unit="g"
            hint={
              targets.carbsOverAllocated
                ? "protein + fat exceed calories"
                : undefined
            }
          />
          <TargetCell
            label="Avg Fat/day"
            actual={weekTotals.averageDaily.fat}
            target={targets.fat}
            unit="g"
          />
          <RangeTargetCell
            label="Avg Fiber/day"
            actual={weekTotals.averageDaily.fiber}
            range={targets.fiber}
            unit="g"
          />
        </div>
        <p className="mt-3 text-[11px] text-gray-500">{TARGET_LEGEND} Fiber is in range at 10–14 g per 1000 kcal.</p>
      </div>

      {/* Slot picker modal */}
      {slotPicker && (
        <SlotPicker
          day={slotPicker.day}
          mealType={slotPicker.mealType}
          recipes={recipes}
          ingredients={ingredients}
          categories={categories}
          defaults={pickerDefaults}
          onAdd={addEntry}
          onAddIngredient={addIngredientEntry}
          onClose={() => setSlotPicker(null)}
          adding={addingEntry}
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

      {/* Shopping list modal */}
      {showShoppingList && (
        <ShoppingListModal
          entries={entries}
          categories={categories}
          weekStart={plan.week_start}
          planName={plan.name}
          onClose={() => setShowShoppingList(false)}
        />
      )}

      {/* Duplicate modal */}
      {showDuplicate && (
        <DuplicatePlanModal
          plan={plan}
          entryCount={entries.length}
          clients={clients}
          onClose={() => setShowDuplicate(false)}
        />
      )}

      {/* Export modal */}
      {showExport && (
        <ExportModal
          planId={plan.id}
          clientEmail={plan.client?.email ?? null}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Delivery modal */}
      {showDelivery && plan.client_id && (
        <DeliveryForm
          clientId={plan.client_id}
          mealPlanId={plan.id}
          expectedContainers={entries
            .filter((e) => e.recipe?.container_type_id)
            .map((e) => ({
              container_type_id: e.recipe!.container_type_id!,
              quantity: e.portions,
            }))}
          onClose={() => setShowDelivery(false)}
        />
      )}

      {/* Mobile quantity-edit popover (mobile only — desktop uses inline editor) */}
      {editingEntry && !isDesktop && (() => {
        const e = entries.find((x) => x.id === editingEntry);
        if (!e) return null;
        return (
          <MobileQuantityPopover
            entry={e}
            onSave={(patch) => updateEntry(editingEntry, patch)}
            onMove={(day, mealType) => {
              setEditingEntry(null);
              void moveEntry(editingEntry, day, mealType);
            }}
            onCancel={() => setEditingEntry(null)}
          />
        );
      })()}
    </div>
  );
}

function MoreMenu({
  items,
}: {
  items: { label: string; icon: React.ReactNode; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        More
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-48 rounded-lg border bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DroppableSlot({ day, mealType, children }: { day: number; mealType: MealType; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot-${day}-${mealType}` });
  return (
    <td
      ref={setNodeRef}
      className={`px-2 py-2 border-r last:border-r-0 align-top transition-colors ${
        isOver ? "bg-emerald-50" : ""
      }`}
    >
      {children}
    </td>
  );
}

function InlineQuantityEditor({
  initialValue,
  kind,
  onSave,
  onCancel,
}: {
  initialValue: number;
  kind: "portions" | "quantity";
  onSave: (value: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(initialValue));
  // Validation matches SlotPicker exactly: portions step=0.1 min=0.1, quantity step=1 min=1.
  const min = kind === "portions" ? 0.1 : 1;
  const step = kind === "portions" ? "0.1" : "1";
  const bump = kind === "portions" ? 0.5 : 10;
  const parsed = parseFloat(value);
  const valid = !isNaN(parsed) && parsed >= min;

  function nudge(dir: 1 | -1) {
    const base = isNaN(parsed) ? initialValue : parsed;
    const next = Math.max(min, Math.round((base + dir * bump) * 10) / 10);
    setValue(String(next));
  }

  // Commit if changed and valid; otherwise close via the cancel path so we
  // don't fire a no-op write. The editor closes either way.
  function commit() {
    if (!valid) {
      onCancel();
      return;
    }
    if (parsed === initialValue) {
      onCancel();
      return;
    }
    onSave(parsed);
  }

  // mousedown + preventDefault keeps focus in the input so blur doesn't
  // commit/close before the button's action runs.
  const noBlur = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      <button
        type="button"
        onMouseDown={noBlur(() => nudge(-1))}
        className="p-0.5 rounded bg-white border hover:bg-gray-100"
        aria-label={kind === "portions" ? "Decrease portions" : "Decrease quantity"}
      >
        <Minus className="w-3 h-3 text-gray-600" />
      </button>
      <input
        type="number"
        autoFocus
        value={value}
        min={min}
        step={step}
        aria-label={kind === "portions" ? "Portions" : "Quantity in grams"}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={commit}
        // Stop pointerdown from reaching the draggable wrapper so typing
        // inside the input doesn't initiate a drag.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-12 px-1 py-0 text-[11px] border rounded text-gray-900 text-center focus:ring-1 focus:ring-emerald-500 outline-none"
      />
      <button
        type="button"
        onMouseDown={noBlur(() => nudge(1))}
        className="p-0.5 rounded bg-white border hover:bg-gray-100"
        aria-label={kind === "portions" ? "Increase portions" : "Increase quantity"}
      >
        <Plus className="w-3 h-3 text-gray-600" />
      </button>
      <button
        type="button"
        disabled={!valid}
        onMouseDown={noBlur(commit)}
        className="p-0.5 rounded hover:bg-emerald-100 disabled:opacity-40"
        aria-label="Save"
      >
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      </button>
      <button
        type="button"
        onMouseDown={noBlur(onCancel)}
        className="p-0.5 rounded hover:bg-red-100"
        aria-label="Cancel"
      >
        <X className="w-3.5 h-3.5 text-red-500" />
      </button>
    </span>
  );
}

function MobileQuantityPopover({
  entry,
  onSave,
  onMove,
  onCancel,
}: {
  entry: FullEntry;
  onSave: (patch: { portions?: number; quantity?: number }) => void;
  onMove: (day: number, mealType: MealType) => void;
  onCancel: () => void;
}) {
  const isRecipe = !!entry.recipe;
  const [portions, setPortions] = useState(String(entry.portions ?? 1));
  const [quantity, setQuantity] = useState(
    entry.quantity != null ? String(entry.quantity) : "0"
  );
  const [moveDay, setMoveDay] = useState(entry.day_of_week);
  const [moveMeal, setMoveMeal] = useState<MealType>(entry.meal_type);
  const portionsNum = parseFloat(portions);
  const quantityNum = parseFloat(quantity);
  const portionsValid = !isNaN(portionsNum) && portionsNum >= 0.1;
  const quantityValid = !isNaN(quantityNum) && quantityNum >= 1;
  const valid = isRecipe
    ? portionsValid
    : portionsValid && quantityValid;
  const moved = moveDay !== entry.day_of_week || moveMeal !== entry.meal_type;
  const title = isRecipe
    ? entry.recipe?.name ?? "Recipe"
    : entry.ingredient?.name ?? "Ingredient";

  function submit() {
    if (!valid) return;
    if (isRecipe) {
      if (portionsNum === entry.portions) {
        onCancel();
        return;
      }
      onSave({ portions: portionsNum });
    } else {
      const qChanged = quantityNum !== entry.quantity;
      const pChanged = portionsNum !== entry.portions;
      if (!qChanged && !pChanged) {
        onCancel();
        return;
      }
      const patch: { portions?: number; quantity?: number } = {};
      if (qChanged) patch.quantity = quantityNum;
      if (pChanged) patch.portions = portionsNum;
      onSave(patch);
    }
  }

  const inputCls =
    "w-full px-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none";

  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title={<span className="block truncate">Edit {title}</span>}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {!isRecipe && (
          <div>
            <label htmlFor="mq-quantity" className="block text-xs text-gray-500 mb-1">
              Quantity (g)
            </label>
            <input
              id="mq-quantity"
              type="number"
              min={1}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={inputCls}
            />
          </div>
        )}
        <div>
          <label htmlFor="mq-portions" className="block text-xs text-gray-500 mb-1">Portions</label>
          <input
            id="mq-portions"
            type="number"
            min={0.1}
            step="0.1"
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="border-t pt-3">
          <p className="text-xs font-medium text-gray-700 mb-2">Move to…</p>
          <div className="flex gap-2">
            <select
              aria-label="Day"
              value={moveDay}
              onChange={(e) => setMoveDay(parseInt(e.target.value))}
              className={inputCls}
            >
              {WEEKDAYS_SHORT.map((d, i) => (
                <option key={d} value={i + 1}>{d}</option>
              ))}
            </select>
            <select
              aria-label="Meal"
              value={moveMeal}
              onChange={(e) => setMoveMeal(e.target.value as MealType)}
              className={inputCls}
            >
              {MEAL_TYPES.map((m) => (
                <option key={m} value={m}>{MEAL_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!moved}
            onClick={() => onMove(moveDay, moveMeal)}
            className="mt-2 w-full px-3 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
          >
            Move to {WEEKDAYS_SHORT[moveDay - 1]} {MEAL_LABELS[moveMeal].toLowerCase()}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DraggableEntry({
  entry,
  removingEntry,
  savingEntry,
  editingEntry,
  onRemove,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  review,
  status,
}: {
  entry: FullEntry;
  removingEntry: string | null;
  savingEntry: string | null;
  editingEntry: string | null;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onSubmitEdit: (id: string, value: number) => void;
  onCancelEdit: () => void;
  review?: MealReview;
  status?: MealStatus;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entry.id });
  const isEditing = editingEntry === entry.id;
  const isSaving = savingEntry === entry.id;
  // Disable starting an edit on a not-yet-committed row (temp ids).
  const editable = !entry.id.startsWith("temp-");
  const editKind: "portions" | "quantity" = entry.recipe ? "portions" : "quantity";
  const editInitial = entry.recipe ? entry.portions : entry.quantity ?? 0;
  const name = entryName(entry);

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-between bg-emerald-50 rounded px-1.5 py-1 group transition-opacity ${
        removingEntry === entry.id || isSaving ? "opacity-50 pointer-events-none" : ""
      } ${isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-center gap-0.5 min-w-0 flex-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${name}`}
          title="Drag to move"
          className="p-0.5 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity touch-none"
        >
          <GripVertical className="w-3.5 h-3.5 text-gray-500" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900 truncate flex items-center gap-1">
            {status === "eaten" && (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" aria-label="Eaten" />
            )}
            {status === "skipped" && (
              <MinusCircle className="w-3 h-3 text-gray-400 flex-shrink-0" aria-label="Skipped" />
            )}
            <span className="truncate">{name}</span>
            {review && (
              <span className="text-[10px] text-amber-600 flex items-center gap-0.5 flex-shrink-0">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                {review.rating}
              </span>
            )}
          </p>
          {isEditing ? (
            <InlineQuantityEditor
              initialValue={editInitial}
              kind={editKind}
              onSave={(v) => onSubmitEdit(entry.id, v)}
              onCancel={onCancelEdit}
            />
          ) : (
            <button
              type="button"
              disabled={!editable}
              onClick={(e) => {
                e.stopPropagation();
                if (editable) onStartEdit(entry.id);
              }}
              className={`inline-flex items-center gap-1 text-[11px] text-gray-600 text-left ${
                editable ? "underline decoration-dotted underline-offset-2 hover:text-emerald-700 cursor-text" : "cursor-default"
              }`}
              aria-label={editable ? `Edit quantity of ${name}` : undefined}
              title={editable ? "Edit quantity" : undefined}
            >
              {entryQty(entry)}
              {editable && <Pencil className="w-2.5 h-2.5 text-gray-400" aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        disabled={removingEntry === entry.id}
        aria-label={`Remove ${name}`}
        title="Remove"
        className="p-1 rounded opacity-40 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-100 transition-opacity"
      >
        {removingEntry === entry.id ? (
          <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />
        ) : (
          <X className="w-3.5 h-3.5 text-red-500" />
        )}
      </button>
    </div>
  );
}

function TargetCell({
  label,
  actual,
  target,
  unit,
  roundActual,
  hint,
}: {
  label: string;
  actual: number;
  target: number | null;
  unit: string;
  roundActual?: boolean;
  hint?: string;
}) {
  const fmt = (n: number) => (roundActual ? Math.round(n).toString() : n.toFixed(0));

  if (target == null) {
    return (
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900">
          {fmt(actual)}{unit}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">
          {hint ?? "no target set"}
        </p>
      </div>
    );
  }

  const pct = target > 0 ? (actual / target) * 100 : 0;
  const deviation = Math.abs(pct - 100);
  let badgeClass = "bg-emerald-50 text-emerald-700";
  if (deviation > 20) badgeClass = "bg-red-50 text-red-700";
  else if (deviation > 10) badgeClass = "bg-amber-50 text-amber-700";

  const delta = actual - target;
  const sign = delta >= 0 ? "+" : "";

  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">
        {fmt(actual)}{unit}
        <span className="text-xs font-normal text-gray-500">
          {" "}/ {fmt(target)}{unit}
        </span>
      </p>
      <span
        title={TARGET_LEGEND}
        className={`inline-block mt-0.5 text-[11px] px-1.5 py-0.5 rounded ${badgeClass}`}
      >
        {sign}{fmt(delta)}{unit} ({Math.round(pct)}%)
      </span>
      {hint && (
        <p className="text-[11px] text-amber-700 mt-0.5">{hint}</p>
      )}
    </div>
  );
}

function RangeTargetCell({
  label,
  actual,
  range,
  unit,
}: {
  label: string;
  actual: number;
  range: { min: number; max: number } | null;
  unit: string;
}) {
  const fmt = (n: number) => n.toFixed(0);

  if (range == null) {
    return (
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900">
          {fmt(actual)}{unit}
        </p>
        <p className="text-[11px] text-gray-500 mt-0.5">no target set</p>
      </div>
    );
  }

  let badgeClass: string;
  let label2: string;
  if (actual >= range.min && actual <= range.max) {
    badgeClass = "bg-emerald-50 text-emerald-700";
    label2 = "in range";
  } else {
    const nearest = actual < range.min ? range.min : range.max;
    const deviation = Math.abs((actual - nearest) / nearest) * 100;
    if (deviation > 20) badgeClass = "bg-red-50 text-red-700";
    else badgeClass = "bg-amber-50 text-amber-700";
    const delta = actual - nearest;
    const sign = delta >= 0 ? "+" : "";
    label2 = `${sign}${fmt(delta)}${unit} vs ${actual < range.min ? "min" : "max"}`;
  }

  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">
        {fmt(actual)}{unit}
        <span className="text-xs font-normal text-gray-500">
          {" "}/ {fmt(range.min)}–{fmt(range.max)}{unit}
        </span>
      </p>
      <span
        title="Green: inside the 10–14 g per 1000 kcal range. Amber: within 20% of it. Red: more than 20% outside."
        className={`inline-block mt-0.5 text-[11px] px-1.5 py-0.5 rounded ${badgeClass}`}
      >
        {label2}
      </span>
    </div>
  );
}

function SlotPicker({
  day,
  mealType,
  recipes,
  ingredients,
  categories,
  defaults,
  onAdd,
  onAddIngredient,
  onClose,
  adding,
}: {
  day: number;
  mealType: MealType;
  recipes: { id: string; name: string; portions: number }[];
  ingredients: Ingredient[];
  categories: Category[];
  defaults: { portions: number; quantity: number };
  onAdd: (recipeId: string, portions: number) => Promise<boolean>;
  onAddIngredient: (ingredientId: string, quantity: number) => Promise<boolean>;
  onClose: () => void;
  adding: boolean;
}) {
  const [tab, setTab] = useState<"recipes" | "ingredients">("recipes");
  const [search, setSearch] = useState("");
  const [portions, setPortions] = useState(String(defaults.portions));
  const [quantity, setQuantity] = useState(String(defaults.quantity));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);

  const portionsNum = parseFloat(portions);
  const quantityNum = parseFloat(quantity);
  const portionsValid = !isNaN(portionsNum) && portionsNum >= 0.1;
  const quantityValid = !isNaN(quantityNum) && quantityNum >= 1;

  const categoryLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.slug] = c.name;
    return (slug: string) => m[slug] ?? humanizeSlug(slug);
  }, [categories]);

  const q = search.trim().toLowerCase();
  const filteredRecipes = recipes.filter(
    (r) => q.length === 0 || r.name.toLowerCase().includes(q)
  );
  const filteredIngredients = ingredients.filter(
    (i) => q.length === 0 || i.name.toLowerCase().includes(q)
  );
  const list = tab === "recipes" ? filteredRecipes : filteredIngredients;
  const canAdd = !adding && (tab === "recipes" ? portionsValid : quantityValid);

  async function select(id: string) {
    if (!canAdd) return;
    setSelectedId(id);
    const ok =
      tab === "recipes"
        ? await onAdd(id, portionsNum)
        : await onAddIngredient(id, quantityNum);
    if (ok) {
      setLastAddedId(id);
      setAddedCount((n) => n + 1);
    }
  }

  function onSearchKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = list[Math.min(activeIdx, list.length - 1)];
      if (item) void select(item.id);
    }
  }

  const tabCls = (t: string) =>
    `flex-1 px-4 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-emerald-500 text-emerald-700" : "text-gray-500 hover:text-gray-700"}`;

  const itemCls = (active: boolean) =>
    `w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between gap-2 ${
      active ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-emerald-50"
    } ${adding ? "opacity-50 cursor-not-allowed" : ""}`;

  const status = (id: string) =>
    adding && selectedId === id ? (
      <Loader2 className="w-4 h-4 text-emerald-600 animate-spin shrink-0" />
    ) : lastAddedId === id ? (
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700">
        <Check className="w-3.5 h-3.5" /> Added
      </span>
    ) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`${WEEKDAYS_SHORT[day - 1]} — ${MEAL_LABELS[mealType]}`}
      footer={
        <>
          <span className="mr-auto text-xs text-gray-500" aria-live="polite">
            {addedCount > 0 ? `Added ${addedCount} ✓` : "Pick items to add"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
          >
            Done
          </button>
        </>
      }
    >
      <div className="-mx-5 -mt-4 flex border-b" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "recipes"}
          onClick={() => { setTab("recipes"); setSearch(""); setActiveIdx(0); }}
          className={tabCls("recipes")}
        >
          Recipes
        </button>
        <button
          role="tab"
          aria-selected={tab === "ingredients"}
          onClick={() => { setTab("ingredients"); setSearch(""); setActiveIdx(0); }}
          className={tabCls("ingredients")}
        >
          Ingredients
        </button>
      </div>
      <div className="space-y-2 py-3">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setActiveIdx(0); }}
          onKeyDown={onSearchKey}
          aria-label={tab === "recipes" ? "Search recipes" : "Search ingredients"}
          placeholder={tab === "recipes" ? "Search recipes… (Enter adds the highlighted one)" : "Search ingredients… (Enter adds the highlighted one)"}
          className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
          autoFocus
        />
        {tab === "recipes" ? (
          <div className="flex items-center gap-2">
            <label htmlFor="sp-portions" className="text-xs text-gray-500">Portions:</label>
            <input
              id="sp-portions"
              type="number"
              min={0.1}
              step="0.1"
              value={portions}
              onChange={(e) => setPortions(e.target.value)}
              className="w-16 px-2 py-1 border rounded text-sm text-gray-900 text-center focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            {!portionsValid && <span className="text-xs text-red-600">min 0.1</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <label htmlFor="sp-quantity" className="text-xs text-gray-500">Quantity (g):</label>
            <input
              id="sp-quantity"
              type="number"
              min={1}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-20 px-2 py-1 border rounded text-sm text-gray-900 text-center focus:ring-1 focus:ring-emerald-500 outline-none"
            />
            {!quantityValid && <span className="text-xs text-red-600">min 1</span>}
          </div>
        )}
      </div>
      <div role="listbox" aria-label={tab === "recipes" ? "Recipes" : "Ingredients"} className="space-y-1">
        {list.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            {tab === "recipes" ? "No recipes found." : "No ingredients found."}
          </p>
        )}
        {tab === "recipes"
          ? filteredRecipes.map((recipe, i) => (
              <button
                key={recipe.id}
                role="option"
                aria-selected={i === activeIdx}
                ref={i === activeIdx ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onClick={() => select(recipe.id)}
                disabled={adding}
                className={itemCls(i === activeIdx)}
              >
                <div>
                  <span className="font-medium text-gray-900">{recipe.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {recipe.portions} portion{recipe.portions > 1 ? "s" : ""}
                  </span>
                </div>
                {status(recipe.id)}
              </button>
            ))
          : filteredIngredients.map((ing, i) => (
              <button
                key={ing.id}
                role="option"
                aria-selected={i === activeIdx}
                ref={i === activeIdx ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                onClick={() => select(ing.id)}
                disabled={adding}
                className={itemCls(i === activeIdx)}
              >
                <div>
                  <span className="font-medium text-gray-900">{ing.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {categoryLabel(ing.category)}
                  </span>
                </div>
                {status(ing.id)}
              </button>
            ))}
      </div>
    </Modal>
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
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const initial = {
    name: plan.name,
    client_id: plan.client_id ?? "",
    week_start: plan.week_start,
    markup_multiplier: plan.markup_multiplier,
    calorie_target: plan.calorie_target ?? (null as number | null),
    protein_per_kg: plan.protein_per_kg ?? (null as number | null),
    fat_per_kg: plan.fat_per_kg ?? (null as number | null),
  };
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

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
        calorie_target: form.calorie_target,
        protein_per_kg: form.protein_per_kg,
        fat_per_kg: form.fat_per_kg,
      })
      .eq("id", plan.id);

    if (updateErr) {
      setError(updateErr.message);
      toast.error(`Could not save plan: ${updateErr.message}`);
      setSaving(false);
    } else {
      // Plan-level edits affect both the list (via name/client/week) and
      // the cached detail bundle, so bust both.
      await invalidateMealPlan(plan.id);
      await invalidateMealPlans();
      router.refresh();
      toast.success("Plan updated");
      onClose();
    }
  }

  const inputCls =
    "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm";

  return (
    <Modal
      open
      onClose={onClose}
      title="Plan Settings"
      dirty={dirty && !saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="plan-settings-form"
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </>
      }
    >
      <form id="plan-settings-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="ps-name" className="block text-sm font-medium text-gray-700 mb-1">
            Plan Name *
          </label>
          <input
            id="ps-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label htmlFor="ps-client" className="block text-sm font-medium text-gray-700 mb-1">
            Client
          </label>
          <select
            id="ps-client"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            className={inputCls}
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
          <label htmlFor="ps-week" className="block text-sm font-medium text-gray-700 mb-1">
            Week Start (Monday)
          </label>
          <input
            id="ps-week"
            type="date"
            value={form.week_start}
            onChange={(e) => setForm({ ...form, week_start: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="ps-markup" className="block text-sm font-medium text-gray-700 mb-1">
            Markup Multiplier
          </label>
          <input
            id="ps-markup"
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
            className={inputCls}
          />
          <p className="text-xs text-gray-500 mt-1">
            Selling price = ingredient cost × multiplier
          </p>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">
            Nutrition Targets
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Protein and fat multiply by client&apos;s weight (kg). Carbs are
            derived from calories − protein − fat. Fiber target is 10–14 g
            per 1000 kcal. All compared against the weekly daily average.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ps-cal" className="block text-xs font-medium text-gray-700 mb-1">
                Calorie Target (kcal/day)
              </label>
              <input
                id="ps-cal"
                type="number"
                value={form.calorie_target ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    calorie_target: e.target.value
                      ? parseInt(e.target.value)
                      : null,
                  })
                }
                placeholder="e.g. 2000"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="ps-protein" className="block text-xs font-medium text-gray-700 mb-1">
                Protein (g/kg)
              </label>
              <input
                id="ps-protein"
                type="number"
                step="0.1"
                value={form.protein_per_kg ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    protein_per_kg: e.target.value
                      ? parseFloat(e.target.value)
                      : null,
                  })
                }
                placeholder="e.g. 1.6"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="ps-fat" className="block text-xs font-medium text-gray-700 mb-1">
                Fat (g/kg)
              </label>
              <input
                id="ps-fat"
                type="number"
                step="0.1"
                value={form.fat_per_kg ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    fat_per_kg: e.target.value
                      ? parseFloat(e.target.value)
                      : null,
                  })
                }
                placeholder="e.g. 0.8"
                className={inputCls}
              />
            </div>
          </div>
          {plan.client && plan.client.weight_kg == null && (
            <p className="text-xs text-amber-700 mt-2">
              Client has no weight set — macro targets won&apos;t resolve until
              you add a weight to the client.
            </p>
          )}
          {!plan.client && (
            <p className="text-xs text-amber-700 mt-2">
              No client linked — macro targets won&apos;t resolve until you
              link a client with a weight.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function ShoppingListModal({
  entries,
  categories,
  weekStart,
  planName,
  onClose,
}: {
  entries: FullEntry[];
  categories: Category[];
  weekStart: string;
  planName: string;
  onClose: () => void;
}) {
  const labels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.slug] = c.name;
    return m;
  }, [categories]);

  return (
    <Modal open onClose={onClose} size="lg" title="Shopping List">
      <ShoppingListPanel
        entries={entries}
        weekStart={weekStart}
        categoryLabels={labels}
        plansLabel={planName}
        emptyMessage="No entries in this meal plan yet."
      />
    </Modal>
  );
}

function DuplicatePlanModal({
  plan,
  entryCount,
  clients,
  onClose,
}: {
  plan: PlanWithClient;
  entryCount: number;
  clients: Client[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: `${plan.name} (copy)`,
    client_id: plan.client_id ?? "",
    week_start: addDays(plan.week_start, 7),
    markup_multiplier: plan.markup_multiplier,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    // Atomic server-side copy: plan + nutrition targets + all entries.
    const { data: newId, error: rpcErr } = await supabase.rpc("duplicate_meal_plan", {
      p_source_id: plan.id,
      p_name: form.name.trim(),
      p_client_id: form.client_id || null,
      p_week_start: form.week_start,
      p_markup_multiplier: form.markup_multiplier,
    });

    if (rpcErr || !newId) {
      const msg = rpcErr?.message ?? "Failed to duplicate plan";
      setError(msg);
      toast.error(`Duplicate failed: ${msg}`);
      setSaving(false);
      return;
    }

    await invalidateMealPlans();
    toast.success("Plan duplicated");
    router.push(`/meal-plans/${newId}`);
  }

  const inputCls =
    "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm";

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Duplicate Plan"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="duplicate-plan-form"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Duplicating..." : "Duplicate"}
          </button>
        </>
      }
    >
      <form id="duplicate-plan-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          Creates a new plan with all {entryCount} meal entries and the nutrition targets copied over.
        </p>
        <div>
          <label htmlFor="dp-name" className="block text-sm font-medium text-gray-700 mb-1">
            Plan Name *
          </label>
          <input
            id="dp-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputCls}
            required
          />
        </div>
        <div>
          <label htmlFor="dp-client" className="block text-sm font-medium text-gray-700 mb-1">
            Client
          </label>
          <select
            id="dp-client"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            className={inputCls}
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
          <label htmlFor="dp-week" className="block text-sm font-medium text-gray-700 mb-1">
            Week Start (Monday)
          </label>
          <input
            id="dp-week"
            type="date"
            value={form.week_start}
            onChange={(e) => setForm({ ...form, week_start: e.target.value })}
            className={inputCls}
            required
          />
          <p className="text-xs text-gray-500 mt-1">Defaults to the week after this plan.</p>
        </div>
        <div>
          <label htmlFor="dp-markup" className="block text-sm font-medium text-gray-700 mb-1">
            Markup Multiplier
          </label>
          <input
            id="dp-markup"
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
            className={inputCls}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function ExportModal({
  planId,
  clientEmail,
  onClose,
}: {
  planId: string;
  clientEmail: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleEmail() {
    if (!clientEmail) return;
    const ok = await confirm({
      title: `Send to ${clientEmail}?`,
      message: "The meal plan PDF will be emailed to the client.",
      confirmLabel: "Send email",
    });
    if (!ok) return;

    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/export/meal-plan?id=${planId}`, {
        method: "POST",
      });
      if (!res.ok) {
        let message = `Failed to send email (${res.status})`;
        try {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            if (data?.error) message = String(data.error);
          } catch {
            // non-JSON body (e.g. platform error page): keep status message
          }
        } catch {
          // ignore unreadable body
        }
        setError(message);
        toast.error(message, { action: { label: "Retry", onClick: () => void handleEmail() } });
      } else {
        setSent(true);
        toast.success(`PDF sent to ${clientEmail}`);
      }
    } catch {
      const message = "Failed to send email. Check your connection and try again.";
      setError(message);
      toast.error(message, { action: { label: "Retry", onClick: () => void handleEmail() } });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" title="Export Plan">
      <div className="space-y-3">
        <a
          href={`/api/export/meal-plan?id=${planId}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </a>

        <button
          onClick={handleEmail}
          disabled={!clientEmail || sending || sent}
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {sent ? (
            <>
              <Check className="w-4 h-4 text-green-600" />
              Sent to {clientEmail}
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              {sending ? "Sending..." : clientEmail ? `Email to ${clientEmail}` : "Email to Client"}
            </>
          )}
        </button>
        {!clientEmail && (
          <p className="text-xs text-gray-500 text-center">
            No email address on file for this client
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-red-600 text-center">{error}</p>
        )}
      </div>
    </Modal>
  );
}
