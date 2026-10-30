"use client";

import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { moveItem } from "@/lib/recipes/steps";
import { RECIPE_STEP_MAX_COUNT, RECIPE_STEP_MAX_LENGTH } from "@/lib/validations/schemas";

export interface StepEntry {
  id: string;
  text: string;
}

const inputCls =
  "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm";

/** Ordered, editable cooking steps (recipe form and recipe import review). */
export default function RecipeStepsEditor({
  steps,
  setSteps,
  error,
}: {
  steps: StepEntry[];
  setSteps: React.Dispatch<React.SetStateAction<StepEntry[]>>;
  error?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="block text-sm font-medium text-gray-700">Steps</span>
        <button
          type="button"
          onClick={() => setSteps((prev) => [...prev, { id: crypto.randomUUID(), text: "" }])}
          disabled={steps.length >= RECIPE_STEP_MAX_COUNT}
          className="inline-flex items-center gap-1 text-sm text-emerald-700 hover:underline disabled:opacity-40"
        >
          <Plus size={14} /> Add step
        </button>
      </div>
      {steps.length === 0 ? (
        <p className="text-xs text-gray-500">No steps yet.</p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, i) => (
            <li key={step.id} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-sm text-gray-500">{i + 1}.</span>
              <textarea
                aria-label={`Step ${i + 1}`}
                value={step.text}
                maxLength={RECIPE_STEP_MAX_LENGTH}
                onChange={(e) =>
                  setSteps((prev) => prev.map((x) => (x.id === step.id ? { ...x, text: e.target.value } : x)))
                }
                rows={2}
                className={`${inputCls} resize-none`}
              />
              <div className="flex shrink-0">
                <IconButton
                  label={`Move step ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => setSteps((prev) => moveItem(prev, i, -1))}
                >
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton
                  label={`Move step ${i + 1} down`}
                  disabled={i === steps.length - 1}
                  onClick={() => setSteps((prev) => moveItem(prev, i, 1))}
                >
                  <ArrowDown size={16} />
                </IconButton>
                <IconButton
                  label={`Remove step ${i + 1}`}
                  tone="danger"
                  onClick={() => setSteps((prev) => prev.filter((x) => x.id !== step.id))}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <p className="text-xs text-gray-500 mt-1">Internal for now. Empty steps are dropped on save.</p>
    </div>
  );
}
