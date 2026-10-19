import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogItem } from "@/lib/supabase/types";
import { FOOD_COLS, foodToItem } from "@/lib/portal/catalog";
import { canCreateFood, createdInLast24h, findFood, normalizeBarcode } from "@/lib/portal/foods";
import type { LabelDraft } from "@/lib/portal/label-map";

/**
 * Server-side helpers for the label-photo flow (FD-5). Take the SERVICE-ROLE client and must only be
 * called after `requireCustomer()`.
 */

/** Label parses (model calls) one customer may make per rolling 24 hours. */
export const LABEL_PARSES_PER_DAY = 10;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only storage keys a customer may reference for a given food id. */
export function labelPhotoPaths(clientId: string, foodId: string) {
  return { label: `${clientId}/${foodId}/label.jpg`, front: `${clientId}/${foodId}/front.jpg` };
}

/** True when both paths sit exactly where the capture step uploads them for this customer and food. */
export function photoPathsValid(
  clientId: string,
  foodId: string,
  labelPath: string,
  frontPath: string | null | undefined
): boolean {
  if (!UUID_RE.test(foodId)) return false;
  const p = labelPhotoPaths(clientId, foodId);
  return labelPath === p.label && (frontPath == null || frontPath === p.front);
}

export async function labelParsesInLast24h(service: SupabaseClient, clientId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await service
    .from("food_label_parses")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type CreateLabelFoodResult =
  | { ok: true; item: CatalogItem; created: boolean; barcodeKept: boolean }
  | { ok: false; reason: "rate_limited" };

export interface CreateLabelFoodArgs {
  clientId: string;
  foodId: string;
  barcode: string | null;
  labelPath: string;
  frontPath: string | null;
  draft: LabelDraft;
}

type Row = Parameters<typeof foodToItem>[0] & { created_by_client_id: string | null };

/**
 * Inserts the pending, creator-only `foods` row for a verified draft.
 *
 * - Replay (same `food_id` already created by this customer): returns the existing row.
 * - The scanned barcode already belongs to a food this customer may use (active, or their own
 *   pending): returns THAT food instead of creating a duplicate (`created: false`).
 * - The barcode belongs to someone else's pending or a hidden food (the UNIQUE index would reject
 *   it): the new food is stored WITHOUT a barcode (`barcodeKept: false`). The customer still gets
 *   their product logged, and the admin sees it in the moderation queue to merge.
 */
export async function createLabelFood(service: SupabaseClient, a: CreateLabelFoodArgs): Promise<CreateLabelFoodResult> {
  const own = async (): Promise<CatalogItem | null> => {
    const { data, error } = await service.from("foods").select(FOOD_COLS).eq("id", a.foodId).maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as unknown as Row | null;
    return row && row.created_by_client_id === a.clientId ? foodToItem(row) : null;
  };

  const replay = await own();
  if (replay) return { ok: true, item: replay, created: false, barcodeKept: true };

  const norm = a.barcode ? normalizeBarcode(a.barcode) : null;
  let barcode: string | null = norm?.canonical ?? null;
  if (norm) {
    const existing = await findFood(service, norm.variants, norm.canonical);
    if (existing) {
      const mine =
        existing.status === "active" || (existing.status === "pending" && existing.created_by_client_id === a.clientId);
      if (mine && !existing.promoted_ingredient_id) {
        return { ok: true, item: foodToItem(existing), created: false, barcodeKept: true };
      }
      barcode = null;
    }
  }

  if (!canCreateFood(await createdInLast24h(service, a.clientId))) return { ok: false, reason: "rate_limited" };

  const d = a.draft;
  const base = {
    id: a.foodId,
    name: d.name,
    brand: d.brand,
    unit: d.unit,
    calories: d.calories,
    protein: d.protein,
    carbs: d.carbs,
    fat: d.fat,
    fiber: d.fiber,
    sugar: d.sugar,
    sat_fat: d.sat_fat,
    salt: d.salt,
    micronutrients: d.micronutrients,
    serving_size: d.serving_size,
    serving_label: d.serving_label,
    package_size: d.package_size,
    source: "label_photo" as const,
    status: "pending" as const,
    created_by_client_id: a.clientId,
    label_photo_path: a.labelPath,
    front_photo_path: a.frontPath,
  };

  let kept = barcode !== null;
  let res = await service.from("foods").insert({ ...base, barcode }).select(FOOD_COLS).single();
  if (res.error?.code === "23505") {
    // Either a racing retry of this same food id, or another customer took the barcode a moment ago.
    const raced = await own();
    if (raced) return { ok: true, item: raced, created: false, barcodeKept: true };
    kept = false;
    res = await service.from("foods").insert({ ...base, barcode: null }).select(FOOD_COLS).single();
  }
  if (res.error) throw new Error(res.error.message);
  return { ok: true, item: foodToItem(res.data as unknown as Row), created: true, barcodeKept: kept };
}
