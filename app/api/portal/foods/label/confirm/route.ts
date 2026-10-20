import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { labelConfirmSchema } from "@/lib/validations/schemas";
import { DAILY_NEW_FOOD_LIMIT, normalizeBarcode } from "@/lib/portal/foods";
import { createLabelFood, photoPathsValid } from "@/lib/portal/label-food";
import { labelSigningSecret, verifyLabelDraft, type SignedLabelPayload } from "@/lib/portal/label-sign";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * POST { food_id, barcode?, label_photo_path, front_photo_path?, draft, issued_at, signature }.
 * The draft is NOT trusted: it must carry the HMAC the parse route issued for this customer, food and
 * photos (under 30 minutes old). Inserts a pending, creator-only `foods` row and returns its CatalogItem.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }
  const { clientId } = auth;

  const parsedBody = labelConfirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) return json({ error: "bad_request", message: "Invalid request." }, 400);
  const body = parsedBody.data;
  const frontPath = body.front_photo_path ?? null;
  if (!photoPathsValid(clientId, body.food_id, body.label_photo_path, frontPath)) {
    return json({ error: "bad_paths", message: "Invalid photo reference." }, 400);
  }

  const secret = labelSigningSecret();
  if (!secret) {
    console.error("LABEL_SIGNING_SECRET is not set; label reading is disabled");
    return json({ error: "not_configured", message: "Label reading isn't configured." }, 500);
  }

  const payload: SignedLabelPayload = {
    food_id: body.food_id,
    client_id: clientId,
    barcode: body.barcode ? (normalizeBarcode(body.barcode)?.canonical ?? null) : null,
    label_photo_path: body.label_photo_path,
    front_photo_path: frontPath,
    draft: body.draft,
    issued_at: body.issued_at,
  };
  const verdict = verifyLabelDraft(payload, body.signature, secret);
  if (!verdict.ok) {
    return verdict.reason === "expired"
      ? json({ error: "expired", message: "This took too long. Retake the photo to read it again." }, 410)
      : json({ error: "invalid_signature", message: "We couldn't verify these values. Retake the photo." }, 400);
  }

  try {
    const result = await createLabelFood(createServiceClient(), {
      clientId,
      foodId: body.food_id,
      barcode: payload.barcode,
      labelPath: body.label_photo_path,
      frontPath,
      draft: body.draft,
    });
    if (!result.ok) {
      return json(
        { error: "food_limit", message: `You've added ${DAILY_NEW_FOOD_LIMIT} new products today. Try again tomorrow, or use Quick add.` },
        429
      );
    }
    return json({ item: result.item, created: result.created, barcodeKept: result.barcodeKept });
  } catch (e) {
    console.error("foods/label/confirm failed", e);
    return json({ error: "server_error", message: "Couldn't save this product. Try again." }, 500);
  }
}
