import type { SupabaseClient } from "@supabase/supabase-js";
import type { BarcodeLookup } from "@/lib/nutrition/open-food-facts";
import { lookupBarcode } from "@/lib/nutrition/open-food-facts";
import type { CatalogItem, Food } from "@/lib/supabase/types";
import { FOOD_COLS, INGREDIENT_COLS, foodToItem, ingredientToItem } from "@/lib/portal/catalog";

/**
 * Barcode lookup + shared-catalog insert for the customer diary (FD-4). Server only: takes the
 * SERVICE-ROLE client and must be called after `requireCustomer()`. FD-5 (label photo) and FD-12
 * (moderation) reuse `findFood`, `canCreateFood` and the daily limit from here.
 */

export const BARCODE_RE = /^\d{8,14}$/;
/** New foods one customer may add per rolling 24 hours (barcode scans and, later, label photos). */
export const DAILY_NEW_FOOD_LIMIT = 30;

export type BarcodeFailure = "not_found" | "incomplete_data" | "rate_limited";

export type BarcodeResult =
  | { ok: true; item: CatalogItem; source: "food" | "ingredient" | "off"; created: boolean }
  | { ok: false; reason: BarcodeFailure };

export type FoodInsert = Pick<
  Food,
  | "barcode"
  | "name"
  | "brand"
  | "unit"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "sugar"
  | "sat_fat"
  | "salt"
  | "micronutrients"
  | "serving_size"
  | "serving_label"
  | "package_size"
> & { source: "off"; status: "active"; created_by_client_id: string };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** A per-100 value, or null when missing / impossible (negative or above `max`). */
const bounded = (v: unknown, max: number): number | null => (finite(v) && v >= 0 && v <= max ? v : null);

/**
 * Decides whether an Open Food Facts product is complete enough for the shared catalog and maps it
 * to a `foods` row. Needs per-100 data with kcal and protein/carbs/fat; anything else is rejected
 * (customers cannot fix values, so we ask for a label photo rather than store a guess).
 */
export function mapOffToFood(lookup: BarcodeLookup, code: string, clientId: string): FoodInsert | null {
  if (lookup.perServingOnly) return null;
  const { nutrition: n, name, brand } = lookup.result;
  const cleanName = name?.trim().slice(0, 120);
  if (!cleanName) return null;

  const calories = bounded(n.calories, 900);
  const protein = bounded(n.protein, 100);
  const carbs = bounded(n.carbs, 100);
  const fat = bounded(n.fat, 100);
  if (calories === null || protein === null || carbs === null || fat === null) return null;
  // Per 100 g the three macros cannot weigh more than the food itself (small slack for rounding).
  if (protein + carbs + fat > 110) return null;

  const micronutrients: Record<string, number> = {};
  for (const [k, v] of Object.entries(n.micronutrients ?? {})) if (finite(v) && v >= 0) micronutrients[k] = v;

  return {
    barcode: code,
    name: cleanName,
    brand: brand?.trim().slice(0, 80) || null,
    unit: lookup.unit,
    calories,
    protein,
    carbs,
    fat,
    fiber: bounded(n.fiber, 100),
    sugar: bounded(n.sugar, 100),
    sat_fat: bounded(n.sat_fat, 100),
    salt: bounded(n.salt, 100),
    micronutrients,
    serving_size: lookup.serving?.size ?? null,
    serving_label: lookup.serving?.label ?? null,
    package_size: lookup.packageSize?.quantity ?? null,
    source: "off",
    status: "active",
    created_by_client_id: clientId,
  };
}

/** Whether a customer who already added `createdLast24h` foods may add another. */
export const canCreateFood = (createdLast24h: number): boolean => createdLast24h < DAILY_NEW_FOOD_LIMIT;

type FoodLookupRow = Parameters<typeof foodToItem>[0] & {
  created_by_client_id: string | null;
  promoted_ingredient_id: string | null;
};

/** Same visibility as the RLS policy: active, or the customer's own pending food. */
function usable(row: FoodLookupRow, clientId: string): boolean {
  return row.status === "active" || (row.status === "pending" && row.created_by_client_id === clientId);
}

export async function findFood(service: SupabaseClient, code: string): Promise<FoodLookupRow | null> {
  const { data, error } = await service.from("foods").select(FOOD_COLS).eq("barcode", code).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FoodLookupRow | null) ?? null;
}

async function ingredientItem(service: SupabaseClient, column: "id" | "barcode", value: string) {
  const { data, error } = await service.from("ingredients").select(INGREDIENT_COLS).eq(column, value).limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  return row ? ingredientToItem(row as unknown as Parameters<typeof ingredientToItem>[0]) : null;
}

/** Resolves a scanned barcode to something loggable: foods, then ingredients, then Open Food Facts. */
export async function resolveBarcode(
  service: SupabaseClient,
  clientId: string,
  code: string,
  lookup: (code: string) => Promise<BarcodeLookup | null> = lookupBarcode
): Promise<BarcodeResult> {
  const food = await findFood(service, code);
  if (food) {
    if (!usable(food, clientId)) return { ok: false, reason: "not_found" }; // hidden, or someone else's pending
    // Promoted foods live on as the priced ingredient (search hides them too).
    if (food.promoted_ingredient_id) {
      const promoted = await ingredientItem(service, "id", food.promoted_ingredient_id);
      if (promoted) return { ok: true, item: promoted, source: "ingredient", created: false };
    }
    return { ok: true, item: foodToItem(food), source: "food", created: false };
  }

  const ingredient = await ingredientItem(service, "barcode", code);
  if (ingredient) return { ok: true, item: ingredient, source: "ingredient", created: false };

  const found = await lookup(code);
  if (!found) return { ok: false, reason: "not_found" };
  const row = mapOffToFood(found, code, clientId);
  if (!row) return { ok: false, reason: "incomplete_data" };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await service
    .from("foods")
    .select("id", { count: "exact", head: true })
    .eq("created_by_client_id", clientId)
    .gte("created_at", since);
  if (countError) throw new Error(countError.message);
  if (!canCreateFood(count ?? 0)) return { ok: false, reason: "rate_limited" };

  const { data, error } = await service.from("foods").insert(row).select(FOOD_COLS).single();
  if (error) {
    if (error.code !== "23505") throw new Error(error.message);
    // Another scan created it first: return that row so there is exactly one food per barcode.
    const winner = await findFood(service, code);
    if (winner && usable(winner, clientId)) return { ok: true, item: foodToItem(winner), source: "food", created: false };
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, item: foodToItem(data as unknown as FoodLookupRow), source: "off", created: true };
}
