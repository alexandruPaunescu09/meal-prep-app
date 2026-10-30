// Pure review-screen logic for the recipe import (client + server safe, unit tested).
import { parseDecimal } from "@/lib/format";
import { normalizeSteps, normalizeSourceUrl } from "@/lib/recipes/steps";
import type { SaveImportedRecipeAlias, SaveRecipeInput, SaveRecipeIngredientInput } from "@/lib/supabase/types";
import type { RecipeImportLine } from "./types";

/** One editable line of the review screen. `base` is what the parse route returned. */
export interface ReviewLine {
  uid: number;
  base: RecipeImportLine;
  include: boolean;
  ingredient_id: string | null;
  /** Raw text of the quantity input (decimal comma allowed). */
  qty: string;
  /** The unit `qty` is currently expressed in; differs from the ingredient's unit after a re-pick. */
  qtyUnit: string;
}

export interface DraftIngredient {
  id: string;
  name: string;
  unit: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Quantity text shown in the input: "4,5" (decimal comma), "" when unknown. */
export function qtyToText(q: number | null | undefined): string {
  return q == null || !Number.isFinite(q) ? "" : String(q).replace(".", ",");
}

export function initReviewLines(lines: RecipeImportLine[]): ReviewLine[] {
  return lines.map((l, i) => ({
    uid: i,
    base: l,
    include: l.include && !l.is_section_header,
    ingredient_id: l.is_section_header ? null : l.ingredient_id,
    qty: qtyToText(l.quantity),
    qtyUnit: l.quantity_unit,
  }));
}

/** Parsed quantity when it is a number > 0, else null. */
export function lineQuantity(l: Pick<ReviewLine, "qty">): number | null {
  const n = parseDecimal(l.qty);
  return n != null && n > 0 ? n : null;
}

/** Why an included line blocks Approve, or null when it is fine. */
export function lineProblem(l: ReviewLine): string | null {
  if (l.base.is_section_header || !l.include) return null;
  if (!l.ingredient_id) return "Pick an ingredient or skip this line";
  if (lineQuantity(l) == null) return "Enter an amount greater than 0";
  return null;
}

export function includedLines(lines: ReviewLine[]): ReviewLine[] {
  return lines.filter((l) => !l.base.is_section_header && l.include);
}

/** Approve needs a name, at least one included line, and every included line matched with a quantity > 0. */
export function canApprove(lines: ReviewLine[], name: string): boolean {
  if (!name.trim()) return false;
  const inc = includedLines(lines);
  return inc.length > 0 && inc.every((l) => lineProblem(l) === null);
}

/** Number of included lines blocking Approve. */
export function blockingCount(lines: ReviewLine[]): number {
  return includedLines(lines).filter((l) => lineProblem(l) !== null).length;
}

export interface DraftRecipeFields {
  name: string;
  portions: number;
  containerTypeId: string | null;
  sourceUrl: string;
  steps: string[];
  customerDescription: string;
}

export interface SavePayload {
  recipe: SaveRecipeInput;
  ingredients: SaveRecipeIngredientInput[];
  aliases: SaveImportedRecipeAlias[];
  /** Ingredient ids that appeared on several lines (their quantities were added up). */
  mergedIngredientIds: string[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Review screen -> `save_imported_recipe` arguments. Skipped, optional-unticked and header lines
 * are excluded; two lines on the same ingredient are summed; one alias per matched line whose
 * raw name differs from the ingredient's name (first line wins per alias text).
 */
export function buildSavePayload(
  fields: DraftRecipeFields,
  lines: ReviewLine[],
  ingredients: DraftIngredient[],
): SavePayload {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  const aliases = new Map<string, SaveImportedRecipeAlias>();

  for (const l of includedLines(lines)) {
    const ing = l.ingredient_id ? byId.get(l.ingredient_id) : undefined;
    const qty = lineQuantity(l);
    if (!ing || qty == null) continue;
    sums.set(ing.id, (sums.get(ing.id) ?? 0) + qty);
    counts.set(ing.id, (counts.get(ing.id) ?? 0) + 1);
    const raw = l.base.raw_name.trim();
    if (raw && norm(raw) !== norm(ing.name) && !aliases.has(norm(raw))) {
      aliases.set(norm(raw), { alias: raw, ingredient_id: ing.id });
    }
  }

  const description = fields.customerDescription.trim();
  return {
    recipe: {
      name: fields.name.trim(),
      portions: Math.max(1, Math.round(fields.portions) || 1),
      final_weight: null,
      notes: null,
      customer_description: description === "" ? null : description,
      container_type_id: fields.containerTypeId,
      source_url: normalizeSourceUrl(fields.sourceUrl),
      instructions: normalizeSteps(fields.steps),
    },
    ingredients: [...sums].map(([ingredient_id, quantity]) => ({ ingredient_id, quantity: round3(quantity) })),
    aliases: [...aliases.values()],
    mergedIngredientIds: [...counts].filter(([, n]) => n > 1).map(([id]) => id),
  };
}

/** Human note for the merged-duplicates case, or null. */
export function mergeNote(mergedIngredientIds: string[], ingredients: DraftIngredient[]): string | null {
  if (mergedIngredientIds.length === 0) return null;
  const byId = new Map(ingredients.map((i) => [i.id, i.name]));
  const names = mergedIngredientIds.map((id) => byId.get(id) ?? "an ingredient");
  return `Several lines use ${names.join(", ")}: their amounts were added up.`;
}

/** Calories from a site nutrition map ("320 kcal", "61 calories"); null if none. */
export function siteCalories(nutrition: Record<string, string> | null | undefined): number | null {
  const raw = nutrition?.calories ?? nutrition?.kcal ?? null;
  if (!raw) return null;
  const m = /(\d+(?:[.,]\d+)?)/.exec(raw);
  return m ? Number(m[1].replace(",", ".")) : null;
}
