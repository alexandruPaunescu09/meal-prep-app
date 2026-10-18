import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { BARCODE_RE, DAILY_NEW_FOOD_LIMIT, resolveBarcode, type BarcodeFailure } from "@/lib/portal/foods";

const MESSAGES: Record<BarcodeFailure, string> = {
  not_found: "We couldn't find this product.",
  incomplete_data: "We found this product, but its nutrition information is incomplete.",
  rate_limited: `You've added ${DAILY_NEW_FOOD_LIMIT} new products today. Try again tomorrow, or use Quick add.`,
};
const STATUS: Record<BarcodeFailure, number> = { not_found: 404, incomplete_data: 404, rate_limited: 429 };

export async function GET(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  const code = (req.nextUrl.searchParams.get("code") ?? "").trim();
  if (!BARCODE_RE.test(code)) {
    return NextResponse.json({ error: "Code must be 8-14 digits" }, { status: 400 });
  }

  try {
    // Service client AFTER the customer check: foods are written server-side, ingredients are read price-free.
    const result = await resolveBarcode(createServiceClient(), auth.clientId, code);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason, message: MESSAGES[result.reason] },
        { status: STATUS[result.reason] }
      );
    }
    return NextResponse.json({ item: result.item, source: result.source, created: result.created });
  } catch (e) {
    console.error("foods/barcode failed", e);
    return NextResponse.json(
      { error: "lookup_failed", message: "Couldn't look up this barcode. Check your connection and try again." },
      { status: 502 }
    );
  }
}
