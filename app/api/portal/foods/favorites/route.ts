import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { loadCatalogItem, loadCatalogItems } from "@/lib/portal/catalog";
import { favoriteTargetSchema } from "@/lib/validations/schemas";
import { refKey, type CatalogRef } from "@/lib/portal/recents";
import type { FoodFavorite } from "@/lib/supabase/types";

type FavoriteRow = Pick<FoodFavorite, "food_id" | "ingredient_id" | "recipe_id">;

const refOf = (r: FavoriteRow): CatalogRef | null =>
  r.food_id
    ? { kind: "food", id: r.food_id }
    : r.ingredient_id
      ? { kind: "ingredient", id: r.ingredient_id }
      : r.recipe_id
        ? { kind: "recipe", id: r.recipe_id }
        : null;

const column = { food: "food_id", ingredient: "ingredient_id", recipe: "recipe_id" } as const;

/**
 * GET: the customer's favorites, newest first. `results` are the items still usable (price-free);
 * `keys` lists every starred target (`kind:id`), including ones that are no longer usable.
 */
export async function GET() {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  try {
    const { data, error } = await auth.supabase
      .from("food_favorites")
      .select("food_id, ingredient_id, recipe_id")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const refs = ((data ?? []) as FavoriteRow[]).map(refOf).filter((r): r is CatalogRef => r !== null);
    const usable = await loadCatalogItems(createServiceClient(), auth.clientId, refs);
    return NextResponse.json({
      results: refs.flatMap((r) => usable.get(refKey(r)) ?? []),
      keys: refs.map(refKey),
    });
  } catch (e) {
    console.error("foods/favorites GET failed", e);
    return NextResponse.json({ error: "could not load favorites" }, { status: 500 });
  }
}

/** POST { kind, id }: star an item. Already starred counts as success. */
export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const parsed = favoriteTargetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { kind, id } = parsed.data;

  try {
    const item = await loadCatalogItem(createServiceClient(), auth.clientId, kind, id);
    if (!item) return NextResponse.json({ error: "item not available" }, { status: 404 });
  } catch (e) {
    console.error("foods/favorites: catalog lookup failed", e);
    return NextResponse.json({ error: "could not load item" }, { status: 500 });
  }

  // RLS client: the policy only lets a customer write rows for their own client_id.
  const { error } = await auth.supabase
    .from("food_favorites")
    .insert({ client_id: auth.clientId, [column[kind]]: id });
  // 23505 = the partial unique index: already a favorite.
  if (error && error.code !== "23505") {
    console.error("foods/favorites POST failed", error);
    return NextResponse.json({ error: "could not save favorite" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE ?kind=&id=: unstar an item. Not starred counts as success. */
export async function DELETE(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const parsed = favoriteTargetSchema.safeParse({
    kind: req.nextUrl.searchParams.get("kind"),
    id: req.nextUrl.searchParams.get("id"),
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid query" }, { status: 400 });
  const { kind, id } = parsed.data;

  const { error } = await auth.supabase
    .from("food_favorites")
    .delete()
    .eq("client_id", auth.clientId)
    .eq(column[kind], id);
  if (error) {
    console.error("foods/favorites DELETE failed", error);
    return NextResponse.json({ error: "could not remove favorite" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
