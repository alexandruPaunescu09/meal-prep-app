import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { loadCatalogItem } from "@/lib/portal/catalog";
import { snapshotForCatalogItem } from "@/lib/calculations/diary";
import { diaryEntrySchema } from "@/lib/validations/schemas";
import { CACHE_TAGS } from "@/lib/data/tags";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  let body;
  try {
    body = diaryEntrySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Nutrition snapshot: always computed server-side, except for quick add (validated user values).
  let snapshot: Record<string, unknown>;
  let refs: { food_id: string | null; ingredient_id: string | null; recipe_id: string | null } = {
    food_id: null,
    ingredient_id: null,
    recipe_id: null,
  };

  if (body.source_kind === "quick") {
    snapshot = {
      name: body.name?.trim() || "Quick add",
      brand: null,
      calories: body.calories ?? 0,
      protein: body.protein ?? 0,
      carbs: body.carbs ?? 0,
      fat: body.fat ?? 0,
      fiber: 0,
      sugar: 0,
      sat_fat: 0,
      salt: 0,
      micronutrients: {},
    };
  } else {
    const itemId = (
      body.source_kind === "food"
        ? body.food_id
        : body.source_kind === "ingredient"
          ? body.ingredient_id
          : body.recipe_id
    ) as string;
    let item;
    try {
      item = await loadCatalogItem(createServiceClient(), auth.clientId, body.source_kind, itemId);
    } catch (e) {
      console.error("diary: catalog lookup failed", e);
      return NextResponse.json({ error: "could not load item" }, { status: 500 });
    }
    if (!item) return NextResponse.json({ error: "item not available" }, { status: 404 });
    try {
      snapshot = { ...snapshotForCatalogItem(item, body.quantity, body.quantity_unit) };
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "invalid quantity" },
        { status: 400 }
      );
    }
    refs = {
      food_id: body.food_id ?? null,
      ingredient_id: body.ingredient_id ?? null,
      recipe_id: body.recipe_id ?? null,
    };
  }

  // RLS client: policy "Customer manage own" rejects any row whose client_id is not theirs,
  // including an upsert onto another customer's id.
  const { data, error } = await auth.supabase
    .from("food_log_entries")
    .upsert(
      {
        id: body.id,
        client_id: auth.clientId,
        log_date: body.log_date,
        meal_type: body.meal_type,
        source_kind: body.source_kind,
        ...refs,
        quantity: body.quantity,
        quantity_unit: body.quantity_unit,
        ...snapshot,
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (error) {
    // 42501 = RLS violation (id belongs to someone else)
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  revalidateTag(CACHE_TAGS.foodLog, "max");
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("food_log_entries")
    .delete()
    .eq("id", id)
    .eq("client_id", auth.clientId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  revalidateTag(CACHE_TAGS.foodLog, "max");
  return NextResponse.json({ ok: true });
}
