"use client";

import { Star } from "lucide-react";

export default function StarRating({
  value,
  onChange,
  size = 28,
  label = "Rating",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n;
        return (
          <button
            type="button"
            role="radio"
            key={n}
            aria-checked={value === n}
            onClick={() => onChange?.(n)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation rounded-lg focus-visible:outline-2 focus-visible:outline-emerald-600"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            disabled={!onChange}
          >
            <Star
              style={{ width: size, height: size }}
              className={filled ? "fill-amber-400 text-amber-400" : "text-gray-300"}
            />
          </button>
        );
      })}
    </div>
  );
}
