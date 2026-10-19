"use client";

import { useEffect, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";
import type { FoodLogEntry, MealType } from "@/lib/supabase/types";
import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { addDays, formatNumber, formatShortDate, parseLocalDate } from "@/lib/format";
import { formatEntryAmount } from "@/lib/portal/format-amount";
import { newEntryId, type SnapshotLike } from "@/lib/portal/diary-draft";
import { buildMealCopies } from "@/lib/portal/recents";
import { MEAL_SECTION_LABEL } from "@/components/portal/diary-section";
import { useOnline } from "@/components/portal/food-search";

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; rows: FoodLogEntry[] };

/**
 * "Copy <meal> from…": copies the logged extras (never plan meals) of one section of an earlier day
 * into the viewed day's same section. Reading the source day needs a connection; the copies are
 * saved like any other entry (new ids, optimistic, queued when offline) with an Undo toast.
 */
export default function CopyMealSheet({
  mealType,
  targetDate,
  onSave,
  onRemove,
  onClose,
}: {
  mealType: MealType;
  /** The viewed day (copies land here). Must not be in the future: the caller only offers this on today/past. */
  targetDate: string;
  onSave: (input: DiaryEntryInput, snapshot: SnapshotLike) => Promise<boolean>;
  onRemove: (entry: FoodLogEntry) => Promise<boolean>;
  onClose: () => void;
}) {
  const toast = useToast();
  const online = useOnline();
  const yesterday = addDays(targetDate, -1);
  const [sourceDate, setSourceDate] = useState(yesterday);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [retry, setRetry] = useState(0);
  const label = MEAL_SECTION_LABEL[mealType];

  const validDate = parseLocalDate(sourceDate) !== null && sourceDate < targetDate;

  useEffect(() => {
    if (!online || !validDate) return;
    let stale = false;
    (async () => {
      setLoad({ state: "loading" });
      const { data, error } = await createClient()
        .from("food_log_entries")
        .select("*")
        .eq("log_date", sourceDate)
        .eq("meal_type", mealType)
        .order("created_at");
      if (stale) return;
      setLoad(error ? { state: "error" } : { state: "ready", rows: (data ?? []) as FoodLogEntry[] });
    })();
    return () => {
      stale = true;
    };
  }, [online, validDate, sourceDate, mealType, retry]);

  const rows = load.state === "ready" ? load.rows : [];
  const dateText = parseLocalDate(sourceDate) ? formatShortDate(sourceDate) : sourceDate;

  async function copy() {
    const { copies, skipped } = buildMealCopies(rows, { targetDate, mealType, newId: newEntryId });
    if (copies.length === 0) return;
    // Optimistic: every save puts its row on screen straight away; the sheet closes at once.
    const pending = copies.map((c) => onSave(c.input, c.entry));
    onClose();
    const results = await Promise.all(pending);
    const saved = copies.filter((_, i) => results[i]);
    if (saved.length === 0) return;
    toast.success(
      `Copied ${saved.length} ${saved.length === 1 ? "item" : "items"} from ${dateText}` +
        (skipped ? ` (${skipped} no longer available)` : ""),
      {
        action: {
          label: "Undo",
          onClick: () => void Promise.all(saved.map((c) => onRemove(c.entry))),
        },
      }
    );
  }

  return (
    <Modal open onClose={onClose} variant="sheet" title={`Copy ${label} from…`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            aria-pressed={sourceDate === yesterday}
            onClick={() => setSourceDate(yesterday)}
            className={`min-h-[44px] px-4 rounded-lg border text-sm font-medium ${
              sourceDate === yesterday
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-700 border-gray-200"
            }`}
          >
            Yesterday
          </button>
          <div>
            <label htmlFor="copy-date" className="block text-xs font-medium text-gray-600 mb-1">
              Or pick a day
            </label>
            <input
              id="copy-date"
              type="date"
              max={yesterday}
              value={sourceDate}
              onChange={(e) => setSourceDate(e.target.value)}
              className="min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900"
            />
          </div>
        </div>

        {!online ? (
          <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            Copying needs a connection to read that day. You can still add foods one by one offline.
          </p>
        ) : !validDate ? (
          <p className="text-sm text-gray-600">Pick a day before {formatShortDate(targetDate)}.</p>
        ) : load.state === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading {dateText}…
          </p>
        ) : load.state === "error" ? (
          <p className="text-sm text-red-700">
            Could not load that day.{" "}
            <button type="button" onClick={() => setRetry((n) => n + 1)} className="underline">
              Try again
            </button>
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-600">
            Nothing logged under {label} on {dateText}. Plan meals are not copied.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {rows.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2 min-h-[44px]">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-900 truncate">{e.name}</span>
                  <span className="block text-xs text-gray-500">
                    {e.source_kind === "quick" ? "Quick add" : formatEntryAmount(e.quantity, e.quantity_unit)}
                  </span>
                </span>
                <span className="text-sm text-gray-700 shrink-0">
                  {formatNumber(Math.round(e.calories ?? 0), 0)} kcal
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={!online || !validDate || rows.length === 0}
          onClick={() => void copy()}
          className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {rows.length > 0 ? `Copy ${rows.length} ${rows.length === 1 ? "item" : "items"} to ${label}` : "Copy"}
        </button>
      </div>
    </Modal>
  );
}
