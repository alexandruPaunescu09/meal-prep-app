import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { searchCatalog } from "@/lib/portal/catalog";

export async function GET(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "q must be at least 2 characters" }, { status: 400 });
  }
  if (q.length > 100) {
    return NextResponse.json({ error: "q is too long" }, { status: 400 });
  }
  const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 25) : 20;

  try {
    // Service client AFTER the customer check: customers have no direct read on ingredients/recipes.
    const results = await searchCatalog(createServiceClient(), auth.clientId, q, limit);
    return NextResponse.json({ results });
  } catch (e) {
    console.error("foods/search failed", e);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
