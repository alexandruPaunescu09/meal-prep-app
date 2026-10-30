"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/** Collapsed-by-default numbered list of recipe steps. Renders nothing without steps. */
export function RecipeSteps({
  steps,
  className = "",
}: {
  steps: string[] | null | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (!steps || steps.length === 0) return null;
  return (
    // stopPropagation: the parent recipe card toggles on click.
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline py-1"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Steps ({steps.length})
      </button>
      <ol
        id={listId}
        hidden={!open}
        className="mt-1 list-decimal space-y-1.5 pl-5 text-sm text-gray-700"
      >
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
