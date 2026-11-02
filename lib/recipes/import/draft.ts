// Pure review-screen logic for the recipe import (client + server safe, unit tested).
import { parseDecimal } from "@/lib/format";
import { normalizeSteps, normalizeSourceUrl } from "@/lib/recipes/steps";
import type { SaveImportedRecipeAlias, SaveRecipeInput, SaveRecipeIngredientInput } from "@/lib/supabase/types";
import type { LineRole } from "@/lib/recipes/seasonings";
import type { RecipeImportLine } from "./types";

/** One editable line of the review screen. `base` is what the parse route returned. */
export interface ReviewLine {
  uid: number;
  base: RecipeImportLine;
  include: boolean;
  /** Section of the saved recipe (the admin can move a line between the two lists). */
  role: LineRole;
  /** Seasoning without an amount ("to taste"); only valid together with role 'seasoning'. */
  toTaste: boolean;
  ingredient_id: string | null;
  /** Raw text of the quantity input (decimal comma allowed). */
  qty: string;
  /** The unit `qty` is currently expressed in; differs from the ingredient's unit after a re-pick. */
  qtyUnit: string;
  /** Unit of the selected ingredient; retained so consumers without a catalog can validate. */
  matchedUnit?: string;
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
    role: l.role,
    toTaste: l.to_taste && l.role === "seasoning",
    ingredient_id: l.is_section_header ? null : l.ingredient_id,
    qty: qtyToText(l.quantity),
    qtyUnit: l.quantity_unit,
    matchedUnit: l.ingredient_id ? l.quantity_unit : undefined,
  }));
}

/** Parsed quantity when it is a number > 0, else null. */
export function lineQuantity(l: Pick<ReviewLine, "qty">): number | null {
  const n = parseDecimal(l.qty);
  return n != null && n > 0 ? n : null;
}

/** Why an included line blocks Approve, or null when it is fine. */
export function lineHasUnitMismatch(l: ReviewLine, ingredient?: DraftIngredient): boolean {
  const unit = ingredient?.unit ?? l.matchedUnit;
  return !!l.ingredient_id && !!unit && l.qtyUnit !== unit;
}

/** Shared by the picker and create-ingredient callback. A new unit needs a new amount. */
export function selectLineIngredient(l: ReviewLine, ingredient: DraftIngredient | null): ReviewLine {
  const changedUnit = ingredient != null && ingredient.unit !== l.qtyUnit;
  return {
    ...l,
    ingredient_id: ingredient?.id ?? null,
    matchedUnit: ingredient?.unit,
    qty: changedUnit ? "" : l.qty,
    qtyUnit: ingredient?.unit ?? l.qtyUnit,
  };
}

/** Moving a line to the main list always clears "to taste" (only seasonings can be to taste). */
export function setLineRole(l: ReviewLine, role: LineRole): ReviewLine {
  return { ...l, role, toTaste: role === "seasoning" ? l.toTaste : false };
}

/** "To taste" lines carry no amount: the amount text is cleared. */
export function setLineToTaste(l: ReviewLine, toTaste: boolean): ReviewLine {
  return { ...l, toTaste, qty: toTaste ? "" : l.qty };
}

/** Section order of the review: main ingredients first, then seasonings (stable within each). */
export function orderedForReview<T extends { role: LineRole }>(lines: T[]): T[] {
  return [...lines.filter((l) => l.role === "main"), ...lines.filter((l) => l.role === "seasoning")];
}

export function lineProblem(l: ReviewLine, ingredient?: DraftIngredient): string | null {
  if (l.base.is_section_header || !l.include) return null;
  if (!l.ingredient_id) return "Pick an ingredient or skip this line";
  if (l.toTaste) return null; // no amount to check
  if (lineHasUnitMismatch(l, ingredient)) return "Enter a corrected amount in the ingredient's unit";
  const quantity = lineQuantity(l);
  if (quantity == null || Math.round(quantity * 1000) <= 0) return "Enter an amount greater than 0";
  return null;
}

export function includedLines(lines: ReviewLine[]): ReviewLine[] {
  return lines.filter((l) => !l.base.is_section_header && l.include);
}

/** Approve needs a name, at least one included MAIN line, and every included line matched with a quantity > 0 (to-taste lines need no amount). */
export function canApprove(lines: ReviewLine[], name: string, ingredients?: DraftIngredient[]): boolean {
  if (!name.trim()) return false;
  const inc = includedLines(lines);
  return inc.some((l) => l.role === "main") && inc.every((l) => {
    const ingredient = ingredients?.find((i) => i.id === l.ingredient_id);
    return (!ingredients || !!ingredient) && lineProblem(l, ingredient) === null;
  });
}

/** Number of included lines blocking Approve. */
export function blockingCount(lines: ReviewLine[], ingredients?: DraftIngredient[]): number {
  return includedLines(lines).filter((l) => {
    const ingredient = ingredients?.find((i) => i.id === l.ingredient_id);
    return (ingredients && !ingredient) || lineProblem(l, ingredient) !== null;
  }).length;
}

export interface DraftRecipeFields {
  name: string;
  portions: number;
  containerTypeId: string | null;
  sourceUrl: string;
  steps: string[];
  customerDescription: string;
  /** Free notes (e.g. "Video: <url>" when a video led to the recipe). */
  notes?: string;
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
 * are excluded; two weighed lines on the same ingredient and role are summed (roles stay apart); one alias per matched line
 * (including corrected canonical names, to repair an existing incorrect alias).
 */
export function buildSavePayload(
  fields: DraftRecipeFields,
  lines: ReviewLine[],
  ingredients: DraftIngredient[],
): SavePayload {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  // One output row per (ingredient, role). Weighed amounts add up; a to-taste line only survives
  // when no weighed line of the same ingredient and role exists (the weighed amount wins).
  const rows = new Map<string, { ingredient_id: string; role: LineRole; sum: number; weighed: number }>();
  const aliases = new Map<string, SaveImportedRecipeAlias>();

  for (const l of includedLines(lines)) {
    const ing = l.ingredient_id ? byId.get(l.ingredient_id) : undefined;
    if (!ing || lineProblem(l, ing)) {
      throw new Error("Correct every included ingredient and amount before saving");
    }
    const key = `${ing.id}:${l.role}`;
    const row = rows.get(key) ?? { ingredient_id: ing.id, role: l.role, sum: 0, weighed: 0 };
    if (!(l.toTaste && l.role === "seasoning")) {
      const qty = lineQuantity(l);
      if (qty == null || round3(qty) <= 0) throw new Error("Correct every included ingredient and amount before saving");
      row.sum += qty;
      row.weighed += 1;
    }
    rows.set(key, row);
    const raw = l.base.raw_name.trim();
    const correctedMatch = l.base.ingredient_id !== ing.id;
    if (raw && (norm(raw) !== norm(ing.name) || correctedMatch) && !aliases.has(norm(raw))) {
      aliases.set(norm(raw), { alias: raw, ingredient_id: ing.id });
    }
  }

  const description = fields.customerDescription.trim();
  return {
    recipe: {
      name: fields.name.trim(),
      portions: Math.max(1, Math.round(fields.portions) || 1),
      final_weight: null,
      notes: fields.notes?.trim() ? fields.notes.trim() : null,
      customer_description: description === "" ? null : description,
      container_type_id: fields.containerTypeId,
      source_url: normalizeSourceUrl(fields.sourceUrl),
      instructions: normalizeSteps(fields.steps),
    },
    ingredients: [...rows.values()].map((r) => ({
      ingredient_id: r.ingredient_id,
      quantity: r.weighed > 0 ? round3(r.sum) : 0,
      role: r.role,
      to_taste: r.weighed === 0,
    })),
    aliases: [...aliases.values()],
    // Only amounts that were really added up (two or more weighed lines in the same role).
    mergedIngredientIds: [...new Set([...rows.values()].filter((r) => r.weighed > 1).map((r) => r.ingredient_id))],
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
