"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Check, Circle, Slash } from "lucide-react";
import {
  Ingredient,
  MealPlanEntry,
  MealReview,
  MealStatus,
  Recipe,
  RecipeIngredient,
} from "@/lib/supabase/types";
import { entryNutrition } from "@/lib/portal/entry-helpers";
import ReviewComposer from "./review-composer";
import { queueWrite } from "@/lib/portal/write-queue";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

const mealLabels: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export default function MealDetailSheet({
  entry,
  existingReview,
  existingStatus,
  isFuture,
  onClose,
}: {
  entry: FullEntry;
  existingReview: MealReview | null;
  existingStatus: MealStatus | null;
  isFuture: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<MealStatus | null>(existingStatus);
  const [savingStatus, setSavingStatus] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  async function chooseStatus(s: MealStatus | null) {
    setStatus(s);
    setSavingStatus(true);
    try {
      const r = await fetch("/api/portal/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal_plan_entry_id: entry.id, status: s }),
      });
      if (!r.ok) throw new Error("save failed");
      router.refresh();
    } catch (e) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        queueWrite({
          kind: "status",
          payload: { meal_plan_entry_id: entry.id, status: s },
        });
      }
    } finally {
      setSavingStatus(false);
    }
  }

  const n = entryNutrition(entry);
  const title = entry.recipe?.name ?? entry.ingredient?.name ?? "—";
  const description = entry.recipe?.customer_description;

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-xl">
        <div className="sticky top-0 bg-white px-4 pt-4 pb-3 border-b flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500 font-medium">
              {mealLabels[entry.meal_type] ?? entry.meal_type}
            </p>
            <h2 className="text-lg font-bold text-gray-900 mt-0.5">{title}</h2>
            {entry.portions !== 1 && (
              <p className="text-xs text-gray-500 mt-0.5">×{entry.portions} portions</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 -m-2 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {description && (
            <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
          )}

          {!isFuture && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Did you eat this?</h3>
              <div className="grid grid-cols-3 gap-2">
                <SegBtn
                  active={status === null}
                  onClick={() => chooseStatus(null)}
                  disabled={savingStatus}
                  icon={<Circle className="w-4 h-4" />}
                  label="Pending"
                />
                <SegBtn
                  active={status === "eaten"}
                  onClick={() => chooseStatus("eaten")}
                  disabled={savingStatus}
                  tone="emerald"
                  icon={<Check className="w-4 h-4" />}
                  label="Eaten"
                />
                <SegBtn
                  active={status === "skipped"}
                  onClick={() => chooseStatus("skipped")}
                  disabled={savingStatus}
                  tone="gray"
                  icon={<Slash className="w-4 h-4" />}
                  label="Skipped"
                />
              </div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Nutrition</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-gray-50 rounded-xl p-3 text-sm">
              <NutRow label="Calories" value={`${Math.round(n.calories)} kcal`} />
              <NutRow label="Protein" value={`${Math.round(n.protein)} g`} />
              <NutRow label="Carbs" value={`${Math.round(n.carbs)} g`} />
              <NutRow label="Fat" value={`${Math.round(n.fat)} g`} />
              <NutRow label="Fiber" value={`${Math.round(n.fiber)} g`} />
            </div>
          </section>

          {entry.recipe && entry.recipe.recipe_ingredients.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Ingredients</h3>
              <ul className="space-y-1 text-sm text-gray-700">
                {entry.recipe.recipe_ingredients.map((ri) => {
                  const scaled = (ri.quantity / entry.recipe!.portions) * entry.portions;
                  return (
                    <li key={ri.id} className="flex justify-between gap-2">
                      <span>{ri.ingredient?.name ?? "—"}</span>
                      <span className="text-gray-500">
                        {scaled.toFixed(0)} {ri.ingredient?.unit ?? "g"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {!isFuture && (
            <section className="pt-2 border-t">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                {existingReview ? "Your review" : "Leave a review"}
              </h3>
              <ReviewComposer
                entryId={entry.id}
                existingReview={existingReview}
                onSaved={() => onClose()}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SegBtn({
  active,
  onClick,
  disabled,
  icon,
  label,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "emerald" | "gray";
}) {
  const activeStyles =
    tone === "emerald"
      ? "bg-emerald-600 text-white border-emerald-600"
      : tone === "gray"
      ? "bg-gray-700 text-white border-gray-700"
      : "bg-gray-100 text-gray-900 border-gray-300";
  const idleStyles = "bg-white text-gray-700 border-gray-300 hover:bg-gray-50";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg border text-sm font-medium ${
        active ? activeStyles : idleStyles
      } disabled:opacity-50`}
    >
      {icon}
      {label}
    </button>
  );
}

function NutRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-600">{label}</span>
      <span className="text-right text-gray-900 font-medium">{value}</span>
    </>
  );
}
