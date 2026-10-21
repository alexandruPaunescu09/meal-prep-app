import { createHmac, timingSafeEqual } from "node:crypto";
import type { LabelDraft } from "@/lib/portal/label-map";

/**
 * Tamper-proofing for the label-photo draft (FD-5). `/foods/label` returns the draft the model read
 * plus an HMAC signature; `/foods/label/confirm` only inserts a draft whose signature verifies, so a
 * customer cannot edit nutrition between the two calls. The signature binds the draft to this
 * customer, this food id, the barcode and the photo paths, and expires after 30 minutes.
 * Server only (uses a server secret).
 */

export const LABEL_DRAFT_TTL_MS = 30 * 60 * 1000;

export interface SignedLabelPayload {
  food_id: string;
  client_id: string;
  barcode: string | null;
  label_photo_path: string;
  front_photo_path: string | null;
  draft: LabelDraft;
  /** Epoch milliseconds. */
  issued_at: number;
}

/** JSON with object keys sorted at every depth, so the signed string never depends on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function mac(payload: SignedLabelPayload, secret: string): Buffer {
  return createHmac("sha256", secret).update(`food-label-draft:v1:${canonicalJson(payload)}`).digest();
}

export function signLabelDraft(payload: SignedLabelPayload, secret: string): string {
  if (!secret) throw new Error("label signing secret is not configured");
  return mac(payload, secret).toString("hex");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "invalid" | "expired" };

export function verifyLabelDraft(
  payload: SignedLabelPayload,
  signature: string,
  secret: string,
  now: number = Date.now()
): VerifyResult {
  if (!secret || typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: "invalid" };
  const expected = mac(payload, secret);
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "invalid" };
  const age = now - payload.issued_at;
  if (!Number.isFinite(age) || age < -60_000 || age > LABEL_DRAFT_TTL_MS) return { ok: false, reason: "expired" };
  return { ok: true };
}

/**
 * The server secret (`LABEL_SIGNING_SECRET`, random, 32+ bytes). Empty string when unset: routes must
 * then fail closed with a 500. There is deliberately no fallback to another key.
 */
export function labelSigningSecret(env: Record<string, string | undefined> = process.env): string {
  return env.LABEL_SIGNING_SECRET?.trim() || "";
}
