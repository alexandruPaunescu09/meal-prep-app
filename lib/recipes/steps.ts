import {
  RECIPE_STEP_MAX_COUNT,
  RECIPE_STEP_MAX_LENGTH,
  recipeSourceUrlSchema,
} from "@/lib/validations/schemas";

/** Trim every step and drop the empty ones (what gets saved). */
export function normalizeSteps(steps: string[]): string[] {
  return steps.map((s) => s.trim()).filter((s) => s !== "");
}

/** Returns an error message for the steps as they would be saved, or null when valid. */
export function validateSteps(steps: string[]): string | null {
  const clean = normalizeSteps(steps);
  if (clean.length > RECIPE_STEP_MAX_COUNT) {
    return `A recipe can have at most ${RECIPE_STEP_MAX_COUNT} steps.`;
  }
  const tooLong = clean.findIndex((s) => s.length > RECIPE_STEP_MAX_LENGTH);
  if (tooLong >= 0) {
    return `Step ${tooLong + 1} is longer than ${RECIPE_STEP_MAX_LENGTH} characters.`;
  }
  return null;
}

/** Trimmed link, or null when blank. */
export function normalizeSourceUrl(value: string): string | null {
  const v = value.trim();
  return v === "" ? null : v;
}

/** Error message for a (possibly blank) source link, or null when valid. */
export function validateSourceUrl(value: string): string | null {
  const v = normalizeSourceUrl(value);
  if (v === null) return null;
  const r = recipeSourceUrlSchema.safeParse(v);
  return r.success ? null : r.error.issues[0].message;
}

/** Move the item at `index` by `delta` (-1 up, +1 down); returns the same array if out of range. */
export function moveItem<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= items.length || to < 0 || to >= items.length) return items;
  const next = items.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
