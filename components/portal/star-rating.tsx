"use client";

import { Star } from "lucide-react";

export default function StarRating({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n;
        return (
          <button
            type="button"
            key={n}
            onClick={() => onChange?.(value === n ? 0 : n)}
            className="p-1 -m-1 touch-manipulation"
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
