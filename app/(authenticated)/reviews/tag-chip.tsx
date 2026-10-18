import { Minus, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ReviewSentiment, ReviewTag } from "@/lib/supabase/types";

/** Max tag chips shown in list rows before "+N more". */
export const TAG_MAX_VISIBLE = 4;

const SENTIMENT: Record<
  ReviewSentiment,
  { label: string; className: string; Icon: typeof ThumbsUp }
> = {
  positive: { label: "Positive", className: "bg-emerald-50 text-emerald-700", Icon: ThumbsUp },
  negative: { label: "Negative", className: "bg-red-50 text-red-700", Icon: ThumbsDown },
  neutral: { label: "Neutral", className: "bg-gray-100 text-gray-700", Icon: Minus },
};

/** Tag chip with a sentiment icon (not colour alone) plus a screen-reader prefix. */
export function ReviewTagChip({
  tag,
  size = "xs",
}: {
  tag: ReviewTag;
  size?: "xs" | "sm";
}) {
  const s = SENTIMENT[tag.sentiment] ?? SENTIMENT.neutral;
  const Icon = s.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${s.className} ${
        size === "sm" ? "text-xs" : "text-[11px]"
      }`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">{s.label}: </span>
      {tag.label}
    </span>
  );
}

/** Sentiment badge for the tags table: icon + word. */
export function SentimentBadge({ sentiment }: { sentiment: ReviewSentiment }) {
  const s = SENTIMENT[sentiment] ?? SENTIMENT.neutral;
  const Icon = s.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${s.className}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}
