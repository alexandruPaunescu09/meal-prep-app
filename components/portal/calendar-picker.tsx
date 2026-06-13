"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  formatLocalDate,
  parseLocalDate,
  compareLocalDate,
} from "@/lib/portal/entry-helpers";

interface Props {
  /** Currently-selected date (YYYY-MM-DD). The calendar opens on its month. */
  selectedDate: string;
  /** Today's local date (YYYY-MM-DD) — passed in so server-rendered 'today'
   *  matches the client. */
  todayDate: string;
  /** Set of YYYY-MM-DD strings the customer has a plan covering. Used to
   *  highlight days; does not restrict selection. */
  planDates: Set<string>;
  onPick: (dateStr: string) => void;
  onClose: () => void;
}

export default function CalendarPicker({
  selectedDate,
  todayDate,
  planDates,
  onPick,
  onClose,
}: Props) {
  const initial = parseLocalDate(selectedDate) ?? parseLocalDate(todayDate)!;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth()); // 0..11

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" }
  );

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  // Build a Mon-first 6-row grid covering the visible month.
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const jsDow = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const leading = jsDow === 0 ? 6 : jsDow - 1;
  const gridStart = new Date(viewYear, viewMonth, 1 - leading);

  const cells: { date: Date; dateStr: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    );
    cells.push({
      date: d,
      dateStr: formatLocalDate(d),
      inMonth: d.getMonth() === viewMonth && d.getFullYear() === viewYear,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 -m-2 rounded-lg hover:bg-gray-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <p className="text-sm font-semibold text-gray-900">{monthLabel}</p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 -m-2 rounded-lg hover:bg-gray-100"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div
                key={i}
                className="text-[10px] uppercase text-gray-500 font-medium text-center py-1"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c) => {
              const isSelected = compareLocalDate(c.dateStr, selectedDate) === 0;
              const isToday = compareLocalDate(c.dateStr, todayDate) === 0;
              const hasPlan = planDates.has(c.dateStr);
              const base =
                "h-10 rounded-lg text-sm flex items-center justify-center font-medium border";
              const stateClass = isSelected
                ? "bg-emerald-600 text-white border-emerald-600"
                : isToday
                ? "bg-white text-emerald-700 border-emerald-400"
                : hasPlan
                ? "bg-white text-gray-900 border-gray-200 hover:border-gray-300"
                : "bg-white text-gray-400 border-gray-100 hover:border-gray-200";
              const dimMonth = c.inMonth ? "" : "opacity-40";
              return (
                <button
                  key={c.dateStr}
                  type="button"
                  onClick={() => onPick(c.dateStr)}
                  className={`${base} ${stateClass} ${dimMonth}`}
                >
                  {c.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 pb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
