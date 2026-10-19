import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import type { Food } from "@/lib/supabase/types";

/**
 * Customers create foods through portal routes (barcode scan, label photo) that do not call the
 * admin invalidation actions, so these reads use a short TTL: a new pending food shows up in the
 * sidebar badge and queue within a minute. Admin mutations expire the tag immediately.
 */
const REVALIDATE = 60;
const PAGE = 1000;

export interface AdminFood extends Food {
  creator_name: string | null;
  /** food_log_entries rows that reference this food. */
  usage_count: number;
}

export interface AdminFoodsBundle {
  foods: AdminFood[];
  clients: { id: string; name: string }[];
}

/** Pending foods awaiting review: sidebar badge + dashboard "needs attention". */
export const getPendingFoodCount = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("foods")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return count ?? 0;
  },
  ["pending-food-count"],
  { tags: [CACHE_TAGS.foods], revalidate: REVALIDATE }
);

/** Every page of a query (PostgREST caps a response at 1000 rows). */
async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** All foods (any status) with creator name and diary usage count, newest first. */
export const getAdminFoods = unstable_cache(
  async (): Promise<AdminFoodsBundle> => {
    const supabase = createServiceClient();
    const [foods, usage, clientsRes] = await Promise.all([
      selectAll<Food>((a, b) =>
        supabase.from("foods").select("*").order("created_at", { ascending: false }).order("id").range(a, b)
      ),
      selectAll<{ id: string; food_id: string }>((a, b) =>
        supabase.from("food_log_entries").select("id, food_id").not("food_id", "is", null).order("id").range(a, b)
      ),
      supabase.from("clients").select("id, name").order("name"),
    ]);
    if (clientsRes.error) throw new Error(clientsRes.error.message);
    const clients = (clientsRes.data ?? []) as { id: string; name: string }[];

    const counts = new Map<string, number>();
    for (const u of usage) counts.set(u.food_id, (counts.get(u.food_id) ?? 0) + 1);
    const names = new Map(clients.map((c) => [c.id, c.name]));

    return {
      foods: foods.map((f) => ({
        ...f,
        creator_name: f.created_by_client_id ? (names.get(f.created_by_client_id) ?? null) : null,
        usage_count: counts.get(f.id) ?? 0,
      })),
      clients,
    };
  },
  ["admin-foods"],
  { tags: [CACHE_TAGS.foods, CACHE_TAGS.foodLog, CACHE_TAGS.clients], revalidate: REVALIDATE }
);
