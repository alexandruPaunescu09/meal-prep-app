import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";
import { mealStatusSchema } from "@/lib/validations/schemas";
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
    body = mealStatusSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Verify entry belongs to client.
  const { data: entry } = await supabase
    .from("meal_plan_entries")
    .select("id, meal_plans!inner(client_id)")
    .eq("id", body.meal_plan_entry_id)
    .maybeSingle<{ id: string; meal_plans: { client_id: string } }>();

  if (!entry || entry.meal_plans.client_id !== profile.client_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (body.status === null) {
    const { error } = await supabase
      .from("meal_entry_status")
      .delete()
      .eq("meal_plan_entry_id", body.meal_plan_entry_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidateTag(CACHE_TAGS.mealEntryStatuses, "max");
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase.from("meal_entry_status").upsert({
    meal_plan_entry_id: body.meal_plan_entry_id,
    client_id: profile.client_id,
    status: body.status,
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag(CACHE_TAGS.mealEntryStatuses, "max");
  return NextResponse.json({ ok: true });
}
