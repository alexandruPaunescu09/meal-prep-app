import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { labelParseSchema } from "@/lib/validations/schemas";
import { DAILY_NEW_FOOD_LIMIT, canCreateFood, createdInLast24h, normalizeBarcode } from "@/lib/portal/foods";
import { LABEL_PARSES_PER_DAY, photoPathsValid, reserveLabelParse } from "@/lib/portal/label-food";
import { DEFAULT_LABEL_MODEL, LabelParseError, parseLabelPhotos, type LabelImage } from "@/lib/portal/label-parse";
import { mapLabel } from "@/lib/portal/label-map";
import { labelSigningSecret, signLabelDraft, type SignedLabelPayload } from "@/lib/portal/label-sign";

// Reading a label takes the model several seconds; allow headroom for two images.
export const maxDuration = 90;

const BUCKET = "food-label-photos";
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function download(service: SupabaseClient, path: string): Promise<LabelImage | null> {
  const { data, error } = await service.storage.from(BUCKET).download(path);
  if (error || !data || data.size === 0 || data.size > MAX_PHOTO_BYTES) return null;
  return { mediaType: "image/jpeg", base64: Buffer.from(await data.arrayBuffer()).toString("base64") };
}

/**
 * POST { food_id, barcode?, label_photo_path, front_photo_path? } -> reads the uploaded label with Claude
 * and returns a DRAFT (per-100 values) plus an HMAC signature. Nothing is written to `foods`; the
 * confirm route inserts the food only for a draft whose signature verifies.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) {
    auth.response.headers.set("Cache-Control", "no-store");
    return auth.response;
  }
  const { clientId } = auth;

  const parsedBody = labelParseSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) return json({ error: "bad_request", message: "Invalid request." }, 400);
  const body = parsedBody.data;
  const frontPath = body.front_photo_path ?? null;
  // Photos must be exactly where this customer's upload step puts them: no one else's folder, no other bucket keys.
  if (!photoPathsValid(clientId, body.food_id, body.label_photo_path, frontPath)) {
    return json({ error: "bad_paths", message: "Invalid photo reference." }, 400);
  }
  const secret = labelSigningSecret();
  if (!secret) {
    console.error("LABEL_SIGNING_SECRET is not set; label reading is disabled");
    return json({ error: "not_configured", message: "Label reading isn't configured." }, 500);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "unavailable", message: "Label reading isn't available right now. Use Quick add instead." }, 503);
  }
  const barcode = body.barcode ? (normalizeBarcode(body.barcode)?.canonical ?? null) : null;

  const service = createServiceClient();
  try {
    if (!canCreateFood(await createdInLast24h(service, clientId))) {
      return json(
        { error: "food_limit", message: `You've added ${DAILY_NEW_FOOD_LIMIT} new products today. Try again tomorrow, or use Quick add.` },
        429
      );
    }

    const model = process.env.LABEL_PARSER_MODEL || DEFAULT_LABEL_MODEL;
    // Reserve the attempt BEFORE the model call, atomically against the daily limit; the outcome is set after.
    const attemptId = await reserveLabelParse(service, clientId, model);
    if (!attemptId) {
      return json(
        { error: "rate_limited", message: `You've read ${LABEL_PARSES_PER_DAY} labels today. Try again tomorrow, or use Quick add.` },
        429
      );
    }
    const setOutcome = async (outcome: "ok" | "unreadable" | "error") => {
      await service.from("food_label_parses").update({ outcome }).eq("id", attemptId);
    };

    try {
      const [label, front] = await Promise.all([
        download(service, body.label_photo_path),
        frontPath ? download(service, frontPath) : Promise.resolve(null),
      ]);
      if (!label) {
        await setOutcome("error");
        return json({ error: "photo_missing", message: "We couldn't find the uploaded photo. Retake it and try again." }, 400);
      }

      const { raw } = await parseLabelPhotos({ label, front });
      const mapped = mapLabel(raw);
      if (!mapped.ok) {
        await setOutcome("unreadable");
        return json({ error: "unreadable", message: mapped.message }, 422);
      }
      await setOutcome("ok");

      const payload: SignedLabelPayload = {
        food_id: body.food_id,
        client_id: clientId,
        barcode,
        label_photo_path: body.label_photo_path,
        front_photo_path: frontPath,
        draft: mapped.draft,
        issued_at: Date.now(),
      };
      return json({ draft: mapped.draft, issued_at: payload.issued_at, signature: signLabelDraft(payload, secret) });
    } catch (e) {
      await setOutcome("error");
      if (e instanceof LabelParseError) {
        const busy = e.status === 429 || e.status === 504;
        return json(
          {
            error: "parse_failed",
            message:
              e.message === "refused"
                ? "We couldn't read this photo. Retake it, straight-on and well lit."
                : busy
                  ? "Reading labels is busy right now. Try again in a minute."
                  : "We couldn't read this label right now. Try again, or use Quick add.",
          },
          busy ? 503 : 502
        );
      }
      throw e;
    }
  } catch (e) {
    console.error("foods/label failed", e);
    return json({ error: "server_error", message: "Something went wrong reading the label. Try again." }, 500);
  }
}
