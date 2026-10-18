"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { MealEntryStatus, MealPlan, MealReview, PortalEntry } from "@/lib/supabase/types";
import MealCard, { MealCardData } from "@/components/portal/meal-card";
import MealDetailSheet from "@/components/portal/meal-detail-sheet";
import { sortByMealType, compareLocalDate } from "@/lib/portal/entry-helpers";
import { planEntryNutrition } from "@/lib/calculations/diary";
import { useMealStatus } from "@/lib/portal/use-meal-status";
import { addDays, formatShortDate, formatWeekRange, WEEKDAYS_SHORT } from "@/lib/format";

type FullEntry = PortalEntry;

export default function PlanDetailClient({
  plan,
  entries,
  statuses,
  reviews,
  isCurrent,
  initialDow,
  todayDate,
}: {
  plan: MealPlan;
  entries: FullEntry[];
  statuses: MealEntryStatus[];
  reviews: MealReview[];
  isCurrent: boolean;
  initialDow: number;
  todayDate: string;
}) {
  const [dow, setDow] = useState(initialDow);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const { stateOf, saving, applyChanges } = useMealStatus(statuses);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Calendar date for each tab (index 0 = Monday = dow 1).
  const dayDates = useMemo(
    () => WEEKDAYS_SHORT.map((_, idx) => addDays(plan.week_start, idx)),
    [plan.week_start]
  );

  const dayEntries = useMemo(
    () => sortByMealType(entries.filter((e) => e.day_of_week === dow)),
    [entries, dow]
  );

  const cards: MealCardData[] = useMemo(() => {
    const reviewByEntry = new Map(reviews.map((r) => [r.meal_plan_entry_id, r]));
    return dayEntries.map((e) => {
      const n = planEntryNutrition(e);
      const st = stateOf(e.id);
      return {
        entryId: e.id,
        mealType: e.meal_type,
        recipeName: e.recipe?.name ?? null,
        ingredientName: e.ingredient?.name ?? null,
        portions: e.portions,
        quantity: e.quantity,
        calories: n.calories,
        protein: n.protein,
        carbs: n.carbs,
        fat: n.fat,
        status: st.status,
        portionFactor: st.factor,
        rating: reviewByEntry.get(e.id)?.rating ?? null,
      };
    });
  }, [dayEntries, stateOf, reviews]);

  // Keep the selected day's tab visible when the strip overflows horizontally.
  useEffect(() => {
    tabRefs.current[dow - 1]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [dow]);

  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % WEEKDAYS_SHORT.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + WEEKDAYS_SHORT.length) % WEEKDAYS_SHORT.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = WEEKDAYS_SHORT.length - 1;
    if (next === null) return;
    e.preventDefault();
    setDow(next + 1);
    tabRefs.current[next]?.focus();
  }

  const open = openEntryId ? entries.find((e) => e.id === openEntryId) ?? null : null;
  const openReview = open ? reviews.find((r) => r.meal_plan_entry_id === open.id) ?? null : null;
  const openDate = open ? dayDates[open.day_of_week - 1] : null;
  const openIsFuture = openDate
    ? compareLocalDate(openDate, todayDate) > 0
    : false;

  const selectedDate = dayDates[dow - 1];
  // Logging is allowed for today and past days only (local-date comparison).
  const canLog = compareLocalDate(selectedDate, todayDate) <= 0;

  return (
    <div className="space-y-4">
      <Link
        href="/portal/plans"
        className="inline-flex items-center gap-1 min-h-[44px] text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" />
        Back to plans
      </Link>

      <header className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">{plan.name}</h1>
          {isCurrent && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-medium">
              This week
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600">{formatWeekRange(plan.week_start)}</p>
      </header>

      <nav aria-label="Days" className="overflow-x-auto -mx-4 px-4">
        <div role="tablist" aria-label="Plan days" className="flex gap-2 min-w-max pb-1">
          {WEEKDAYS_SHORT.map((label, idx) => {
            const dayNum = idx + 1;
            const date = dayDates[idx];
            const active = dow === dayNum;
            const isToday = date === todayDate;
            return (
              <button
                key={label}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                type="button"
                role="tab"
                id={`plan-day-tab-${dayNum}`}
                aria-selected={active}
                aria-controls="plan-day-panel"
                tabIndex={active ? 0 : -1}
                aria-label={`${formatShortDate(date)}${isToday ? ", today" : ""}`}
                onClick={() => setDow(dayNum)}
                onKeyDown={(e) => onTabKeyDown(e, idx)}
                className={`flex flex-col items-center justify-center min-w-[56px] min-h-[52px] px-3 rounded-2xl border text-xs font-medium ${
                  active
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : isToday
                    ? "bg-white text-gray-900 border-emerald-400 hover:bg-gray-50"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span>{label}</span>
                <span className="text-base font-semibold leading-tight">
                  {parseInt(date.slice(8, 10), 10)}
                </span>
                {isToday && (
                  <span className={`text-[10px] leading-tight ${active ? "text-white" : "text-emerald-700"}`}>
                    Today
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div
        id="plan-day-panel"
        role="tabpanel"
        aria-labelledby={`plan-day-tab-${dow}`}
        className="space-y-3"
      >
        {cards.length === 0 ? (
          <div className="bg-white rounded-2xl border p-6 text-center text-sm text-gray-500">
            No meals scheduled for {WEEKDAYS_SHORT[dow - 1]}.
          </div>
        ) : (
          cards.map((c) => (
            <MealCard
              key={c.entryId}
              meal={c}
              saving={saving.has(c.entryId)}
              onToggleEaten={
                canLog
                  ? () =>
                      void applyChanges([
                        { entryId: c.entryId, status: c.status === "eaten" ? null : "eaten", factor: null },
                      ])
                  : undefined
              }
              onTap={() => setOpenEntryId(c.entryId)}
            />
          ))
        )}

        <div className="pt-1">
          <Link
            href={`/portal?date=${selectedDate}`}
            className="inline-flex items-center gap-1 min-h-[44px] text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            Open {formatShortDate(selectedDate)} in Today
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {open && (
        <MealDetailSheet
          entry={open}
          existingReview={openReview}
          existingStatus={stateOf(open.id).status}
          onChangeStatus={(status) => applyChanges([{ entryId: open.id, status, factor: null }])}
          isFuture={openIsFuture}
          date={openDate ?? undefined}
          onClose={() => setOpenEntryId(null)}
        />
      )}
    </div>
  );
}
