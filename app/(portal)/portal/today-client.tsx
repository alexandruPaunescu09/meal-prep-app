"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import {
  FoodLogEntry,
  MealEntryStatus,
  MealReview,
  MealType,
  PortalEntry,
} from "@/lib/supabase/types";
import type { ResolvedTargets } from "@/lib/calculations/meal-plan";
import { calculateDiaryDay, MEAL_TYPES, planEntryNutrition } from "@/lib/calculations/diary";
import MealCard, { MealCardData } from "@/components/portal/meal-card";
import MealDetailSheet from "@/components/portal/meal-detail-sheet";
import DayScrubber from "@/components/portal/day-scrubber";
import DiarySummary from "@/components/portal/diary-summary";
import DiarySection, { MEAL_SECTION_LABEL } from "@/components/portal/diary-section";
import DiaryEntryList from "@/components/portal/diary-entry-list";
import PortionFactorSheet from "@/components/portal/portion-factor-sheet";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { addDaysLocal, parseLocalDate, sortByMealType } from "@/lib/portal/entry-helpers";
import { useMealStatus } from "@/lib/portal/use-meal-status";
import { formatShortDate, todayInTz } from "@/lib/format";

const FULL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function daysApart(a: string, b: string): number {
  const da = parseLocalDate(a);
  const db = parseLocalDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export default function TodayClient({
  planName,
  hasPlans,
  contactEmail,
  selectedDate,
  todayDate,
  isFuture,
  mealDates,
  targets,
  entries,
  statuses,
  reviews,
  logEntries,
}: {
  planName: string | null;
  /** The customer has at least one plan (false = "plan is being prepared" notice). */
  hasPlans: boolean;
  contactEmail: string | null;
  selectedDate: string;
  todayDate: string;
  isFuture: boolean;
  /** YYYY-MM-DD days that have plan meals (scrubber dots + "Go to" hint). */
  mealDates: string[];
  targets: ResolvedTargets;
  entries: PortalEntry[];
  statuses: MealEntryStatus[];
  reviews: MealReview[];
  logEntries: FoodLogEntry[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [factorEntryId, setFactorEntryId] = useState<string | null>(null);
  // FD-3 replaces this stub with the add-food sheet.
  const [addToMeal, setAddToMeal] = useState<MealType | null>(null);

  // pendingDate: the date the user has tapped/picked but for which the
  // server-rendered prop hasn't caught up yet. Drives the scrubber's
  // selected-pill style, the calendar's spinner, and the cards-area
  // skeleton. Cleared when selectedDate matches.
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  if (pendingDate && pendingDate === selectedDate) {
    setPendingDate(null);
  }

  // A 100ms gate — fast loads (cache hit, etc.) never flash skeletons.
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

  // Offline writes just reached the server: re-fetch so the totals reflect them.
  useEffect(() => {
    const onFlushed = () => router.refresh();
    window.addEventListener("portal:queue-flushed", onFlushed);
    return () => window.removeEventListener("portal:queue-flushed", onFlushed);
  }, [router]);

  // The diary keys on the customer's local date. SSR runs in UTC, so remember the browser's
  // timezone in a cookie (read by the page) and re-render once if the date it used was wrong.
  useEffect(() => {
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz) return;
    const current = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1];
    if (current === undefined || decodeURIComponent(current) !== tz) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    }
    if (todayInTz(tz) !== todayDate) router.refresh();
  }, [todayDate, router]);

  const { stateOf, saving, applyChanges } = useMealStatus(statuses);

  const sorted = useMemo(() => sortByMealType(entries), [entries]);
  const mealDateSet = useMemo(() => new Set(mealDates), [mealDates]);

  const diary = useMemo(
    () =>
      calculateDiaryDay({
        planEntries: sorted,
        statuses: sorted.flatMap((e) => {
          const o = stateOf(e.id);
          return o.status
            ? [{ meal_plan_entry_id: e.id, status: o.status, portion_factor: o.factor }]
            : [];
        }),
        logEntries,
      }),
    [sorted, stateOf, logEntries]
  );

  const cards: MealCardData[] = useMemo(() => {
    const reviewByEntry = new Map(reviews.map((r) => [r.meal_plan_entry_id, r]));
    return sorted.map((e) => {
      const n = planEntryNutrition(e);
      const o = stateOf(e.id);
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
        status: o.status,
        portionFactor: o.factor,
        rating: reviewByEntry.get(e.id)?.rating ?? null,
      };
    });
  }, [sorted, stateOf, reviews]);

  const canLog = !isFuture;
  const pendingCards = cards.filter((c) => c.status === null);
  const loggedCount = cards.length - pendingCards.length;

  function toggleEaten(entryId: string) {
    const cur = stateOf(entryId);
    void applyChanges([
      { entryId, status: cur.status === "eaten" ? null : "eaten", factor: null },
    ]);
  }

  async function markRemainingEaten() {
    const targetsToMark = pendingCards.map((c) => c.entryId);
    const ok = await applyChanges(
      targetsToMark.map((entryId) => ({ entryId, status: "eaten" as const, factor: null }))
    );
    if (ok) {
      toast.success(
        `Marked ${targetsToMark.length} meal${targetsToMark.length === 1 ? "" : "s"} as eaten`,
        {
          action: {
            label: "Undo",
            onClick: () =>
              void applyChanges(
                targetsToMark.map((entryId) => ({ entryId, status: null, factor: null }))
              ),
          },
        }
      );
    }
  }

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

  // Nearest other day that has plan meals, for the empty-day hint.
  const nearestWithMeals = useMemo(() => {
    let best: string | null = null;
    let bestDist = Infinity;
    for (const d of mealDates) {
      if (d === selectedDate) continue;
      const dist = Math.abs(daysApart(selectedDate, d));
      if (dist < bestDist || (dist === bestDist && best !== null && d > best)) {
        best = d;
        bestDist = dist;
      }
    }
    return best;
  }, [mealDates, selectedDate]);

  function goTo(d: string) {
    setPendingDate(d);
    router.push(`/portal?date=${d}`);
  }

  // Horizontal swipe on the diary changes the day.
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || openEntryId || factorEntryId || addToMeal) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    goTo(addDaysLocal(pendingDate ?? selectedDate, dx < 0 ? 1 : -1));
  }

  const open = openEntryId ? sorted.find((e) => e.id === openEntryId) ?? null : null;
  const openReview = open ? reviews.find((r) => r.meal_plan_entry_id === open.id) ?? null : null;
  const factorCard = factorEntryId ? cards.find((c) => c.entryId === factorEntryId) ?? null : null;

  const sectionsToShow = canLog
    ? MEAL_TYPES
    : MEAL_TYPES.filter((m) => cards.some((c) => c.mealType === m));

  return (
    <div className="space-y-4">
      <DayScrubber
        selectedDate={selectedDate}
        todayDate={todayDate}
        planDates={mealDateSet}
        pendingDate={pendingDate}
        onPendingChange={setPendingDate}
      />

      <section>
        <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {dayKind && <span className="text-emerald-700 font-medium">{dayKind}</span>}
          {dayKind && (cards.length > 0 || planName) ? " · " : null}
          {cards.length > 0 && !isFuture && (
            <>
              {loggedCount} of {cards.length} plan meals logged
              {planName ? " · " : null}
            </>
          )}
          {planName && <span className="text-gray-500">{planName}</span>}
        </p>
      </section>

      {!hasPlans && (
        <div className="bg-white rounded-2xl border p-4 space-y-2 text-sm text-gray-600">
          <p className="text-gray-900 font-medium">Your meal plan is being prepared.</p>
          <p>
            As soon as it&apos;s ready, your meals for each day will show up here. You can already
            log what you eat.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href="/portal/profile"
              className="inline-flex items-center px-4 py-2 min-h-[44px] bg-emerald-600 text-white rounded-lg text-sm font-medium"
            >
              Review my profile
            </Link>
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center px-4 py-2 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Contact us
              </a>
            )}
          </div>
        </div>
      )}

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} className="space-y-4">
        {showSkeleton ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-gray-100 rounded-2xl border border-gray-200 h-24 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <DiarySummary
              eaten={diary.eaten}
              projected={diary.projected}
              targets={targets}
              hasPendingPlan={diary.counts.planPending > 0}
              isFuture={isFuture}
            />

            {canLog && pendingCards.length > 0 && (
              <button
                type="button"
                onClick={() => void markRemainingEaten()}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-emerald-300 bg-white text-emerald-700 text-sm font-medium hover:bg-emerald-50"
              >
                <CheckCheck className="w-4 h-4" />
                Mark remaining as eaten ({pendingCards.length})
              </button>
            )}

            {cards.length === 0 && (
              <div className="bg-white rounded-2xl border p-4 text-center text-gray-600 text-sm space-y-3">
                <p>
                  {isFuture
                    ? "No meals are scheduled for this day yet."
                    : hasPlans
                      ? "No plan meals for this day. Log what you ate below."
                      : "Log what you ate below."}
                </p>
                {nearestWithMeals && (
                  <Link
                    href={`/portal?date=${nearestWithMeals}`}
                    onClick={() => setPendingDate(nearestWithMeals)}
                    className="inline-flex items-center px-4 py-2 min-h-[44px] bg-emerald-600 text-white rounded-lg font-medium"
                  >
                    Go to {formatShortDate(nearestWithMeals)}
                  </Link>
                )}
              </div>
            )}

            {sectionsToShow.map((m) => {
              const sectionCards = cards.filter((c) => c.mealType === m);
              const sectionLogs = logEntries.filter((l) => l.meal_type === m);
              return (
                <DiarySection
                  key={m}
                  mealType={m}
                  eatenKcal={diary.byMeal[m].calories}
                  canAdd={canLog}
                  onAdd={setAddToMeal}
                >
                  {sectionCards.map((c) => (
                    <MealCard
                      key={c.entryId}
                      meal={c}
                      saving={saving.has(c.entryId)}
                      onTap={() => setOpenEntryId(c.entryId)}
                      onToggleEaten={canLog ? () => toggleEaten(c.entryId) : undefined}
                      onChangeAmount={canLog ? () => setFactorEntryId(c.entryId) : undefined}
                    />
                  ))}
                  <DiaryEntryList entries={sectionLogs} />
                  {sectionCards.length === 0 && sectionLogs.length === 0 && (
                    <p className="text-sm text-gray-500 px-1">Nothing logged yet.</p>
                  )}
                </DiarySection>
              );
            })}
          </>
        )}
      </div>

      {open && (
        <MealDetailSheet
          entry={open}
          existingReview={openReview}
          existingStatus={stateOf(open.id).status}
          onChangeStatus={(status) =>
            applyChanges([{ entryId: open.id, status, factor: null }])
          }
          isFuture={isFuture}
          onClose={() => setOpenEntryId(null)}
        />
      )}

      {factorCard && (
        <PortionFactorSheet
          mealTitle={factorCard.recipeName ?? factorCard.ingredientName ?? "Meal"}
          plannedKcal={factorCard.calories}
          current={factorCard.portionFactor}
          onClose={() => setFactorEntryId(null)}
          onSave={(factor) => {
            setFactorEntryId(null);
            void applyChanges([{ entryId: factorCard.entryId, status: "eaten", factor }]);
          }}
        />
      )}

      {addToMeal && (
        <Modal
          open
          onClose={() => setAddToMeal(null)}
          variant="sheet"
          title={`Add to ${MEAL_SECTION_LABEL[addToMeal]}`}
        >
          <p className="text-sm text-gray-600">
            Adding foods to your diary is coming soon. For now, mark your plan meals as eaten.
          </p>
        </Modal>
      )}
    </div>
  );
}
