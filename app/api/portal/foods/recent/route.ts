import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { loadCatalogItems } from "@/lib/portal/catalog";
import { addDays, todayInTz } from "@/lib/format";
import {
  attachUsable,
  dedupeRecents,
  RECENT_DAYS,
  type RecentLogRow,
} from "@/lib/portal/recents";

/**
 * The customer's recently logged catalog items (last 30 days), newest first, each with the last
 * amount. Log rows are read with the customer's RLS client; the items are resolved price-free
 * through the service client, dropping anything no longer usable.
 */
export async function GET(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const since = addDays(todayInTz(req.cookies.get("tz")?.value), -RECENT_DAYS);

  try {
    const { data, error } = await auth.supabase
      .from("food_log_entries")
      .select("log_date, updated_at, source_kind, food_id, ingredient_id, recipe_id, quantity, quantity_unit")
      .gte("log_date", since)
      .neq("source_kind", "quick")
      .order("log_date", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const candidates = dedupeRecents((data ?? []) as RecentLogRow[]);
    const usable = await loadCatalogItems(createServiceClient(), auth.clientId, candidates);
    return NextResponse.json({ results: attachUsable(candidates, usable) });
  } catch (e) {
    console.error("foods/recent failed", e);
    return NextResponse.json({ error: "could not load recents" }, { status: 500 });
  }
}
