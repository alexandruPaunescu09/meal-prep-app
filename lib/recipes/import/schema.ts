import { z } from "zod/v4";
import type { ModelLine } from "./postprocess";

/**
 * Structured output rejects schemas with more than 16 nullable/union parameters in total, and
 * this schema has many optional values per line (and the limit counts every array item). So it
 * contains NO nullable fields at all: a missing number is NO_NUMBER (-1), a missing string is
 * "", and the optional match confidence is the enum value "none". `toModelLine` maps these
 * sentinels back to null before anything else sees them.
 */
export const NO_NUMBER = -1;

export const ModelLineSchema = z.object({
  raw_text: z.string(),
  raw_name: z.string(),
  is_section_header: z.boolean(),
  optional: z.boolean(),
  ingredient_id: z.string(), // "" = no catalog match
  match_confidence: z.enum(["high", "medium", "low", "none"]),
  original_amount: z.number(), // -1 = none
  original_unit: z.string(), // "" = none
  quantity: z.number(), // -1 = unknown
  quantity_unit: z.enum(["g", "ml", "buc", "none"]), // "none" for headers / no amount (mapped to "g")
  conversion_note: z.string(), // "" = none
  is_estimate: z.boolean(),
  search_term: z.string(), // English, "" for headers
  suggested_unit: z.enum(["g", "ml", "buc", "none"]),
  suggested_category: z.string(), // category slug, "" = none
});

export const RecipeModelSchema = z.object({
  name: z.string(),
  portions: z.number(), // 0 = not stated
  steps: z.array(z.string()),
  lines: z.array(ModelLineSchema),
});

export type RecipeModelOutput = z.infer<typeof RecipeModelSchema>;
type RawLine = z.infer<typeof ModelLineSchema>;

const numOrNull = (n: number) => (Number.isFinite(n) && n !== NO_NUMBER && n >= 0 ? n : null);
const strOrNull = (s: string) => (s.trim() === "" ? null : s.trim());

export function toModelLine(l: RawLine): ModelLine {
  return {
    raw_text: l.raw_text,
    raw_name: l.raw_name,
    is_section_header: l.is_section_header,
    optional: l.optional,
    ingredient_id: strOrNull(l.ingredient_id),
    match_confidence: l.match_confidence === "none" ? null : l.match_confidence,
    original_amount: numOrNull(l.original_amount),
    original_unit: strOrNull(l.original_unit),
    quantity: numOrNull(l.quantity),
    quantity_unit: l.quantity_unit === "none" ? "g" : l.quantity_unit,
    conversion_note: strOrNull(l.conversion_note),
    is_estimate: l.is_estimate,
    search_term: l.search_term.trim(),
    suggested_unit: l.suggested_unit === "none" ? (l.quantity_unit === "none" ? "g" : l.quantity_unit) : l.suggested_unit,
    suggested_category: strOrNull(l.suggested_category),
  };
}
