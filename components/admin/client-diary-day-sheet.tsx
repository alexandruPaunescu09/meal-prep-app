"use client";

import { Check, X as XIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import DiarySummary from "@/components/portal/diary-summary";
import DiarySection from "@/components/portal/diary-section";
import DiaryEntryList from "@/components/portal/diary-entry-list";
import { formatFactor } from "@/components/portal/portion-factor-sheet";
import { MEAL_TYPES } from "@/lib/calculations/diary";
import { formatDate, formatNumber } from "@/lib/format";
import type { DayView } from "@/lib/data/client-diary-view";

const noop = () => {};

/** Read-only view of one client day: the same summary / sections the customer sees, no actions. */
export default function ClientDiaryDaySheet({ day, onClose }: { day: DayView | null; onClose: () => void }) {
  return (
    <Modal
      open={day != null}
      onClose={onClose}
      title={day ? formatDate(day.date) : ""}
      description={day?.planName ? `Plan: ${day.planName}` : "No meal plan covers this day"}
      size="lg"
    >
      {day && (
        <div className="space-y-5" data-testid="day-detail">
          <DiarySummary
            eaten={day.diary.eaten}
            projected={day.diary.projected}
            targets={day.targets}
            hasPendingPlan={day.diary.counts.planPending > 0}
            isFuture={false}
          />
          {day.planMeals.length === 0 && day.logs.length === 0 && (
            <p className="text-sm text-gray-500">Nothing planned or logged this day.</p>
          )}
          {MEAL_TYPES.map((m) => {
            const meals = day.planMeals.filter((p) => p.mealType === m);
            const logs = day.logs.filter((l) => l.meal_type === m);
            if (meals.length === 0 && logs.length === 0) return null;
            return (
              <DiarySection key={m} mealType={m} eatenKcal={day.diary.byMeal[m].calories} canAdd={false} onAdd={noop}>
                {meals.length > 0 && (
                  <ul className="divide-y divide-gray-100 bg-white rounded-2xl border border-gray-200">
                    {meals.map((p) => {
                      const factor = p.status === "eaten" ? (p.portionFactor ?? 1) : 1;
                      return (
                        <li key={p.entryId} className="flex items-center gap-3 px-4 py-3">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-900 break-words">{p.title}</span>
                            <span className="block text-xs text-gray-500">
                              Plan · P {formatNumber(Math.round(p.protein * factor), 0)} · C{" "}
                              {formatNumber(Math.round(p.carbs * factor), 0)} · F{" "}
                              {formatNumber(Math.round(p.fat * factor), 0)} g
                            </span>
                          </span>
                          <span className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-sm font-medium text-gray-900">
                              {formatNumber(Math.round(p.calories * factor), 0)} kcal
                            </span>
                            {p.status === "eaten" ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                <Check className="w-3 h-3" aria-hidden />
                                Eaten{p.portionFactor != null && p.portionFactor !== 1 ? ` ${formatFactor(p.portionFactor)}` : ""}
                              </span>
                            ) : p.status === "skipped" ? (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
                                <XIcon className="w-3 h-3" aria-hidden />
                                Skipped
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">
                                Not marked
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <DiaryEntryList entries={logs} />
              </DiarySection>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
