"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { formatDate } from "@/lib/format";
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

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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

  // The date the user just clicked, while we wait for the parent's
  // selectedDate prop to catch up. Used to render a spinner on that
  // cell and to disable other cells.
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    // When the parent's selectedDate matches what we picked, the
    // navigation has landed — close the picker.
    if (picking && compareLocalDate(selectedDate, picking) === 0) {
      onClose();
    }
  }, [selectedDate, picking, onClose]);

  const monthLabel = `${MONTH_NAMES[viewMonth]} ${viewYear}`;

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
    <Modal open onClose={onClose} title="Choose a day" variant="sheet" size="sm">
      <div className="-m-4">
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
                : "bg-white text-gray-600 border-gray-100 hover:border-gray-200";
              const dimMonth = c.inMonth ? "" : "opacity-40";
              return (
                <button
                  key={c.dateStr}
                  type="button"
                  disabled={picking !== null}
                  aria-label={`${formatDate(c.date)}${hasPlan ? ", has a plan" : ""}`}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => {
                    setPicking(c.dateStr);
                    onPick(c.dateStr);
                  }}
                  className={`${base} ${stateClass} ${dimMonth} ${
                    picking !== null && picking !== c.dateStr
                      ? "pointer-events-none opacity-60"
                      : ""
                  }`}
                >
                  {picking === c.dateStr ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {c.date.getDate()}
                      {hasPlan && !isSelected && (
                        <span
                          aria-hidden="true"
                          className="ml-0.5 mb-2 w-1 h-1 rounded-full bg-emerald-500"
                        />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </Modal>
  );
}
