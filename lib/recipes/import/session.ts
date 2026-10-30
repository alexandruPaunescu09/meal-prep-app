import { z } from "zod/v4";
import type { ReviewLine } from "./draft";

// Tab-local, owner-bound drafts only. No catalog prices or auth tokens are stored.
export const REVIEW_SESSION_VERSION = 1;
export const REVIEW_SESSION_MAX_CHARS = 512_000;
export const REVIEW_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const text = z.string().max(4000);
const unit = z.enum(["g", "ml", "buc"]);
const nullableNumber = z.number().finite().nullable();
const line = z.object({
  raw_text: text, raw_name: text, include: z.boolean(), is_section_header: z.boolean(),
  optional: z.boolean(), ingredient_id: z.string().uuid().nullable(),
  match_confidence: z.enum(["high", "medium", "low"]).nullable(),
  original_amount: nullableNumber, original_unit: text.nullable(), quantity: nullableNumber,
  quantity_unit: unit, conversion_note: text.nullable(), is_estimate: z.boolean(),
  search_term: text, suggested_unit: unit, suggested_category: text.nullable(), note: text.nullable(),
});
const snapshotSchema = z.object({
  draft: z.object({
    source: z.object({
      kind: z.enum(["url", "text", "images"]), url: text.optional(), siteName: text.nullable().optional(),
      via: z.object({ kind: z.enum(["youtube", "tiktok"]), videoUrl: text }).optional(),
    }),
    recipe: z.object({
      name: text, portions: nullableNumber, steps: z.array(text).max(40),
      nutrition: z.record(z.string().max(100), text).nullable().refine((n) => !n || Object.keys(n).length <= 100),
      total_time_minutes: nullableNumber,
    }),
    lines: z.array(line).max(300),
    duplicateOf: z.object({ id: z.string().uuid(), name: text }).nullable(),
  }),
  model: z.string().max(200),
  lines: z.array(z.object({
    uid: z.number().int().min(0).max(299), base: line, include: z.boolean(),
    ingredient_id: z.string().uuid().nullable(), qty: z.string().max(100),
    qtyUnit: unit, matchedUnit: unit.optional(),
  })).max(300).refine((ls) => new Set(ls.map((l) => l.uid)).size === ls.length),
  name: text, portionsStr: z.string().max(100), containerTypeId: z.string().uuid().nullable(),
  sourceUrl: text, steps: z.array(z.object({ id: z.string().max(100), text })).max(40),
  description: z.string().max(20_000),
  notes: z.string().max(20_000).default(""),
});
export type ReviewSnapshot = Omit<z.infer<typeof snapshotSchema>, "lines"> & { lines: ReviewLine[] };
const envelopeSchema = z.object({
  version: z.literal(REVIEW_SESSION_VERSION), ownerId: z.string().uuid(),
  savedAt: z.number().finite(), snapshot: snapshotSchema,
});

export function reviewSessionKey(ownerId: string): string {
  return "recipe-import:review:v1:" + ownerId;
}

export function serializeReview(ownerId: string, snapshot: ReviewSnapshot, now = Date.now()): string | null {
  const result = envelopeSchema.safeParse({ version: REVIEW_SESSION_VERSION, ownerId, savedAt: now, snapshot });
  if (!result.success) return null;
  const raw = JSON.stringify(result.data);
  return raw.length <= REVIEW_SESSION_MAX_CHARS ? raw : null;
}

export function restoreReview(raw: string | null, ownerId: string, now = Date.now()): ReviewSnapshot | null {
  if (!raw || raw.length > REVIEW_SESSION_MAX_CHARS) return null;
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.ownerId !== ownerId) return null;
    const age = now - parsed.data.savedAt;
    return age >= 0 && age <= REVIEW_SESSION_MAX_AGE_MS ? parsed.data.snapshot : null;
  } catch {
    return null;
  }
}
