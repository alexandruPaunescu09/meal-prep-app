"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Slash } from "lucide-react";
import {  MealReview,
  MealStatus,  PortalEntry,
} from "@/lib/supabase/types";
import { entryNutrition } from "@/lib/portal/entry-helpers";
import ReviewComposer from "./review-composer";
import { saveMealStatus } from "@/lib/portal/save-status";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatQuantity } from "@/lib/format";

type FullEntry = PortalEntry;

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
  date,
  onClose,
}: {
  entry: FullEntry;
  existingReview: MealReview | null;
  existingStatus: MealStatus | null;
  isFuture: boolean;
  /** YYYY-MM-DD of the meal's day; used to explain why logging is hidden on future days. */
  date?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState<MealStatus | null>(existingStatus);
  const [savingStatus, setSavingStatus] = useState(false);
  const [reviewDirty, setReviewDirty] = useState(false);

  async function chooseStatus(s: MealStatus | null) {
    if (s === status || savingStatus) return;
    const previous = status;
    setStatus(s);
    setSavingStatus(true);
    try {
      const result = await saveMealStatus(entry.id, s);
      if (result === "queued") {
        toast.info("Saved offline — will sync when you're back online");
      } else {
        router.refresh();
      }
    } catch (e) {
      setStatus(previous);
      toast.error(e instanceof Error && e.message ? e.message : "Could not save your status", {
        action: { label: "Retry", onClick: () => void chooseStatus(s) },
      });
    } finally {
      setSavingStatus(false);
    }
  }

  const n = entryNutrition(entry);
  const title = entry.recipe?.name ?? entry.ingredient?.name ?? "—";
  const description = entry.recipe?.customer_description;

  const macroKcal = { protein: n.protein * 4, carbs: n.carbs * 4, fat: n.fat * 9 };
  const macroTotal = macroKcal.protein + macroKcal.carbs + macroKcal.fat;
  const pct = (v: number) => (macroTotal > 0 ? Math.round((v / macroTotal) * 100) : 0);

  return (
    <Modal
      open
      onClose={onClose}
      variant="sheet"
      title={
        <span className="block">
          <span className="block text-xs uppercase tracking-wide text-gray-500 font-medium">
            {mealLabels[entry.meal_type] ?? entry.meal_type}
          </span>
          <span className="block">{title}</span>
        </span>
      }
      description={entry.portions !== 1 ? `×${entry.portions} portions` : undefined}
      dirty={reviewDirty}
    >
      <div className="space-y-5">
        {description && (
          <p className="text-sm text-gray-700 leading-relaxed">{description}</p>
        )}

        {!isFuture && (
          <section className="sticky top-0 z-10 bg-white -mx-4 px-4 py-2 border-b">
            <h3 id="status-heading" className="text-sm font-semibold text-gray-900 mb-2">
              Did you eat this?
            </h3>
            <div role="group" aria-labelledby="status-heading" className="grid grid-cols-3 gap-2">
              <SegBtn
                active={status === null}
                onClick={() => chooseStatus(null)}
                disabled={savingStatus}
                icon={<Circle className="w-4 h-4" />}
                label="Not yet"
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
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Nutrition
            {entry.portions !== 1 && (
              <span className="font-normal text-gray-500"> · for ×{entry.portions} portions</span>
            )}
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-gray-50 rounded-xl p-3 text-sm">
            <NutRow label="Calories" value={`${Math.round(n.calories)} kcal`} />
            <NutRow label="Protein" value={`${Math.round(n.protein)} g`} />
            <NutRow label="Carbs" value={`${Math.round(n.carbs)} g`} />
            <NutRow label="Fat" value={`${Math.round(n.fat)} g`} />
            <NutRow label="Fiber" value={`${Math.round(n.fiber)} g`} />
          </div>
          {macroTotal > 0 && (
            <div className="mt-3">
              <div
                className="flex h-2.5 rounded-full overflow-hidden bg-gray-100"
                role="img"
                aria-label={`Calories from protein ${pct(macroKcal.protein)}%, carbs ${pct(macroKcal.carbs)}%, fat ${pct(macroKcal.fat)}%`}
              >
                <div className="bg-emerald-500" style={{ width: `${(macroKcal.protein / macroTotal) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${(macroKcal.carbs / macroTotal) * 100}%` }} />
                <div className="bg-sky-500" style={{ width: `${(macroKcal.fat / macroTotal) * 100}%` }} />
              </div>
              <div className="flex gap-4 mt-1.5 text-xs text-gray-600">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Protein {pct(macroKcal.protein)}%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Carbs {pct(macroKcal.carbs)}%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-500" /> Fat {pct(macroKcal.fat)}%
                </span>
              </div>
            </div>
          )}
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
                    <span className="text-gray-500 shrink-0">
                      {formatQuantity(scaled)} {ri.ingredient?.unit ?? "g"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {isFuture ? (
          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-3">
            {date
              ? `You can log and review this meal on ${formatDate(date)}.`
              : "You can log and review this meal once its day arrives."}
          </p>
        ) : (
          <section className="pt-2 border-t">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {existingReview ? "Your review" : "Leave a review"}
            </h3>
            <ReviewComposer
              entryId={entry.id}
              existingReview={existingReview}
              onSaved={() => onClose()}
              onDirtyChange={setReviewDirty}
            />
          </section>
        )}
      </div>
    </Modal>
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
      aria-pressed={active}
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
