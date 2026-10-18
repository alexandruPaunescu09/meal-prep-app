import { formatNumber } from "@/lib/format";

type Macros = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

/** kcal + P/C/F of what is about to be logged. Always formatted: snapshots are unrounded. */
export default function MacroPreview({ macros }: { macros: Macros | null }) {
  return (
    <div
      aria-live="polite"
      className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center justify-between gap-3"
    >
      <p className="text-lg font-semibold text-emerald-900">
        {macros ? formatNumber(Math.round(macros.calories ?? 0), 0) : "—"}
        <span className="text-sm font-normal text-emerald-800"> kcal</span>
      </p>
      <dl className="flex gap-3 text-xs text-emerald-900">
        {(
          [
            ["P", macros?.protein],
            ["C", macros?.carbs],
            ["F", macros?.fat],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="text-center">
            <dt className="text-emerald-700">{k}</dt>
            <dd className="font-medium">{macros ? `${formatNumber(v ?? 0, 1)} g` : "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
