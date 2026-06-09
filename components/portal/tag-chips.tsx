"use client";

import { ReviewTag } from "@/lib/supabase/types";

export default function TagChips({
  tags,
  selected,
  onToggle,
}: {
  tags: ReviewTag[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const positive = tags.filter((t) => t.sentiment === "positive");
  const negative = tags.filter((t) => t.sentiment === "negative");
  const neutral = tags.filter((t) => t.sentiment === "neutral");

  return (
    <div className="space-y-3">
      {positive.length > 0 && (
        <div>
          <p className="text-xs font-medium text-emerald-700 mb-1.5">What worked</p>
          <div className="flex flex-wrap gap-2">
            {positive.map((t) => (
              <Chip
                key={t.id}
                label={t.label}
                tone="emerald"
                active={selected.has(t.id)}
                onClick={() => onToggle(t.id)}
              />
            ))}
          </div>
        </div>
      )}
      {negative.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-700 mb-1.5">What didn't</p>
          <div className="flex flex-wrap gap-2">
            {negative.map((t) => (
              <Chip
                key={t.id}
                label={t.label}
                tone="red"
                active={selected.has(t.id)}
                onClick={() => onToggle(t.id)}
              />
            ))}
          </div>
        </div>
      )}
      {neutral.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-2">
            {neutral.map((t) => (
              <Chip
                key={t.id}
                label={t.label}
                tone="gray"
                active={selected.has(t.id)}
                onClick={() => onToggle(t.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  tone,
  active,
  onClick,
}: {
  label: string;
  tone: "emerald" | "red" | "gray";
  active: boolean;
  onClick: () => void;
}) {
  const base = "min-h-[36px] text-sm px-3 py-1.5 rounded-full border font-medium transition-colors";
  const styles = active
    ? tone === "emerald"
      ? "bg-emerald-600 border-emerald-600 text-white"
      : tone === "red"
      ? "bg-red-600 border-red-600 text-white"
      : "bg-gray-700 border-gray-700 text-white"
    : tone === "emerald"
    ? "bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50"
    : tone === "red"
    ? "bg-white border-red-200 text-red-700 hover:bg-red-50"
    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50";
  return (
    <button type="button" onClick={onClick} className={`${base} ${styles}`}>
      {label}
    </button>
  );
}
