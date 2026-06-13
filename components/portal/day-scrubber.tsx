"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  addDaysLocal,
  compareLocalDate,
  parseLocalDate,
} from "@/lib/portal/entry-helpers";
import CalendarPicker from "./calendar-picker";

interface Props {
  /** YYYY-MM-DD currently shown. Drives the strip's centering. */
  selectedDate: string;
  /** YYYY-MM-DD of today (server-provided so it matches the page render). */
  todayDate: string;
  /** All YYYY-MM-DD strings the customer has a plan covering. */
  planDates: Set<string>;
  /** YYYY-MM-DD the user just picked, before the server catches up. */
  pendingDate: string | null;
  /** Setter for pendingDate (lifted into the parent today-client). */
  onPendingChange: (d: string | null) => void;
}

export default function DayScrubber({
  selectedDate,
  todayDate,
  planDates,
  pendingDate,
  onPendingChange,
}: Props) {
  const router = useRouter();
  const [calendarOpen, setCalendarOpen] = useState(false);

  // displayDate drives the visual selection (so taps feel instant).
  // selectedDate stays the source of truth for the URL/data.
  const displayDate = pendingDate ?? selectedDate;

  const stripRef = useRef<HTMLDivElement | null>(null);
  const pillWidthRef = useRef<number>(0);

  useLayoutEffect(() => {
    function measure() {
      const el = stripRef.current;
      if (!el) return;
      // The 7-pill grid lives inside the ref'd container with `gap-1`
      // (4px). Width = (clientWidth − 6 gaps) / 7.
      const gap = 4;
      const w = (el.clientWidth - gap * 6) / 7;
      if (w > 0) pillWidthRef.current = w;
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // slideOffsetPx: applied as translateX to the strip once on mount of a
  // new window, then animated back to 0. 0 = no slide animation pending.
  const [slideOffsetPx, setSlideOffsetPx] = useState(0);
  // pulseTick: per-date counter; bumping it forces the pill to remount
  // and replay the CSS animation.
  const [pulseTick, setPulseTick] = useState<Record<string, number>>({});
  // The date currently mid-slide (anchor to compare deltas against on
  // rapid taps). Otherwise rapid taps stack offsets weirdly.
  const slideAnchorRef = useRef<string>(displayDate);

  // Window of 7 dates centered on displayDate (offset -3..+3).
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysLocal(displayDate, i - 3));
  }, [displayDate]);

  // Snap-pulse-slide tap on a strip pill. `from` is the date that was the
  // visible center before this tap (used to compute slide delta).
  function tapStripDate(target: string) {
    const from = slideAnchorRef.current;
    if (target === from) return; // tapping the already-selected pill: no-op

    // 1. snap selection visually
    onPendingChange(target);

    // 2. micro-pulse on the tapped pill
    setPulseTick((p) => ({ ...p, [target]: (p[target] ?? 0) + 1 }));

    // 3. slide the strip if delta within ±3
    const delta = daysBetween(from, target);
    if (Math.abs(delta) <= 3 && pillWidthRef.current > 0) {
      // The new window is centered on `target`. Render it pre-shifted by
      // `delta * pillWidth` (so visually it starts where the old window
      // was), then transition transform to 0.
      const offset = delta * (pillWidthRef.current + 4); // gap = 4px
      setSlideOffsetPx(offset);
      // next frame: animate to 0. Two RAFs are required: the first lets
      // the browser paint the pre-shifted strip; the second schedules the
      // transition to 0. With a single RAF, the browser collapses both
      // transform values into one paint and no slide animation runs.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlideOffsetPx(0));
      });
    } else {
      setSlideOffsetPx(0);
    }
    slideAnchorRef.current = target;

    // 4. fire navigation
    router.push(`/portal?date=${target}`);
  }

  function shift(delta: number) {
    tapStripDate(addDaysLocal(displayDate, delta));
  }

  function pickFromCalendar(dateStr: string) {
    // Calendar picks: snap + pending + navigate, but no slide. Picker
    // closes itself via its own selectedDate-prop watcher (Task 2.4).
    onPendingChange(dateStr);
    slideAnchorRef.current = dateStr;
    setSlideOffsetPx(0);
    router.push(`/portal?date=${dateStr}`);
  }

  // Reset the slide anchor whenever the prop catches up — keeps daysBetween
  // sane for the next user interaction.
  useEffect(() => {
    slideAnchorRef.current = selectedDate;
  }, [selectedDate]);

  const selectedLabel = formatHeader(displayDate, todayDate);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-emerald-600 font-medium">
            {selectedLabel.eyebrow}
          </p>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 min-h-[36px]"
            aria-label="Open calendar"
          >
            <CalendarDays className="w-4 h-4" />
            Calendar
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div
            ref={stripRef}
            className="flex-1 grid grid-cols-7 gap-1"
            style={{
              transform: `translateX(${slideOffsetPx}px)`,
              transition:
                slideOffsetPx === 0 ? "transform 180ms ease-out" : "none",
            }}
          >
            {days.map((d) => {
              const isSelected = compareLocalDate(d, displayDate) === 0;
              const isToday = compareLocalDate(d, todayDate) === 0;
              const hasPlan = planDates.has(d);
              const dt = parseLocalDate(d)!;
              const weekday = dt.toLocaleDateString(undefined, {
                weekday: "short",
              });
              const dayNum = dt.getDate();
              const base =
                "flex flex-col items-center justify-center min-h-[56px] rounded-xl border text-sm font-medium";
              const stateClass = isSelected
                ? "bg-emerald-600 text-white border-emerald-600"
                : isToday
                ? "bg-white text-emerald-700 border-emerald-400"
                : hasPlan
                ? "bg-white text-gray-900 border-gray-200 hover:border-gray-300"
                : "bg-white text-gray-400 border-gray-100 hover:border-gray-200";
              return (
                <button
                  key={`${d}-${pulseTick[d] ?? 0}`}
                  type="button"
                  onClick={() => tapStripDate(d)}
                  className={`${base} ${stateClass} animate-tap-pulse`}
                >
                  <span className="text-[10px] uppercase tracking-wide opacity-80">
                    {weekday}
                  </span>
                  <span className="text-base leading-tight">{dayNum}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => shift(1)}
            className="p-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {calendarOpen && (
        <CalendarPicker
          selectedDate={selectedDate}
          todayDate={todayDate}
          planDates={planDates}
          onPick={pickFromCalendar}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </>
  );
}

function formatHeader(selectedDate: string, todayDate: string) {
  const cmp = compareLocalDate(selectedDate, todayDate);
  if (cmp === 0) return { eyebrow: "Today" };
  if (cmp < 0) return { eyebrow: "Past" };
  return { eyebrow: "Upcoming" };
}

function daysBetween(a: string, b: string): number {
  // Both YYYY-MM-DD. Convert to local Date midnight, diff in days. The
  // Math.round handles DST transitions where the day diff is 23h or 25h
  // rather than exactly 24h.
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}
