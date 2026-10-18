import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";
import { reviewSchema } from "@/lib/validations/schemas";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/data/tags";

export async function POST(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "customer" || !profile.client_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = reviewSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Verify the entry belongs to one of this client's plans (RLS will also enforce read).
  const { data: entry } = await supabase
    .from("meal_plan_entries")
    .select("id, recipe_id, meal_plan_id, meal_plans!inner(client_id)")
    .eq("id", body.meal_plan_entry_id)
    .maybeSingle<{ id: string; recipe_id: string | null; meal_plans: { client_id: string } }>();

  if (!entry || entry.meal_plans.client_id !== profile.client_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Upsert review by meal_plan_entry_id (unique).
  const upsertPayload = {
    meal_plan_entry_id: body.meal_plan_entry_id,
    client_id: profile.client_id,
    recipe_id: entry.recipe_id,
    rating: body.rating,
    comment: body.comment ?? null,
    photo_path: body.photo_path ?? null,
    admin_read_at: null, // any new write resets unread state
  };

  const { data: saved, error } = await supabase
    .from("meal_reviews")
    .upsert(upsertPayload, { onConflict: "meal_plan_entry_id" })
    .select("*")
    .single();

  if (error || !saved) {
    return NextResponse.json({ error: error?.message ?? "save failed" }, { status: 500 });
  }

  // Replace tag links.
  if (body.tag_ids !== undefined) {
    await supabase.from("meal_review_tags").delete().eq("review_id", saved.id);
    if (body.tag_ids.length > 0) {
      const rows = body.tag_ids.map((tag_id) => ({ review_id: saved.id, tag_id }));
      await supabase.from("meal_review_tags").insert(rows);
    }
  }

  // Mark admin-side review caches as stale so the inbox + unread-count badge
  // pick up the new review on the next admin navigation. `profile: "max"`
  // gives stale-while-revalidate (the badge updates within seconds).
  revalidateTag(CACHE_TAGS.mealReviews, "max");

  return NextResponse.json({ id: saved.id, client_id: saved.client_id });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "customer" || !profile.client_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let id = req.nextUrl.searchParams.get("id");
  if (!id) {
    try {
      const b = await req.json();
      if (typeof b?.id === "string") id = b.id;
    } catch {
      /* no body */
    }
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  // RLS limits this to the customer's own reviews.
  const { data: review } = await supabase
    .from("meal_reviews")
    .select("id, client_id, photo_path")
    .eq("id", id)
    .eq("client_id", profile.client_id)
    .maybeSingle<{ id: string; client_id: string; photo_path: string | null }>();
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Remove the photo first so we never orphan a file once the row is gone.
  if (review.photo_path && review.photo_path.startsWith(`${profile.client_id}/`)) {
    const { error: rmError } = await supabase.storage
      .from("meal-review-photos")
      .remove([review.photo_path]);
    if (rmError) {
      return NextResponse.json({ error: `photo removal failed: ${rmError.message}` }, { status: 500 });
    }
  }

  // meal_review_tags rows cascade.
  const { error } = await supabase.from("meal_reviews").delete().eq("id", review.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag(CACHE_TAGS.mealReviews, "max");
  return NextResponse.json({ ok: true });
}
