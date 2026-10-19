// Pure helpers for FD-6: recents, favorites keys and copy-meal (no browser or server state, unit-testable).
import type { CatalogItem, DiaryQuantityUnit, FoodLogEntry, MealType } from "@/lib/supabase/types";
import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { entryToInput, optimisticEntry, type SnapshotLike } from "@/lib/portal/diary-draft";

export type CatalogKind = "food" | "ingredient" | "recipe";
export interface CatalogRef {
  kind: CatalogKind;
  id: string;
}

/** The log columns the recents query reads. */
export type RecentLogRow = Pick<
  FoodLogEntry,
  | "log_date"
  | "updated_at"
  | "source_kind"
  | "food_id"
  | "ingredient_id"
  | "recipe_id"
  | "quantity"
  | "quantity_unit"
>;

export interface RecentCandidate extends CatalogRef {
  quantity: number;
  unit: DiaryQuantityUnit;
  /** The log date this amount was last used on. */
  lastDate: string;
}

export interface RecentItem {
  item: CatalogItem;
  quantity: number;
  unit: DiaryQuantityUnit;
  lastDate: string;
}

export const RECENT_DAYS = 30;
export const RECENT_CANDIDATE_LIMIT = 60;
export const RECENT_RESULT_LIMIT = 30;

export const refKey = (r: CatalogRef) => `${r.kind}:${r.id}`;

/** The catalog target of a log row, or null for quick adds and rows whose item was deleted. */
export function rowRef(
  r: Pick<FoodLogEntry, "source_kind" | "food_id" | "ingredient_id" | "recipe_id">
): CatalogRef | null {
  if (r.source_kind === "food" && r.food_id) return { kind: "food", id: r.food_id };
  if (r.source_kind === "ingredient" && r.ingredient_id) return { kind: "ingredient", id: r.ingredient_id };
  if (r.source_kind === "recipe" && r.recipe_id) return { kind: "recipe", id: r.recipe_id };
  return null;
}

/**
 * Distinct catalog targets, most recently used first, each carrying its LAST amount and unit.
 * Ordering: log date, then updated_at (the later log of the same day wins). Quick adds and rows
 * whose item is gone are skipped.
 */
export function dedupeRecents(rows: RecentLogRow[], limit = RECENT_CANDIDATE_LIMIT): RecentCandidate[] {
  const sorted = [...rows].sort(
    (a, b) => b.log_date.localeCompare(a.log_date) || b.updated_at.localeCompare(a.updated_at)
  );
  const seen = new Set<string>();
  const out: RecentCandidate[] = [];
  for (const r of sorted) {
    const ref = rowRef(r);
    if (!ref || seen.has(refKey(ref))) continue;
    seen.add(refKey(ref));
    out.push({ ...ref, quantity: r.quantity, unit: r.quantity_unit, lastDate: r.log_date });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Keeps the candidates whose item is still usable (hidden foods, someone else's pending foods and
 * recipes outside the client's plans are missing from `usable`), preserving order.
 */
export function attachUsable(
  candidates: RecentCandidate[],
  usable: Map<string, CatalogItem>,
  limit = RECENT_RESULT_LIMIT
): RecentItem[] {
  const out: RecentItem[] = [];
  for (const c of candidates) {
    const item = usable.get(refKey(c));
    if (!item) continue;
    out.push({ item, quantity: c.quantity, unit: c.unit, lastDate: c.lastDate });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Only the nutrition snapshot columns of an entry. optimisticEntry() spreads its snapshot argument
 * over the row, so passing a whole source row would overwrite the new id and date.
 */
export function snapshotOf(s: SnapshotLike): SnapshotLike {
  return {
    name: s.name,
    brand: s.brand,
    calories: s.calories,
    protein: s.protein,
    carbs: s.carbs,
    fat: s.fat,
    fiber: s.fiber,
    sugar: s.sugar,
    sat_fat: s.sat_fat,
    salt: s.salt,
    micronutrients: s.micronutrients,
  };
}

export interface CopiedEntry {
  input: DiaryEntryInput;
  /** Display row (also what Undo removes). */
  entry: FoodLogEntry;
}

/**
 * Copies of the logged `sources` into `targetDate` / `mealType`, each with a NEW id. Only logged
 * diary rows are copied (plan meals never reach here); catalog rows whose item was deleted cannot
 * be re-saved and are counted in `skipped`.
 */
export function buildMealCopies(
  sources: FoodLogEntry[],
  opts: { targetDate: string; mealType: MealType; newId: () => string; clientId?: string; now?: Date }
): { copies: CopiedEntry[]; skipped: number } {
  const copies: CopiedEntry[] = [];
  let skipped = 0;
  for (const s of sources) {
    if (s.source_kind !== "quick" && !rowRef(s)) {
      skipped++;
      continue;
    }
    const input: DiaryEntryInput = {
      ...entryToInput(s, { meal_type: opts.mealType }),
      id: opts.newId(),
      log_date: opts.targetDate,
    };
    copies.push({ input, entry: optimisticEntry(input, snapshotOf(s), opts.clientId ?? "local", opts.now) });
  }
  return { copies, skipped };
}

/** The upsert body for "Log again": same item and amount, new id, on the viewed day. */
export function buildLogAgain(
  entry: FoodLogEntry,
  opts: { logDate: string; mealType: MealType; id: string }
): DiaryEntryInput {
  return { ...entryToInput(entry, { meal_type: opts.mealType }), id: opts.id, log_date: opts.logDate };
}
