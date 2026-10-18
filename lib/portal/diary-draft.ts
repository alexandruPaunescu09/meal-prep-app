// Pure helpers for building/editing diary entries on the client (no browser state, unit-testable).
import type {
  CatalogItem,
  DiaryQuantityUnit,
  DiarySnapshot,
  FoodLogEntry,
  MealType,
} from "@/lib/supabase/types";
import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { parseDecimal } from "@/lib/format";
import { snapshotForCatalogItem } from "@/lib/calculations/diary";

/** Nutrition columns of a diary row; a DiarySnapshot or an existing FoodLogEntry satisfies it. */
export type SnapshotLike = Pick<
  FoodLogEntry,
  | "name"
  | "brand"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "sugar"
  | "sat_fat"
  | "salt"
  | "micronutrients"
>;

export const MAX_AMOUNT = 5000;
export const MAX_QUICK_KCAL = 5000;
export const MAX_QUICK_MACRO = 500;

/** v4 UUID; `crypto.randomUUID` is missing on insecure origins (LAN http), so fall back. */
export function newEntryId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Units a catalog item can be logged in, default first. */
export function availableUnits(
  item: Pick<CatalogItem, "kind" | "unit" | "servingSize">
): DiaryQuantityUnit[] {
  if (item.kind === "recipe") return ["portion"];
  const base: DiaryQuantityUnit = item.unit === "ml" ? "ml" : "g";
  return item.servingSize && item.servingSize > 0 ? ["serving", base] : [base];
}

/** First amount shown in the picker: one serving when known, else 100 g/ml, or 1 portion. */
export function defaultAmount(item: Pick<CatalogItem, "kind" | "unit" | "servingSize">): {
  quantity: number;
  unit: DiaryQuantityUnit;
} {
  const unit = availableUnits(item)[0];
  return { quantity: unit === "g" || unit === "ml" ? 100 : 1, unit };
}

/** Parses an amount typed with a decimal comma or point; null unless 0 < n <= MAX_AMOUNT. */
export function parseAmount(text: string): number | null {
  const n = parseDecimal(text);
  return n !== null && n > 0 && n <= MAX_AMOUNT ? n : null;
}

/** Optional number field: "" -> null (omitted), invalid -> NaN so callers can flag it. */
export function parseOptionalNumber(text: string, max: number): number | null {
  if (text.trim() === "") return null;
  const n = parseDecimal(text);
  return n !== null && n >= 0 && n <= max ? n : Number.NaN;
}

export function buildCatalogInput(args: {
  id: string;
  logDate: string;
  mealType: MealType;
  item: Pick<CatalogItem, "kind" | "id">;
  quantity: number;
  unit: DiaryQuantityUnit;
}): DiaryEntryInput {
  const { item } = args;
  return {
    id: args.id,
    log_date: args.logDate,
    meal_type: args.mealType,
    source_kind: item.kind,
    food_id: item.kind === "food" ? item.id : null,
    ingredient_id: item.kind === "ingredient" ? item.id : null,
    recipe_id: item.kind === "recipe" ? item.id : null,
    quantity: args.quantity,
    quantity_unit: args.unit,
  };
}

export function buildQuickInput(args: {
  id: string;
  logDate: string;
  mealType: MealType;
  name: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}): DiaryEntryInput {
  return {
    id: args.id,
    log_date: args.logDate,
    meal_type: args.mealType,
    source_kind: "quick",
    quantity: 1,
    quantity_unit: "serving",
    name: args.name.trim() || null,
    calories: args.calories,
    protein: args.protein,
    carbs: args.carbs,
    fat: args.fat,
  };
}

/** Snapshot for a quick add, mirroring what the server stores. */
export function quickSnapshot(input: DiaryEntryInput): DiarySnapshot {
  return {
    name: input.name?.trim() || "Quick add",
    brand: null,
    calories: input.calories ?? 0,
    protein: input.protein ?? 0,
    carbs: input.carbs ?? 0,
    fat: input.fat ?? 0,
    fiber: 0,
    sugar: 0,
    sat_fat: 0,
    salt: 0,
    micronutrients: {},
  };
}

/** Display row for a write that has not reached the server yet. */
export function optimisticEntry(
  input: DiaryEntryInput,
  snapshot: SnapshotLike,
  clientId: string,
  now: Date = new Date()
): FoodLogEntry {
  const ts = now.toISOString();
  return {
    id: input.id,
    client_id: clientId,
    log_date: input.log_date,
    meal_type: input.meal_type,
    source_kind: input.source_kind,
    food_id: input.food_id ?? null,
    ingredient_id: input.ingredient_id ?? null,
    recipe_id: input.recipe_id ?? null,
    quantity: input.quantity,
    quantity_unit: input.quantity_unit,
    ...snapshot,
    created_at: ts,
    updated_at: ts,
  };
}

/** Whether an entry can be re-saved: catalog entries need their source item to still exist. */
export function isEditable(e: FoodLogEntry): boolean {
  if (e.source_kind === "quick") return true;
  return Boolean(e.food_id ?? e.ingredient_id ?? e.recipe_id);
}

/** The upsert body that recreates an existing entry (edit, or Undo of a delete). */
export function entryToInput(
  e: FoodLogEntry,
  overrides: Partial<Pick<DiaryEntryInput, "meal_type" | "quantity">> = {}
): DiaryEntryInput {
  const base = {
    id: e.id,
    log_date: e.log_date,
    meal_type: overrides.meal_type ?? e.meal_type,
    source_kind: e.source_kind,
    quantity: overrides.quantity ?? e.quantity,
    quantity_unit: e.quantity_unit,
  };
  if (e.source_kind === "quick") {
    return {
      ...base,
      name: e.name,
      calories: e.calories ?? 0,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
    };
  }
  return { ...base, food_id: e.food_id, ingredient_id: e.ingredient_id, recipe_id: e.recipe_id };
}

/** Linear re-scale of a catalog entry's snapshot to a new quantity (same unit). */
export function scaleEntry(e: FoodLogEntry, quantity: number): FoodLogEntry {
  const f = e.quantity > 0 ? quantity / e.quantity : 1;
  const scale = (n: number | null) => (n === null ? null : n * f);
  return {
    ...e,
    quantity,
    calories: scale(e.calories),
    protein: scale(e.protein),
    carbs: scale(e.carbs),
    fat: scale(e.fat),
    fiber: scale(e.fiber),
    sugar: scale(e.sugar),
    sat_fat: scale(e.sat_fat),
    salt: scale(e.salt),
    micronutrients: Object.fromEntries(
      Object.entries(e.micronutrients ?? {}).map(([k, v]) => [k, v * f])
    ),
  };
}

/** Preview snapshot for an item + amount, or null when the combination is invalid. */
export function previewSnapshot(
  item: CatalogItem,
  quantity: number | null,
  unit: DiaryQuantityUnit
): DiarySnapshot | null {
  if (quantity === null) return null;
  try {
    return snapshotForCatalogItem(item, quantity, unit);
  } catch {
    return null;
  }
}
