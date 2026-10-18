import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";
import { mealStatusBatchSchema, mealStatusSchema } from "@/lib/validations/schemas";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/data/tags";

/**
 * POST a single `{meal_plan_entry_id, status, portion_factor?}` or a batch `{changes: [...]}`.
 * A batch is validated and ownership-checked as a whole, then written with one upsert (and one
 * delete for the cleared entries), so a bad entry rejects everything.
 */
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

  let changes;
  try {
    const raw = await req.json();
    changes =
      raw && typeof raw === "object" && "changes" in raw
        ? mealStatusBatchSchema.parse(raw).changes
        : [mealStatusSchema.parse(raw)];
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Last change per entry wins.
  const byEntry = new Map(changes.map((c) => [c.meal_plan_entry_id, c]));
  const entryIds = [...byEntry.keys()];

  // Verify every entry belongs to the client.
  const { data: owned, error: ownedError } = await supabase
    .from("meal_plan_entries")
    .select("id, meal_plans!inner(client_id)")
    .in("id", entryIds)
    .eq("meal_plans.client_id", profile.client_id);
  if (ownedError) return NextResponse.json({ error: ownedError.message }, { status: 500 });
  if ((owned ?? []).length !== entryIds.length) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const toClear = changes.filter((c) => byEntry.get(c.meal_plan_entry_id) === c && c.status === null);
  const toSet = [...byEntry.values()].filter((c) => c.status !== null);

  if (toClear.length > 0) {
    const { error } = await supabase
      .from("meal_entry_status")
      .delete()
      .in("meal_plan_entry_id", toClear.map((c) => c.meal_plan_entry_id));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (toSet.length > 0) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("meal_entry_status").upsert(
      toSet.map((c) => ({
        meal_plan_entry_id: c.meal_plan_entry_id,
        client_id: profile.client_id,
        status: c.status,
        // Only an eaten meal can have a different amount; any other status resets it.
        portion_factor: c.status === "eaten" ? (c.portion_factor ?? null) : null,
        updated_at: now,
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag(CACHE_TAGS.mealEntryStatuses, "max");
  return NextResponse.json({ ok: true });
}
