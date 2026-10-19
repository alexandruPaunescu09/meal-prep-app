"use client";

import { useMemo, useState } from "react";
import { formatKg } from "@/lib/weight";
import { formatShortDate } from "@/lib/format";
import { buildWeightChart, type WeightPoint } from "@/lib/portal/weight";

const W = 340;
const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

interface Props {
  logs: WeightPoint[];
  target: number | null;
  /** Plain-text summary for screen readers. */
  summary: string;
}

/** Hand-rolled SVG line chart: weight over time with a dashed goal reference line. */
export default function WeightChart({ logs, target, summary }: Props) {
  const geo = useMemo(
    () => buildWeightChart(logs, { width: W, height: H, padding: PAD, target }),
    [logs, target]
  );
  const [active, setActive] = useState<number | null>(null);

  if (geo.points.length === 0) return null;
  const sel = active != null ? geo.points[Math.min(active, geo.points.length - 1)] : null;
  const first = geo.points[0];
  const last = geo.points[geo.points.length - 1];

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    geo.points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(geo.points[best].x - x)) best = i;
    });
    setActive(best);
  }

  return (
    <figure className="space-y-2 max-w-md mx-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        className="w-full h-auto touch-pan-y select-none"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
      >
        {geo.yTicks.map((t) => (
          <g key={t.value}>
            <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} className="stroke-gray-200" strokeWidth={1} />
            <text x={PAD.left - 6} y={t.y + 4} textAnchor="end" className="fill-gray-500" fontSize={11}>
              {formatKg(t.value)}
            </text>
          </g>
        ))}
        {geo.goalY != null && target != null && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={geo.goalY}
              y2={geo.goalY}
              className="stroke-amber-500"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              data-testid="goal-line"
            />
            <text x={W - PAD.right} y={geo.goalY - 5} textAnchor="end" className="fill-amber-700" fontSize={11}>
              Goal {formatKg(target)} kg
            </text>
          </g>
        )}
        {geo.points.length > 1 && (
          <path d={geo.path} fill="none" className="stroke-emerald-600" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {geo.points.map((p, i) => (
          <circle
            key={p.log_date}
            cx={p.x}
            cy={p.y}
            r={i === active ? 5 : 4}
            className="fill-emerald-600 stroke-white"
            strokeWidth={2}
          />
        ))}
        {sel && (
          <line x1={sel.x} x2={sel.x} y1={PAD.top} y2={H - PAD.bottom} className="stroke-gray-300" strokeWidth={1} />
        )}
        <text x={first.x} y={H - 6} textAnchor={geo.points.length > 1 ? "start" : "middle"} className="fill-gray-500" fontSize={11}>
          {formatShortDate(first.log_date)}
        </text>
        {geo.points.length > 1 && (
          <text x={last.x} y={H - 6} textAnchor="end" className="fill-gray-500" fontSize={11}>
            {formatShortDate(last.log_date)}
          </text>
        )}
      </svg>
      <figcaption className="text-xs text-gray-500 min-h-[1rem]" aria-hidden="true">
        {sel ? `${formatShortDate(sel.log_date)}: ${formatKg(sel.weight_kg)} kg` : "Touch the chart to see a day."}
      </figcaption>
    </figure>
  );
}
