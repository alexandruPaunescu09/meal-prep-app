// Shared (client + server safe) types for the recipe import parse response.
export type RecipeUnit = "g" | "ml" | "buc";
export type RecipeMatchConfidence = "high" | "medium" | "low";

/** Alias store value used for ingredient names remembered from recipe imports. */
export const RECIPE_ALIAS_STORE = "recipe";

/** One ingredient line of the draft, after postprocessing. */
export interface RecipeImportLine {
  raw_text: string;
  raw_name: string;
  /** Pre-ticked for the review screen: false for section headers and "to taste" lines. */
  include: boolean;
  is_section_header: boolean;
  /** "To taste" / pinch-type line without a real amount. */
  optional: boolean;
  /** Catalog ingredient id (always exists in the catalog) or null when unmatched. */
  ingredient_id: string | null;
  match_confidence: RecipeMatchConfidence | null;
  original_amount: number | null;
  original_unit: string | null;
  /** In `quantity_unit` (the matched ingredient's unit when matched). null when missing/invalid. */
  quantity: number | null;
  quantity_unit: RecipeUnit;
  conversion_note: string | null;
  is_estimate: boolean;
  /** English nutrition search term for creating a missing ingredient. */
  search_term: string;
  suggested_unit: RecipeUnit;
  /** An existing `ingredient_categories.slug`, or null. */
  suggested_category: string | null;
  note: string | null;
}

export interface RecipeImportRecipe {
  name: string;
  portions: number | null;
  /** Concise, own-words steps in the source language (max 40). */
  steps: string[];
  /** The site's nutrition strings, passed through untouched when the input had them. */
  nutrition: Record<string, string> | null;
  total_time_minutes: number | null;
}

export interface RecipeImportSource {
  kind: "url" | "text" | "images";
  url?: string;
  siteName?: string | null;
}

export interface RecipeImportDraft {
  source: RecipeImportSource;
  recipe: RecipeImportRecipe;
  lines: RecipeImportLine[];
  /** An existing recipe with the same name (case-insensitive), read-only. */
  duplicateOf: { id: string; name: string } | null;
}

export interface RecipeImportResponse {
  draft: RecipeImportDraft;
  model: string;
}
