import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { BARCODE_RE, DAILY_NEW_FOOD_LIMIT, resolveBarcode, type BarcodeFailure } from "@/lib/portal/foods";

const MESSAGES: Record<BarcodeFailure, string> = {
  not_found: "We couldn't find this product.",
  incomplete_data: "We found this product, but its nutrition information is incomplete.",
  rate_limited: `You've added ${DAILY_NEW_FOOD_LIMIT} new products today. Try again tomorrow, or use Quick add.`,
  too_many_lookups: "You're scanning very fast. Wait a few minutes, or use Quick add.",
};
const STATUS: Record<BarcodeFailure, number> = {
  not_found: 404,
  incomplete_data: 404,
  rate_limited: 429,
  too_many_lookups: 429,
};

// This GET can create a catalog row, so it is never cached. It stays a GET on purpose: the effect is
// idempotent (the same barcode always resolves to the same single food), and the client treats it as a lookup.
const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }

  const code = (req.nextUrl.searchParams.get("code") ?? "").trim();
  if (!BARCODE_RE.test(code)) return json({ error: "Code must be 8-14 digits" }, 400);

  try {
    // Service client AFTER the customer check: foods are written server-side, ingredients are read price-free.
    const result = await resolveBarcode(createServiceClient(), auth.clientId, code);
    if (!result.ok) {
      return json({ error: result.reason, message: MESSAGES[result.reason] }, STATUS[result.reason]);
    }
    return json({ item: result.item, source: result.source, created: result.created });
  } catch (e) {
    // Includes Open Food Facts being down or rate limiting us: the client offers Retry, not "not found".
    console.error("foods/barcode failed", e);
    return json(
      { error: "lookup_failed", message: "Couldn't look up this barcode. Check your connection and try again." },
      502
    );
  }
}
