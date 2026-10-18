"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { FoodLogEntry, MealType } from "@/lib/supabase/types";
import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { Modal } from "@/components/ui/modal";
import MealTypeChips from "@/components/portal/meal-type-chips";
import MacroPreview from "@/components/portal/macro-preview";
import QuickAddForm from "@/components/portal/quick-add-form";
import { formatDecimal } from "@/lib/format";
import { formatEntryAmount } from "@/lib/portal/format-amount";
import {
  buildQuickInput,
  entryToInput,
  isEditable,
  parseAmount,
  quickSnapshot,
  scaleEntry,
  type SnapshotLike,
} from "@/lib/portal/diary-draft";

const UNIT_SUFFIX = { g: "g", ml: "ml", serving: "servings", portion: "portions" } as const;

/** Edit a logged entry: amount (same unit) and meal, or name/macros for a quick add; or delete. */
export default function EditEntrySheet({
  entry,
  onSave,
  onDelete,
  onClose,
}: {
  entry: FoodLogEntry;
  onSave: (input: DiaryEntryInput, snapshot: SnapshotLike) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>(entry.meal_type);
  const [text, setText] = useState(formatDecimal(entry.quantity));

  const quick = entry.source_kind === "quick";
  const editable = isEditable(entry);
  const quantity = parseAmount(text);
  const preview = quantity !== null ? scaleEntry(entry, quantity) : null;
  const changed = mealType !== entry.meal_type || (quantity !== null && quantity !== entry.quantity);

  function commit(input: DiaryEntryInput, snapshot: SnapshotLike) {
    // Optimistic: the entry shows at once and the sheet closes; a failed save rolls back with a toast.
    void onSave(input, snapshot);
    onClose();
  }

  const deleteButton = (
    <button
      type="button"
      onClick={onDelete}
      className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50"
    >
      <Trash2 className="w-4 h-4" />
      Delete entry
    </button>
  );

  return (
    <Modal open onClose={onClose} variant="sheet" title={entry.name} description={entry.brand ?? undefined}>
      <div className="space-y-4">
        <MealTypeChips value={mealType} onChange={setMealType} />

        {quick ? (
          <QuickAddForm
            initial={entry}
            submitLabel="Save changes"
            onSubmit={(v) => {
              const input = buildQuickInput({
                id: entry.id,
                logDate: entry.log_date,
                mealType,
                ...v,
              });
              void commit(input, quickSnapshot(input));
            }}
          />
        ) : editable ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!preview || quantity === null) return;
              void commit(entryToInput(entry, { meal_type: mealType, quantity }), preview);
            }}
          >
            <div>
              <label htmlFor="edit-amount" className="block text-sm font-medium text-gray-900 mb-1">
                Amount ({UNIT_SUFFIX[entry.quantity_unit]})
              </label>
              <input
                id="edit-amount"
                inputMode="decimal"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-invalid={quantity === null}
                className="w-full min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
              />
              {quantity === null && (
                <p className="text-xs text-red-600 mt-1">Enter an amount between 0 and 5000.</p>
              )}
            </div>
            <MacroPreview macros={preview} />
            <button
              type="submit"
              disabled={!changed || quantity === null}
              className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
            >
              Save changes
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-600">
            This food is no longer in the catalog, so it cannot be edited. You logged{" "}
            {formatEntryAmount(entry.quantity, entry.quantity_unit)}; you can still delete it.
          </p>
        )}

        {deleteButton}
      </div>
    </Modal>
  );
}
