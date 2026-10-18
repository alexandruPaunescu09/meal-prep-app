"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MealEntryStatus, MealReview, PortalEntry } from "@/lib/supabase/types";
import MealCard, { MealCardData } from "@/components/portal/meal-card";
import MealDetailSheet from "@/components/portal/meal-detail-sheet";
import DayScrubber from "@/components/portal/day-scrubber";
import {
  addDaysLocal,
  entryNutrition,
  parseLocalDate,
  sortByMealType,
} from "@/lib/portal/entry-helpers";
import { formatShortDate, formatNumber } from "@/lib/format";

const FULL_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function daysApart(a: string, b: string): number {
  const da = parseLocalDate(a);
  const db = parseLocalDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

type FullEntry = PortalEntry;

export default function TodayClient({
  planId,
  planName,
  selectedDate,
  todayDate,
  isFuture,
  planDates,
  calorieTarget,
  entries,
  statuses,
  reviews,
}: {
  planId: string | null;
  planName: string | null;
  selectedDate: string;
  todayDate: string;
  isFuture: boolean;
  planDates: string[];
  calorieTarget: number | null;
  entries: FullEntry[];
  statuses: MealEntryStatus[];
  reviews: MealReview[];
}) {
  const router = useRouter();
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  // pendingDate: the date the user has tapped/picked but for which the
  // server-rendered prop hasn't caught up yet. Drives the scrubber's
  // selected-pill style, the calendar's spinner, and the cards-area
  // skeleton. Cleared by the effect below when selectedDate matches.
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  if (pendingDate && pendingDate === selectedDate) {
    setPendingDate(null);
  }

  // A 100ms gate — fast loads (cache hit, etc.) never flash skeletons.
  // showSkeleton becomes true only if the navigation is still in-flight
  // 100ms after the user's tap.
  const isPending = pendingDate !== null && pendingDate !== selectedDate;
  const [skeletonGate, setSkeletonGate] = useState(false);
  useEffect(() => {
    if (!isPending) return;
    const t = setTimeout(() => setSkeletonGate(true), 100);
    return () => {
      clearTimeout(t);
      setSkeletonGate(false);
    };
  }, [isPending]);
  const showSkeleton = isPending && skeletonGate;

  // Offline writes just reached the server: re-fetch so the "x of y logged" and
  // kcal-eaten header reflect them.
  useEffect(() => {
    const onFlushed = () => router.refresh();
    window.addEventListener("portal:queue-flushed", onFlushed);
    return () => window.removeEventListener("portal:queue-flushed", onFlushed);
  }, [router]);

  const sorted = useMemo(() => sortByMealType(entries), [entries]);
  const planDateSet = useMemo(() => new Set(planDates), [planDates]);

  const cards: MealCardData[] = useMemo(() => {
    const byEntry = new Map(statuses.map((s) => [s.meal_plan_entry_id, s]));
    const reviewByEntry = new Map(
      reviews.map((r) => [r.meal_plan_entry_id, r])
    );
    return sorted.map((e) => {
      const n = entryNutrition(e);
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
        status: byEntry.get(e.id)?.status ?? null,
        rating: reviewByEntry.get(e.id)?.rating ?? null,
      };
    });
  }, [sorted, statuses, reviews]);

  const totalKcal = cards.reduce((s, c) => s + c.calories, 0);
  const loggedCount = cards.filter((c) => c.status !== null).length;
  const eatenKcal = cards
    .filter((c) => c.status === "eaten")
    .reduce((s, c) => s + c.calories, 0);
  const showProgress = !isFuture && cards.length > 0;
  const progressBase = calorieTarget && calorieTarget > 0 ? calorieTarget : totalKcal;
  const progressPct =
    progressBase > 0 ? Math.min(100, (eatenKcal / progressBase) * 100) : 0;

  const selectedJsDate = parseLocalDate(selectedDate);
  const isToday = selectedDate === todayDate;
  const dateLabel = selectedJsDate
    ? `${FULL_WEEKDAYS[selectedJsDate.getDay()]} ${formatShortDate(selectedJsDate)
        .split(" ")
        .slice(1)
        .join(" ")}`
    : selectedDate;
  const heading = isToday ? `Today, ${dateLabel}` : dateLabel;
  const dayKind = isToday ? null : isFuture ? "Upcoming" : "Past";

  // Nearest other day that has a plan, for the empty-day hint.
  const nearestPlanned = useMemo(() => {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const d of planDates) {
      if (d === selectedDate) continue;
      const dist = Math.abs(daysApart(selectedDate, d));
      if (dist < bestDist || (dist === bestDist && best !== null && d > best)) {
        best = d;
        bestDist = dist;
      }
    }
    return best;
  }, [planDates, selectedDate]);

  function goTo(d: string) {
    setPendingDate(d);
    router.push(`/portal?date=${d}`);
  }

  // Horizontal swipe on the meals area changes the day.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || openEntryId) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    goTo(addDaysLocal(pendingDate ?? selectedDate, dx < 0 ? 1 : -1));
  }

  const open = openEntryId
    ? sorted.find((e) => e.id === openEntryId) ?? null
    : null;
  const openReview = open
    ? reviews.find((r) => r.meal_plan_entry_id === open.id) ?? null
    : null;
  const openStatus = open
    ? statuses.find((s) => s.meal_plan_entry_id === open.id) ?? null
    : null;

  return (
    <div className="space-y-4">
      <DayScrubber
        selectedDate={selectedDate}
        todayDate={todayDate}
        planDates={planDateSet}
        pendingDate={pendingDate}
        onPendingChange={setPendingDate}
      />

      <section>
        <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {dayKind && <span className="text-emerald-700 font-medium">{dayKind}</span>}
          {dayKind && (cards.length > 0 || planName) ? " · " : null}
          {cards.length > 0 && (
            <>
              <span className="font-medium text-gray-900">
                {formatNumber(Math.round(totalKcal), 0)} kcal
              </span>{" "}
              total {isToday ? "today" : "for this day"}
              {planName ? " · " : null}
            </>
          )}
          {planName && <span className="text-gray-500">{planName}</span>}
        </p>
        {showProgress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
              <span>
                {loggedCount} of {cards.length} meals logged
              </span>
              <span>
                {formatNumber(Math.round(eatenKcal), 0)}
                {calorieTarget && calorieTarget > 0
                  ? ` / ${formatNumber(calorieTarget, 0)}`
                  : ` / ${formatNumber(Math.round(totalKcal), 0)}`}{" "}
                kcal eaten
              </span>
            </div>
            <div
              className="h-1.5 rounded-full bg-gray-100 overflow-hidden"
              role="progressbar"
              aria-label="Calories eaten so far"
              aria-valuemin={0}
              aria-valuemax={Math.round(progressBase)}
              aria-valuenow={Math.round(eatenKcal)}
            >
              <div
                className="h-full bg-emerald-500 rounded-full transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {showSkeleton ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-gray-100 rounded-2xl border border-gray-200 h-24 animate-pulse"
              />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <div className="bg-white rounded-2xl border p-6 text-center text-gray-600 text-sm space-y-3">
            <p>
              {planId
                ? isFuture
                  ? "No meals are scheduled for this day yet."
                  : "No meals were scheduled for this day."
                : isFuture
                ? "Your plan doesn't reach this day yet. We'll add it once it's published."
                : "No plan covered this day."}
            </p>
            {nearestPlanned && (
              <Link
                href={`/portal?date=${nearestPlanned}`}
                onClick={() => setPendingDate(nearestPlanned)}
                className="inline-flex items-center px-4 py-2 min-h-[44px] bg-emerald-600 text-white rounded-lg font-medium"
              >
                Go to {formatShortDate(nearestPlanned)}
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((c) => (
              <MealCard
                key={c.entryId}
                meal={c}
                canLog={!isFuture}
                onTap={() => setOpenEntryId(c.entryId)}
              />
            ))}
          </div>
        )}
      </div>

      {open && (
        <MealDetailSheet
          entry={open}
          existingReview={openReview}
          existingStatus={openStatus?.status ?? null}
          isFuture={isFuture}
          onClose={() => setOpenEntryId(null)}
        />
      )}
    </div>
  );
}
