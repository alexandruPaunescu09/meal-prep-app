"use client";

import { useMemo, useState } from "react";
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
}

export default function DayScrubber({
  selectedDate,
  todayDate,
  planDates,
}: Props) {
  const router = useRouter();
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Window of 7 dates centered on selectedDate (offset -3..+3).
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysLocal(selectedDate, i - 3));
  }, [selectedDate]);

  function navigate(dateStr: string) {
    router.push(`/portal?date=${dateStr}`);
  }

  function shift(delta: number) {
    navigate(addDaysLocal(selectedDate, delta));
  }

  function pickFromCalendar(dateStr: string) {
    setCalendarOpen(false);
    navigate(dateStr);
  }

  const selectedLabel = formatHeader(selectedDate, todayDate);

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
          <div className="flex-1 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const isSelected = compareLocalDate(d, selectedDate) === 0;
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
                  key={d}
                  type="button"
                  onClick={() => navigate(d)}
                  className={`${base} ${stateClass}`}
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
