"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { formatDecimal, formatNumber, parseDecimal } from "@/lib/format";

const PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

/** "Ate a different amount": picks the share of the planned portion that was eaten. */
export default function PortionFactorSheet({
  mealTitle,
  plannedKcal,
  current,
  onSave,
  onClose,
}: {
  mealTitle: string;
  plannedKcal: number;
  current: number | null;
  /** null = the whole planned portion (1×). */
  onSave: (factor: number | null) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const customValue = parseDecimal(custom);
  const customInvalid = custom.trim() !== "" && (customValue == null || !(customValue > 0) || customValue > 5);
  const active = current ?? 1;

  function pick(f: number) {
    onSave(f === 1 ? null : f);
  }

  return (
    <Modal
      open
      onClose={onClose}
      variant="sheet"
      title="Ate a different amount"
      description={mealTitle}
      footer={
        <button
          type="button"
          disabled={customValue == null || customInvalid}
          onClick={() => customValue != null && !customInvalid && pick(customValue)}
          className="w-full min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
        >
          Use custom amount
        </button>
      }
    >
      <div className="space-y-4">
        <div role="group" aria-label="Portion eaten" className="grid grid-cols-4 gap-2">
          {PRESETS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={active === f}
              onClick={() => pick(f)}
              className={`min-h-[56px] rounded-xl border text-sm font-medium flex flex-col items-center justify-center ${
                active === f
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-gray-800 border-gray-200 hover:border-emerald-300"
              }`}
            >
              <span>{formatFactor(f)}</span>
              <span className={`text-[11px] font-normal ${active === f ? "text-emerald-50" : "text-gray-500"}`}>
                {formatNumber(Math.round(plannedKcal * f), 0)} kcal
              </span>
            </button>
          ))}
        </div>
        <div>
          <label htmlFor="portion-custom" className="block text-sm font-medium text-gray-900 mb-1">
            Custom amount (× the planned portion)
          </label>
          <input
            id="portion-custom"
            inputMode="decimal"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. 0,6"
            aria-invalid={customInvalid}
            className="w-full min-h-[44px] px-3 rounded-lg border border-gray-300 text-base md:text-sm"
          />
          {customInvalid && <p className="text-xs text-red-600 mt-1">Enter a number between 0 and 5.</p>}
        </div>
      </div>
    </Modal>
  );
}

/** "0,5×", "1,25×", "2×" */
export function formatFactor(f: number): string {
  return `${formatDecimal(f, 2)}×`;
}
