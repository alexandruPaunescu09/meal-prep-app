"use client";

import { useState, useMemo } from "react";
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
import { calculateWeek, resolveTargets, ResolvedTargets } from "@/lib/calculations/meal-plan";
import { generateShoppingList, shoppingListToText } from "@/lib/calculations/shopping-list";
import { useShoppingChecks } from "@/lib/hooks/use-shopping-checks";
import { Plus, X, ArrowLeft, Trash2, Image, Download, Settings, ShoppingCart, Copy, Check, FileText, Truck, Loader2, GripVertical, Star, CheckCircle2, MinusCircle } from "lucide-react";
import Link from "next/link";
import DeliveryForm from "@/components/delivery-form";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

interface SlotPickerState {
  day: number;
  mealType: MealType;
}

export default function MealPlanGrid({
  plan,
  entries,
  recipes,
  clients,
  ingredients,
  categories,
  reviews = [],
  statuses = [],
}: {
  plan: PlanWithClient;
  entries: FullEntry[];
  recipes: { id: string; name: string; portions: number }[];
  clients: Client[];
  ingredients: Ingredient[];
  categories: Category[];
  reviews?: MealReview[];
  statuses?: MealEntryStatus[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [slotPicker, setSlotPicker] = useState<SlotPickerState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [addingEntry, setAddingEntry] = useState(false);
  const [removingEntry, setRemovingEntry] = useState<string | null>(null);
  const [activeEntry, setActiveEntry] = useState<FullEntry | null>(null);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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

  async function handleDragEnd(event: DragEndEvent) {
    setActiveEntry(null);
    const { active, over } = event;
    if (!over) return;

    const entryId = active.id as string;
    const [, dayStr, mealType] = (over.id as string).split("-");
    const newDay = parseInt(dayStr);
    const newMealType = mealType as MealType;

    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    if (entry.day_of_week === newDay && entry.meal_type === newMealType) return;

    await supabase
      .from("meal_plan_entries")
      .update({ day_of_week: newDay, meal_type: newMealType })
      .eq("id", entryId);
    router.refresh();
  }

  async function addEntry(recipeId: string, portions: number) {
    if (!slotPicker) return;
    setAddingEntry(true);
    await supabase.from("meal_plan_entries").insert({
      meal_plan_id: plan.id,
      day_of_week: slotPicker.day,
      meal_type: slotPicker.mealType,
      recipe_id: recipeId,
      portions,
    });
    setSlotPicker(null);
    setAddingEntry(false);
    router.refresh();
  }

  async function removeEntry(entryId: string) {
    setRemovingEntry(entryId);
    await supabase.from("meal_plan_entries").delete().eq("id", entryId);
    setRemovingEntry(null);
    router.refresh();
  }

  async function addIngredientEntry(ingredientId: string, quantity: number) {
    if (!slotPicker) return;
    setAddingEntry(true);
    await supabase.from("meal_plan_entries").insert({
      meal_plan_id: plan.id,
      day_of_week: slotPicker.day,
      meal_type: slotPicker.mealType,
      ingredient_id: ingredientId,
      quantity,
      portions: 1,
    });
    setSlotPicker(null);
    setAddingEntry(false);
    router.refresh();
  }


  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/meal-plans"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 truncate">{plan.name}</h1>
          <p className="text-sm text-gray-500">
            Week of {plan.week_start}
            {plan.client && ` • ${plan.client.name}`}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={() => setShowShoppingList(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Shopping List
          </button>
          <button
            onClick={() => setShowDuplicate(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </button>
          {plan.client_id && (
            <button
              onClick={() => setShowDelivery(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <Truck className="w-3.5 h-3.5" />
              Log Delivery
            </button>
          )}
        </div>
      </div>

      {/* Mobile stacked day view */}
      <div className="md:hidden space-y-3 mb-6">
        {DAYS.map((dayLabel, dayIdx) => {
          const day = dayIdx + 1;
          const dayTotals = weekTotals.days[day];
          const hasEntries = dayTotals.calories > 0;
          return (
            <div key={dayLabel} className="bg-white rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
                <span className="text-sm font-semibold text-gray-700">{dayLabel}</span>
                {hasEntries && (
                  <span className="text-[10px] text-gray-500">
                    {Math.round(dayTotals.calories)} kcal • {dayTotals.cost.toFixed(2)} lei
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
                        <button
                          onClick={() => setSlotPicker({ day, mealType })}
                          className="p-1 rounded hover:bg-gray-100"
                        >
                          <Plus className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                      {slotEntries.length === 0 ? (
                        <p className="text-xs text-gray-300 italic">Empty</p>
                      ) : (
                        <div className="space-y-1">
                          {slotEntries.map((entry) => {
                            const review = reviewMap.get(entry.id);
                            const status = statusMap.get(entry.id);
                            return (
                            <div
                              key={entry.id}
                              className={`flex items-center justify-between bg-emerald-50 rounded px-2 py-1 transition-opacity ${removingEntry === entry.id ? "opacity-50 pointer-events-none" : ""}`}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-gray-900 truncate flex items-center gap-1">
                                  {status === "eaten" && (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                                  )}
                                  {status === "skipped" && (
                                    <MinusCircle className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                  )}
                                  <span className="truncate">
                                    {entry.recipe ? entry.recipe.name : entry.ingredient?.name ?? "Unknown"}
                                  </span>
                                  {review && (
                                    <span className="text-[10px] text-amber-600 flex items-center gap-0.5 flex-shrink-0">
                                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                      {review.rating}
                                    </span>
                                  )}
                                </p>
                                <p className="text-[10px] text-gray-500">
                                  {entry.recipe
                                    ? `×${entry.portions}`
                                    : `${entry.quantity}g${entry.portions !== 1 ? ` ×${entry.portions}` : ""}`}
                                </p>
                              </div>
                              <button
                                onClick={() => removeEntry(entry.id)}
                                disabled={removingEntry === entry.id}
                                className="p-1 rounded hover:bg-red-100"
                              >
                                {removingEntry === entry.id ? (
                                  <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
                                ) : (
                                  <X className="w-3 h-3 text-red-500" />
                                )}
                              </button>
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
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="hidden md:block bg-white rounded-xl border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20"></th>
                {DAYS.map((day, idx) => (
                  <th
                    key={day}
                    className="text-center px-2 py-2 font-medium text-gray-600 min-w-[140px]"
                  >
                    {day}
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
                  {DAYS.map((_, dayIdx) => {
                    const day = dayIdx + 1;
                    const slotEntries = getEntriesForSlot(day, mealType);
                    return (
                      <DroppableSlot key={`${day}-${mealType}`} day={day} mealType={mealType}>
                        <div className="space-y-1 min-h-[48px]">
                          {slotEntries.map((entry) => (
                            <DraggableEntry key={entry.id} entry={entry} removingEntry={removingEntry} onRemove={removeEntry} review={reviewMap.get(entry.id)} status={statusMap.get(entry.id)} />
                          ))}
                          <button
                            onClick={() => setSlotPicker({ day, mealType })}
                            className="w-full flex items-center justify-center gap-1 py-1 rounded border border-dashed border-gray-200 text-gray-400 hover:border-emerald-300 hover:text-emerald-500 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
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
                {DAYS.map((_, dayIdx) => {
                  const day = dayIdx + 1;
                  const dayTotals = weekTotals.days[day];
                  const hasEntries = dayTotals.calories > 0;
                  return (
                    <td
                      key={day}
                      className="px-2 py-2 text-center border-r last:border-r-0"
                    >
                      {hasEntries ? (
                        <div className="text-[10px] space-y-0.5">
                          <p className="font-semibold text-gray-900">
                            {Math.round(dayTotals.calories)} kcal
                          </p>
                          <p className="text-gray-500">
                            P:{dayTotals.protein.toFixed(0)} C:{dayTotals.carbs.toFixed(0)} F:{dayTotals.fat.toFixed(0)} Fi:{dayTotals.fiber.toFixed(0)}
                          </p>
                          <p className="text-emerald-700 font-medium">
                            {dayTotals.cost.toFixed(2)} lei
                          </p>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
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
              {activeEntry.recipe ? activeEntry.recipe.name : activeEntry.ingredient?.name ?? "Unknown"}
            </p>
            <p className="text-[10px] text-gray-500">
              {activeEntry.recipe
                ? `×${activeEntry.portions}`
                : `${activeEntry.quantity}g${activeEntry.portions !== 1 ? ` ×${activeEntry.portions}` : ""}`}
            </p>
          </div>
        )}
      </DragOverlay>
      </DndContext>

      {/* Weekly summary */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Weekly Summary
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <div>
            <p className="text-xs text-gray-500">Ingredient Cost</p>
            <p className="text-lg font-bold text-gray-900">
              {weekTotals.totalCost.toFixed(2)} lei
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">
              Selling Price ({plan.markup_multiplier}×)
            </p>
            <p className="text-lg font-bold text-emerald-700">
              {weekTotals.sellingPrice.toFixed(2)} lei
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
      </div>

      {/* Slot picker modal */}
      {slotPicker && (
        <SlotPicker
          day={slotPicker.day}
          mealType={slotPicker.mealType}
          recipes={recipes}
          ingredients={ingredients}
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
          onClose={() => setShowShoppingList(false)}
        />
      )}

      {/* Duplicate modal */}
      {showDuplicate && (
        <DuplicatePlanModal
          plan={plan}
          entries={entries}
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

function DraggableEntry({ entry, removingEntry, onRemove, review, status }: { entry: FullEntry; removingEntry: string | null; onRemove: (id: string) => void; review?: MealReview; status?: MealStatus }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entry.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-between bg-emerald-50 rounded px-2 py-1 group transition-opacity ${
        removingEntry === entry.id ? "opacity-50 pointer-events-none" : ""
      } ${isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        >
          <GripVertical className="w-3 h-3 text-gray-400" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900 truncate flex items-center gap-1">
            {status === "eaten" && (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
            )}
            {status === "skipped" && (
              <MinusCircle className="w-3 h-3 text-gray-400 flex-shrink-0" />
            )}
            <span className="truncate">
              {entry.recipe ? entry.recipe.name : entry.ingredient?.name ?? "Unknown"}
            </span>
            {review && (
              <span className="text-[10px] text-amber-600 flex items-center gap-0.5 flex-shrink-0">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                {review.rating}
              </span>
            )}
          </p>
          <p className="text-[10px] text-gray-500">
            {entry.recipe
              ? `×${entry.portions}`
              : `${entry.quantity}g${entry.portions !== 1 ? ` ×${entry.portions}` : ""}`}
          </p>
        </div>
      </div>
      <button
        onClick={() => onRemove(entry.id)}
        disabled={removingEntry === entry.id}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-opacity"
      >
        {removingEntry === entry.id ? (
          <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
        ) : (
          <X className="w-3 h-3 text-red-500" />
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
        <p className="text-[10px] text-gray-400 mt-0.5">
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
        <span className="text-xs font-normal text-gray-400">
          {" "}/ {fmt(target)}{unit}
        </span>
      </p>
      <span
        className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded ${badgeClass}`}
      >
        {sign}{fmt(delta)}{unit} ({Math.round(pct)}%)
      </span>
      {hint && (
        <p className="text-[10px] text-amber-600 mt-0.5">{hint}</p>
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
        <p className="text-[10px] text-gray-400 mt-0.5">no target set</p>
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
        <span className="text-xs font-normal text-gray-400">
          {" "}/ {fmt(range.min)}–{fmt(range.max)}{unit}
        </span>
      </p>
      <span
        className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded ${badgeClass}`}
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
  onAdd,
  onAddIngredient,
  onClose,
  adding,
}: {
  day: number;
  mealType: MealType;
  recipes: { id: string; name: string; portions: number }[];
  ingredients: Ingredient[];
  onAdd: (recipeId: string, portions: number) => void;
  onAddIngredient: (ingredientId: string, quantity: number) => void;
  onClose: () => void;
  adding: boolean;
}) {
  const [tab, setTab] = useState<"recipes" | "ingredients">("recipes");
  const [search, setSearch] = useState("");
  const [portions, setPortions] = useState(1);
  const [quantity, setQuantity] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleSelectRecipe(recipeId: string) {
    setSelectedId(recipeId);
    onAdd(recipeId, portions);
  }

  function handleSelectIngredient(ingredientId: string) {
    setSelectedId(ingredientId);
    onAddIngredient(ingredientId, quantity);
  }

  const filteredRecipes = recipes.filter(
    (r) =>
      search.length === 0 ||
      r.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredIngredients = ingredients.filter(
    (i) =>
      search.length === 0 ||
      i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[60vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">
            {DAYS[day - 1]} — {MEAL_LABELS[mealType]}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex border-b">
          <button
            onClick={() => { setTab("recipes"); setSearch(""); }}
            className={`flex-1 px-4 py-2 text-sm font-medium ${tab === "recipes" ? "border-b-2 border-emerald-500 text-emerald-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            Recipes
          </button>
          <button
            onClick={() => { setTab("ingredients"); setSearch(""); }}
            className={`flex-1 px-4 py-2 text-sm font-medium ${tab === "ingredients" ? "border-b-2 border-emerald-500 text-emerald-700" : "text-gray-500 hover:text-gray-700"}`}
          >
            Ingredients
          </button>
        </div>
        <div className="px-4 py-2 border-b space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "recipes" ? "Search recipes..." : "Search ingredients..."}
            className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            autoFocus
          />
          {tab === "recipes" ? (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Portions:</label>
              <input
                type="number"
                min={0.1}
                step="0.1"
                value={portions}
                onChange={(e) => setPortions(parseFloat(e.target.value) || 1)}
                className="w-16 px-2 py-1 border rounded text-sm text-gray-900 text-center focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Quantity (g):</label>
              <input
                type="number"
                min={1}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 100)}
                className="w-20 px-2 py-1 border rounded text-sm text-gray-900 text-center focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {tab === "recipes" ? (
            filteredRecipes.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No recipes found.
              </p>
            ) : (
              <div className="space-y-1">
                {filteredRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => handleSelectRecipe(recipe.id)}
                    disabled={adding}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-sm transition-colors flex items-center justify-between ${adding ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div>
                      <span className="font-medium text-gray-900">
                        {recipe.name}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {recipe.portions} portion{recipe.portions > 1 ? "s" : ""}
                      </span>
                    </div>
                    {adding && selectedId === recipe.id && (
                      <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            )
          ) : (
            filteredIngredients.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No ingredients found.
              </p>
            ) : (
              <div className="space-y-1">
                {filteredIngredients.map((ing) => (
                  <button
                    key={ing.id}
                    onClick={() => handleSelectIngredient(ing.id)}
                    disabled={adding}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-sm transition-colors flex items-center justify-between ${adding ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div>
                      <span className="font-medium text-gray-900">
                        {ing.name}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {ing.category}
                      </span>
                    </div>
                    {adding && selectedId === ing.id && (
                      <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                    )}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: plan.name,
    client_id: plan.client_id ?? "",
    week_start: plan.week_start,
    markup_multiplier: plan.markup_multiplier,
    calorie_target: plan.calorie_target ?? (null as number | null),
    protein_per_kg: plan.protein_per_kg ?? (null as number | null),
    fat_per_kg: plan.fat_per_kg ?? (null as number | null),
  });

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
      setSaving(false);
    } else {
      router.refresh();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Plan Settings</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plan Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <select
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Week Start (Monday)
            </label>
            <input
              type="date"
              value={form.week_start}
              onChange={(e) => setForm({ ...form, week_start: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Markup Multiplier
            </label>
            <input
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
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Calorie Target (kcal/day)
                </label>
                <input
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
                  className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Protein (g/kg)
                </label>
                <input
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
                  className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Fat (g/kg)
                </label>
                <input
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
                  className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                />
              </div>
            </div>
            {plan.client && plan.client.weight_kg == null && (
              <p className="text-xs text-amber-600 mt-2">
                Client has no weight set — macro targets won&apos;t resolve until
                you add a weight to the client.
              </p>
            )}
            {!plan.client && (
              <p className="text-xs text-amber-600 mt-2">
                No client linked — macro targets won&apos;t resolve until you
                link a client with a weight.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

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
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShoppingListModal({
  entries,
  categories,
  weekStart,
  onClose,
}: {
  entries: FullEntry[];
  categories: Category[];
  weekStart: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { checkedItems, toggle: toggleItem } = useShoppingChecks(weekStart);
  const { groups, totalCost } = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const c of categories) labels[c.slug] = c.name;
    return generateShoppingList(entries, labels);
  }, [entries, categories]);

  function handleCopy() {
    const filteredGroups = groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => !checkedItems.has(i.ingredientId)),
        subtotal: g.items
          .filter((i) => !checkedItems.has(i.ingredientId))
          .reduce((sum, i) => sum + i.estimatedCost, 0),
      }))
      .filter((g) => g.items.length > 0);
    const filteredCost = filteredGroups.reduce((s, g) => s + g.subtotal, 0);
    const text = shoppingListToText(filteredGroups, filteredCost);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Shopping List</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              No entries in this meal plan yet.
            </p>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <div key={group.category}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {group.label}
                  </h3>
                  <div className="space-y-1">
                    {group.items.map((item) => (
                      <div
                        key={item.ingredientId}
                        className={`flex items-center gap-2 py-1.5 px-3 bg-gray-50 rounded-lg ${checkedItems.has(item.ingredientId) ? "opacity-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checkedItems.has(item.ingredientId)}
                          onChange={() => toggleItem(item.ingredientId)}
                          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                        />
                        <span className={`text-sm font-medium text-gray-900 flex-1 ${checkedItems.has(item.ingredientId) ? "line-through" : ""}`}>
                          {item.name}
                        </span>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-gray-600">
                            {item.totalQuantity % 1 === 0
                              ? item.totalQuantity
                              : item.totalQuantity.toFixed(1)}
                            {item.unit}
                          </span>
                          <span className="text-emerald-700 font-medium w-20 text-right">
                            {item.estimatedCost.toFixed(2)} lei
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 text-right mt-1">
                    Subtotal: {group.subtotal.toFixed(2)} lei
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {groups.length > 0 && (
          <div className="px-6 py-4 border-t bg-emerald-50 rounded-b-xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                Total Estimated Cost
              </span>
              <span className="text-lg font-bold text-emerald-700">
                {totalCost.toFixed(2)} lei
              </span>
            </div>
            {checkedItems.size > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {checkedItems.size} item{checkedItems.size !== 1 ? "s" : ""} checked (in stock)
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DuplicatePlanModal({
  plan,
  entries,
  clients,
  onClose,
}: {
  plan: PlanWithClient;
  entries: FullEntry[];
  clients: Client[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  const defaultWeekStart = nextMonday.toISOString().split("T")[0];

  const [form, setForm] = useState({
    name: `${plan.name} (copy)`,
    client_id: plan.client_id ?? "",
    week_start: defaultWeekStart,
    markup_multiplier: plan.markup_multiplier,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { data: newPlan, error: createErr } = await supabase
      .from("meal_plans")
      .insert({
        name: form.name.trim(),
        client_id: form.client_id || null,
        week_start: form.week_start,
        markup_multiplier: form.markup_multiplier,
      })
      .select("id")
      .single();

    if (createErr || !newPlan) {
      setError(createErr?.message ?? "Failed to create plan");
      setSaving(false);
      return;
    }

    if (entries.length > 0) {
      const { error: entriesErr } = await supabase
        .from("meal_plan_entries")
        .insert(
          entries.map((e) => ({
            meal_plan_id: newPlan.id,
            day_of_week: e.day_of_week,
            meal_type: e.meal_type,
            recipe_id: e.recipe_id,
            ingredient_id: e.ingredient_id,
            quantity: e.quantity,
            portions: e.portions,
          }))
        );

      if (entriesErr) {
        setError(entriesErr.message);
        setSaving(false);
        return;
      }
    }

    router.push(`/meal-plans/${newPlan.id}`);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Duplicate Plan</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-500">
            This will create a new plan with all {entries.length} meal entries copied over.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plan Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <select
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Week Start (Monday)
            </label>
            <input
              type="date"
              value={form.week_start}
              onChange={(e) => setForm({ ...form, week_start: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Markup Multiplier
            </label>
            <input
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
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

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
              className="flex-1 py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {saving ? "Duplicating..." : "Duplicate"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleEmail() {
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/export/meal-plan?id=${planId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to send email");
      } else {
        setSent(true);
      }
    } catch {
      setError("Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Export Plan</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-3">
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
                Sent!
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                {sending ? "Sending..." : "Email to Client"}
              </>
            )}
          </button>
          {!clientEmail && (
            <p className="text-xs text-gray-400 text-center">
              No email address on file for this client
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600 text-center">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
