/** ro-RO decimal comma, at most one decimal, no trailing zeros ("95", "72,5"). */
export function formatKg(n: number): string {
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(n);
}

/** Allowed goal-weight range; mirrors the clients.target_weight_kg CHECK. */
export const TARGET_WEIGHT_MIN = 30;
export const TARGET_WEIGHT_MAX = 300;

/** "95 → 80 kg", "95 kg" (no goal) or "goal 80 kg" (no current). Null if neither. */
export function formatWeightProgress(
  current: number | null | undefined,
  target: number | null | undefined
): string | null {
  if (current != null && target != null)
    return `${formatKg(current)} → ${formatKg(target)} kg`;
  if (current != null) return `${formatKg(current)} kg`;
  if (target != null) return `goal ${formatKg(target)} kg`;
  return null;
}
