"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { MACRO_BG } from "@/lib/portal/macro-colors";
import { formatNumber, formatShortDate } from "@/lib/format";
import {
  barHeight,
  chartMax,
  percentSplit,
  streakMessage,
  type ProgressBar,
  type ProgressView,
} from "@/lib/portal/progress-stats";

const kcal = (n: number | null | undefined) => formatNumber(n, 0);

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function KcalChart({ bars }: { bars: ProgressBar[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 150;
  const top = 8;
  const bottom = 22;
  const left = 30;
  const plotH = H - top - bottom;
  const plotW = W - left - 4;
  const max = chartMax(bars.flatMap((b) => [b.kcal, b.target]));
  const slot = plotW / Math.max(1, bars.length);
  const barW = Math.max(3, Math.min(26, slot - 2));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const labelEvery = bars.length > 10 ? 5 : 1;

  const withTarget = bars.filter((b) => b.target != null).length;
  const eatenDays = bars.filter((b) => b.kcal > 0);
  const summary = `Daily calories eaten over the last ${bars.length} days. ${eatenDays.length} days with food logged${
    eatenDays.length ? `, highest ${kcal(Math.max(...eatenDays.map((b) => b.kcal)))} kcal` : ""
  }.${withTarget ? " Target markers are shown." : ""}`;
  const hovered = hover != null ? bars[hover] : null;

  return (
    <div>
      <div className="h-5 text-xs text-gray-600 mb-1" aria-live="polite">
        {hovered
          ? `${formatShortDate(hovered.date)}: ${kcal(hovered.kcal)} kcal${hovered.target != null ? ` of ${kcal(hovered.target)} target` : ""}`
          : "Tap a bar for details"}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="w-full h-auto">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={left} x2={W - 4} y1={y(max * f)} y2={y(max * f)} className="stroke-gray-200" strokeWidth={1} />
            <text x={left - 4} y={y(max * f) + 3} textAnchor="end" className="fill-gray-500" fontSize={9}>
              {kcal(max * f)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = left + slot * i + slot / 2;
          const h = barHeight(b.kcal, max, plotH);
          return (
            <g key={b.date}>
              <rect
                x={cx - barW / 2}
                y={top + plotH - h}
                width={barW}
                height={h}
                rx={Math.min(3, barW / 2)}
                className={hover === i ? "fill-indigo-700" : "fill-indigo-500"}
              />
              {b.target != null && (
                <line x1={cx - barW / 2 - 1} x2={cx + barW / 2 + 1} y1={y(b.target)} y2={y(b.target)} className="stroke-gray-800" strokeWidth={2} />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-gray-500" fontSize={9}>
                  {b.date.slice(8, 10)}
                </text>
              )}
              <rect
                x={cx - slot / 2}
                y={top}
                width={slot}
                height={plotH + bottom}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(hover === i ? null : i)}
              />
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-gray-600 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Eaten
        </span>
        {withTarget > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-gray-800" /> Target
          </span>
        )}
      </div>
      <details className="mt-2 text-xs text-gray-600">
        <summary className="cursor-pointer">View as table</summary>
        <table className="w-full mt-1">
          <tbody>
            {bars.map((b) => (
              <tr key={b.date} className="border-t border-gray-100">
                <td className="py-0.5">{formatShortDate(b.date)}</td>
                <td className="text-right">{kcal(b.kcal)} kcal</td>
                <td className="text-right">{b.target != null ? `/ ${kcal(b.target)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function MacroRow({ label, avg, target, unit, barClass }: { label: string; avg: number; target: number | null; unit: string; barClass: string }) {
  const scale = Math.max(avg, target ?? 0, 1);
  const pct = target ? Math.round((avg / target) * 100) : null;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-900 tabular-nums">
          {formatNumber(avg, 0)}
          {target != null ? ` / ${formatNumber(target, 0)}` : ""} {unit}
          {pct != null && <span className="text-gray-500"> ({pct}%)</span>}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-gray-100 mt-1">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${(avg / scale) * 100}%` }} />
        {target != null && <div className="absolute top-[-2px] h-[14px] w-0.5 bg-gray-800" style={{ left: `calc(${(target / scale) * 100}% - 1px)` }} />}
      </div>
    </div>
  );
}

export default function ProgressTrends({ view }: { view: ProgressView }) {
  const [range, setRange] = useState<7 | 30>(7);
  const win = view.windows[range];
  const { summary } = win;

  if (!view.hasActivity) {
    return (
      <Card title="Trends">
        <p className="text-sm text-gray-600">
          Nothing to show yet. Mark a planned meal as eaten or log a food on the Today tab and your trends and streak will appear here.
        </p>
      </Card>
    );
  }

  const adh = summary.adherence;
  const split = percentSplit([adh.eaten, adh.skipped, adh.unmarked]);
  const adhRows = [
    { label: "Eaten", n: adh.eaten, p: split[0], cls: "bg-emerald-500" },
    { label: "Skipped", n: adh.skipped, p: split[1], cls: "bg-gray-400" },
    { label: "Not marked", n: adh.unmarked, p: split[2], cls: "bg-amber-300" },
  ];
  const t = summary.averageTargets;
  const avg = summary.average;

  return (
    <>
      <Card title="Streak">
        <div className="flex items-center gap-4">
          <Flame className={`w-8 h-8 ${view.streak.current > 0 ? "text-orange-500" : "text-gray-300"}`} aria-hidden />
          <div className="flex gap-6">
            <div>
              <div className="text-2xl font-bold text-gray-900 tabular-nums">{view.streak.current}</div>
              <div className="text-xs text-gray-500">Current (days)</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900 tabular-nums">{view.streak.best}</div>
              <div className="text-xs text-gray-500">Best (days)</div>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-2">{streakMessage(view.streak, view.todayActive)}</p>
      </Card>

      <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
        {([7, 30] as const).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={range === n}
            onClick={() => setRange(n)}
            className={`px-4 min-h-[40px] rounded-md ${range === n ? "bg-gray-900 text-white" : "text-gray-700"}`}
          >
            {n} days
          </button>
        ))}
      </div>

      <Card title="Calories per day">
        <KcalChart bars={win.bars} />
      </Card>

      <Card title="Average per logged day">
        {avg ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Across {summary.activeDays} {summary.activeDays === 1 ? "day" : "days"} with food logged. The dark tick is your target.
            </p>
            <MacroRow label="Calories" avg={avg.calories} target={t.calories} unit="kcal" barClass="bg-indigo-500" />
            <MacroRow label="Protein" avg={avg.protein} target={t.protein} unit="g" barClass={MACRO_BG.protein} />
            <MacroRow label="Carbs" avg={avg.carbs} target={t.carbs} unit="g" barClass={MACRO_BG.carbs} />
            <MacroRow label="Fat" avg={avg.fat} target={t.fat} unit="g" barClass={MACRO_BG.fat} />
          </div>
        ) : (
          <p className="text-sm text-gray-600">No food logged in the last {range} days.</p>
        )}
      </Card>

      {adh.total > 0 && (
        <Card title="Plan adherence">
          <div
            role="img"
            aria-label={`Of ${adh.total} planned meals: ${adhRows.map((r) => `${r.n} ${r.label.toLowerCase()} (${r.p}%)`).join(", ")}`}
            className="flex h-3 gap-0.5 rounded-full overflow-hidden"
          >
            {adhRows.map((r) => r.n > 0 && <div key={r.label} className={r.cls} style={{ width: `${(r.n / adh.total) * 100}%` }} />)}
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {adhRows.map((r) => (
              <li key={r.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-gray-700">
                  <span className={`w-2.5 h-2.5 rounded-sm ${r.cls}`} /> {r.label}
                </span>
                <span className="text-gray-900 tabular-nums">
                  {r.n} ({r.p}%)
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Off-plan share">
        {summary.offPlanKcalShare != null ? (
          <>
            <div className="text-2xl font-bold text-gray-900 tabular-nums">{Math.round(summary.offPlanKcalShare * 100)}%</div>
            <p className="text-sm text-gray-600">of the calories you ate came from foods you logged yourself.</p>
          </>
        ) : (
          <p className="text-sm text-gray-600">No calories eaten in the last {range} days.</p>
        )}
      </Card>
    </>
  );
}
