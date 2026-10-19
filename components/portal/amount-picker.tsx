"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { CatalogItem, DiaryQuantityUnit, DiarySnapshot } from "@/lib/supabase/types";
import { formatDecimal } from "@/lib/format";
import { availableUnits, defaultAmount, parseAmount, previewSnapshot } from "@/lib/portal/diary-draft";
import MacroPreview from "@/components/portal/macro-preview";
import FavoriteStar from "@/components/portal/favorite-star";
import type { RowFavorite } from "@/components/portal/food-search";

const UNIT_LABEL: Record<DiaryQuantityUnit, string> = {
  g: "grams",
  ml: "ml",
  serving: "servings",
  portion: "portions",
};

/** Amount + unit for a picked catalog item, with a live macro preview. */
export default function AmountPicker({
  item,
  onBack,
  onSubmit,
  initialAmount,
  favorite,
}: {
  item: CatalogItem;
  onBack: () => void;
  onSubmit: (quantity: number, unit: DiaryQuantityUnit, snapshot: DiarySnapshot) => void;
  /** Start from this amount (e.g. the last one logged) when its unit is valid for the item. */
  initialAmount?: { quantity: number; unit: DiaryQuantityUnit };
  /** Star toggle in the header; absent = no star. */
  favorite?: RowFavorite;
}) {
  const units = useMemo(() => availableUnits(item), [item]);
  const initial = useMemo(
    () =>
      initialAmount && units.includes(initialAmount.unit) && parseAmount(String(initialAmount.quantity)) !== null
        ? initialAmount
        : defaultAmount(item),
    [item, units, initialAmount]
  );
  const [unit, setUnit] = useState<DiaryQuantityUnit>(initial.unit);
  const [text, setText] = useState(formatDecimal(initial.quantity));

  const quantity = parseAmount(text);
  const snapshot = previewSnapshot(item, quantity, unit);
  const invalid = text.trim() !== "" && quantity === null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (quantity !== null && snapshot) onSubmit(quantity, unit, snapshot);
      }}
    >
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 min-h-[44px] -ml-2 px-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900">{item.name}</p>
          {item.brand && <p className="text-sm text-gray-500">{item.brand}</p>}
          {!item.verified && (
            <p className="text-xs text-amber-800 mt-1">
              Unverified: added by you, not yet checked by the team.
            </p>
          )}
        </div>
        {favorite && (
          <FavoriteStar
            on={favorite.on}
            disabled={favorite.disabled}
            name={item.name}
            onToggle={() => favorite.onToggle(item)}
          />
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="amount-input" className="block text-sm font-medium text-gray-900 mb-1">
            Amount
          </label>
          <input
            id="amount-input"
            inputMode="decimal"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={invalid}
            className="w-full min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
          />
        </div>
        {units.length > 1 ? (
          <div role="group" aria-label="Unit" className="flex items-end gap-1">
            {units.map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => {
                  setUnit(u);
                  setText(formatDecimal(u === "g" || u === "ml" ? 100 : 1));
                }}
                className={`min-h-[44px] px-3 rounded-lg border text-sm font-medium ${
                  unit === u
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-gray-700 border-gray-200"
                }`}
              >
                {u === "serving" ? "serving" : u}
              </button>
            ))}
          </div>
        ) : (
          <p className="self-end pb-3 text-sm text-gray-600">{UNIT_LABEL[unit]}</p>
        )}
      </div>
      {unit === "serving" && item.servingSize ? (
        <p className="text-xs text-gray-500 -mt-2">
          1 serving = {formatDecimal(item.servingSize)} {item.unit}
          {item.servingLabel ? ` (${item.servingLabel})` : ""}
        </p>
      ) : null}
      {invalid && <p className="text-xs text-red-600 -mt-2">Enter an amount between 0 and 5000.</p>}

      <MacroPreview macros={snapshot} />

      <button
        type="submit"
        disabled={quantity === null || !snapshot}
        className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
      >
        Add to diary
      </button>
    </form>
  );
}
