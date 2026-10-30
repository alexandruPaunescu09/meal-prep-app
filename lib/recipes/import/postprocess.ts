import type { RecipeImportLine, RecipeMatchConfidence, RecipeUnit } from "./types";
import { RECIPE_ALIAS_STORE } from "./types";

/** What the model returns per line, after sentinel mapping (see map.ts). */
export interface ModelLine {
  raw_text: string;
  raw_name: string;
  is_section_header: boolean;
  optional: boolean;
  ingredient_id: string | null;
  match_confidence: RecipeMatchConfidence | null;
  original_amount: number | null;
  original_unit: string | null;
  quantity: number | null;
  quantity_unit: RecipeUnit;
  conversion_note: string | null;
  is_estimate: boolean;
  search_term: string;
  suggested_unit: RecipeUnit;
  suggested_category: string | null;
}

export interface CatalogIngredient {
  id: string;
  name: string;
  unit: string;
}
export interface CatalogAlias {
  ingredient_id: string;
  store: string;
  alias: string;
}

const RANGE_RE = /\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?/;
const TO_TASTE_RE = /\b(?:dup[aă]\s+gust|la\s+gust|to\s+taste|as\s+needed)\b/i;

const norm = (s: string) => s.trim().toLowerCase();
const addNote = (note: string | null, extra: string) => (note ? `${note}; ${extra}` : extra);

/** Case-insensitive recipe-name duplicate lookup (RI-3 adds the source-link check). */
export function findDuplicateByName<T extends { id: string; name: string }>(
  name: string,
  recipes: T[],
): { id: string; name: string } | null {
  const key = norm(name);
  if (!key) return null;
  const hit = recipes.find((r) => norm(r.name) === key);
  return hit ? { id: hit.id, name: hit.name } : null;
}

/**
 * Pure post-processing of the model's lines against the catalog and stored `recipe` aliases.
 * `headerTexts` are lines the extractor already flagged as section headers (matched by raw_text).
 */
export function postProcessRecipeLines(
  lines: ModelLine[],
  ingredients: CatalogIngredient[],
  aliases: CatalogAlias[],
  categorySlugs: string[],
  headerTexts: string[] = [],
): RecipeImportLine[] {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const aliasMap = new Map<string, string>();
  for (const a of aliases) {
    if (norm(a.store) === RECIPE_ALIAS_STORE) aliasMap.set(norm(a.alias), a.ingredient_id);
  }
  const headers = new Set(headerTexts.map(norm));
  const slugs = new Set(categorySlugs);

  return lines.map((l) => {
    let ingredientId = l.ingredient_id;
    let confidence = l.match_confidence;
    let note: string | null = null;
    let conversionNote = l.conversion_note;

    // Never trust ids that are not in the catalog.
    if (ingredientId && !byId.has(ingredientId)) {
      ingredientId = null;
      confidence = null;
    }
    // Exact alias hit overrides the model.
    const aliasId = aliasMap.get(norm(l.raw_name));
    if (aliasId && byId.has(aliasId)) {
      ingredientId = aliasId;
      confidence = "high";
    }
    // The quantity must be in the matched ingredient's unit.
    let suggestedUnit = l.suggested_unit;
    if (ingredientId) {
      const ing = byId.get(ingredientId)!;
      if (l.quantity_unit !== ing.unit) {
        note = addNote(note, `Unit mismatch: amount is in ${l.quantity_unit}, ingredient is in ${ing.unit}`);
        ingredientId = null;
        confidence = null;
        suggestedUnit = l.quantity_unit;
      }
    }
    if (!ingredientId) confidence = null;

    const isHeader = l.is_section_header || headers.has(norm(l.raw_text));
    const optional = !isHeader && (l.optional || TO_TASTE_RE.test(l.raw_text));
    // Ranges ("4-5 linguri") are a midpoint guess.
    const isEstimate = l.is_estimate || (!isHeader && RANGE_RE.test(l.raw_text));
    if (isEstimate && !l.is_estimate) conversionNote = conversionNote || "Range in the source: midpoint used";

    let quantity = l.quantity != null && Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : null;
    if (quantity != null) quantity = Math.round(quantity * 100) / 100;
    if (quantity == null && !isHeader && !optional) note = addNote(note, "No usable amount");

    return {
      raw_text: l.raw_text,
      raw_name: l.raw_name,
      include: !isHeader && !optional,
      is_section_header: isHeader,
      optional,
      ingredient_id: isHeader ? null : ingredientId,
      match_confidence: isHeader ? null : confidence,
      original_amount: l.original_amount,
      original_unit: l.original_unit,
      quantity: isHeader ? null : quantity,
      quantity_unit: l.quantity_unit,
      conversion_note: conversionNote,
      is_estimate: isEstimate,
      search_term: l.search_term,
      suggested_unit: suggestedUnit,
      suggested_category: l.suggested_category && slugs.has(l.suggested_category) ? l.suggested_category : null,
      note,
    };
  });
}
