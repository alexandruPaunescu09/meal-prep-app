import type { SupabaseClient } from "@supabase/supabase-js";
import type { BarcodeLookup } from "@/lib/nutrition/open-food-facts";
import { lookupBarcode } from "@/lib/nutrition/open-food-facts";
import type { CatalogItem, Food } from "@/lib/supabase/types";
import { FOOD_COLS, INGREDIENT_COLS, foodToItem, ingredientToItem } from "@/lib/portal/catalog";
import { createRateLimiter } from "@/lib/portal/rate-limit";

/**
 * Barcode lookup + shared-catalog insert for the customer diary (FD-4). Server only: takes the
 * SERVICE-ROLE client and must be called after `requireCustomer()`. FD-5 (label photo) and FD-12
 * (moderation) reuse `findFood`, `canCreateFood` and the daily limit from here.
 */

export const BARCODE_RE = /^\d{8,14}$/;
/** New foods one customer may add per rolling 24 hours (barcode scans and, later, label photos). */
export const DAILY_NEW_FOOD_LIMIT = 30;

/** Open Food Facts lookups one customer may trigger per hour (per server instance, best effort). */
export const OFF_LOOKUPS_PER_HOUR = 60;
const offLimiter = createRateLimiter(OFF_LOOKUPS_PER_HOUR, 60 * 60 * 1000);

export type BarcodeFailure = "not_found" | "incomplete_data" | "rate_limited" | "too_many_lookups";

/**
 * Canonical GTIN-13 form of a scanned code, plus the other spellings of the same product.
 * UPC-A (12 digits) is EAN-13 with a leading 0, and GTIN-14 with a leading 0 is the same EAN-13.
 * Returns null when the input is not 8-14 digits.
 */
export function normalizeBarcode(raw: string): { canonical: string; variants: string[] } | null {
  const digits = raw.trim();
  if (!BARCODE_RE.test(digits)) return null;
  let canonical = digits;
  if (digits.length === 12) canonical = `0${digits}`;
  else if (digits.length === 14 && digits.startsWith("0")) canonical = digits.slice(1);
  const variants = new Set([canonical, digits]);
  if (canonical.length === 13 && canonical.startsWith("0")) variants.add(canonical.slice(1));
  return { canonical, variants: [...variants] };
}

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
  // The unit is never guessed: a drink stored as grams would log the wrong amount.
  if (!lookup.unit) return null;
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
  if (!energyMatchesMacros(calories, protein, carbs, fat)) return null;

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

/**
 * Energy must roughly agree with 4P + 4C + 9F. Catches shifted decimals and per-serving values filed
 * as per-100. Tolerance: more than 40 kcal AND more than 25% apart. Alcoholic drinks (alcohol adds
 * 7 kcal/g that no macro column carries) usually fail this and go to the label-photo path.
 */
export function energyMatchesMacros(kcal: number, protein: number, carbs: number, fat: number): boolean {
  const expected = 4 * protein + 4 * carbs + 9 * fat;
  const diff = Math.abs(kcal - expected);
  return diff <= 40 || diff <= 0.25 * Math.max(kcal, expected);
}

/** Whether a customer who already added `createdLast24h` foods may add another. */
export const canCreateFood = (createdLast24h: number): boolean => createdLast24h < DAILY_NEW_FOOD_LIMIT;

type FoodLookupRow = Parameters<typeof foodToItem>[0] & {
  barcode: string | null;
  created_by_client_id: string | null;
  promoted_ingredient_id: string | null;
};

/** Same visibility as the RLS policy: active, or the customer's own pending food. */
function usable(row: FoodLookupRow, clientId: string): boolean {
  return row.status === "active" || (row.status === "pending" && row.created_by_client_id === clientId);
}

/** The food for a barcode under any of its spellings, preferring the canonical one. */
export async function findFood(
  service: SupabaseClient,
  variants: string[],
  canonical = variants[0]
): Promise<FoodLookupRow | null> {
  const { data, error } = await service.from("foods").select(FOOD_COLS).in("barcode", variants).limit(variants.length);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as FoodLookupRow[];
  return rows.find((r) => r.barcode === canonical) ?? rows[0] ?? null;
}

async function ingredientItem(service: SupabaseClient, by: { id: string } | { barcodes: string[] }) {
  let q = service.from("ingredients").select(INGREDIENT_COLS);
  q = "id" in by ? q.eq("id", by.id) : q.in("barcode", by.barcodes);
  // Two ingredients can share a barcode: take the most recently edited, then the lowest id, every time.
  const { data, error } = await q.order("updated_at", { ascending: false }).order("id").limit(1);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0];
  return row ? ingredientToItem(row as unknown as Parameters<typeof ingredientToItem>[0]) : null;
}

async function createdInLast24h(service: SupabaseClient, clientId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await service
    .from("foods")
    .select("id", { count: "exact", head: true })
    .eq("created_by_client_id", clientId)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface ResolveDeps {
  lookup?: (code: string) => Promise<BarcodeLookup | null>;
  /** Returns true when this customer may call Open Food Facts now. */
  allowOffLookup?: (clientId: string) => boolean;
}

/**
 * Resolves a scanned barcode to something loggable: foods, then ingredients, then Open Food Facts.
 * `rawCode` may be any 8-14 digit spelling; it is normalised to GTIN-13 for matching and storage.
 * Throws on database errors and `OffUnavailableError` when OFF could not answer (route -> 502).
 *
 * Quotas: OFF is only called for a customer under both the per-hour lookup cap and the daily
 * new-food cap. The daily cap is read before the OFF call (to spare it) and again right before the
 * insert. A count-then-insert cannot be atomic without a database function, so parallel requests for
 * different new barcodes can overshoot the daily cap by the number of requests in flight.
 */
export async function resolveBarcode(
  service: SupabaseClient,
  clientId: string,
  rawCode: string,
  deps: ResolveDeps = {}
): Promise<BarcodeResult> {
  const lookup = deps.lookup ?? lookupBarcode;
  const allowOff = deps.allowOffLookup ?? ((id: string) => offLimiter.take(id));
  const norm = normalizeBarcode(rawCode);
  if (!norm) return { ok: false, reason: "not_found" };
  const { canonical, variants } = norm;

  const food = await findFood(service, variants, canonical);
  if (food) {
    if (!usable(food, clientId)) return { ok: false, reason: "not_found" }; // hidden, or another customer's pending
    // Promoted foods live on as the priced ingredient (search hides them too).
    if (food.promoted_ingredient_id) {
      const promoted = await ingredientItem(service, { id: food.promoted_ingredient_id });
      if (promoted) return { ok: true, item: promoted, source: "ingredient", created: false };
    }
    return { ok: true, item: foodToItem(food), source: "food", created: false };
  }

  const ingredient = await ingredientItem(service, { barcodes: variants });
  if (ingredient) return { ok: true, item: ingredient, source: "ingredient", created: false };

  if (!canCreateFood(await createdInLast24h(service, clientId))) return { ok: false, reason: "rate_limited" };
  if (!allowOff(clientId)) return { ok: false, reason: "too_many_lookups" };

  const found = await lookup(canonical);
  if (!found) return { ok: false, reason: "not_found" };
  const row = mapOffToFood(found, canonical, clientId);
  if (!row) return { ok: false, reason: "incomplete_data" };

  if (!canCreateFood(await createdInLast24h(service, clientId))) return { ok: false, reason: "rate_limited" };

  const { data, error } = await service.from("foods").insert(row).select(FOOD_COLS).single();
  if (error) {
    if (error.code !== "23505") throw new Error(error.message);
    // Another scan created it first: return that row so there is exactly one food per barcode.
    const winner = await findFood(service, variants, canonical);
    if (winner && usable(winner, clientId)) return { ok: true, item: foodToItem(winner), source: "food", created: false };
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, item: foodToItem(data as unknown as FoodLookupRow), source: "off", created: true };
}
