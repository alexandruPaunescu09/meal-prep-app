import { describe, expect, it } from "vitest";
import {
  blockingCount,
  buildSavePayload,
  canApprove,
  initReviewLines,
  lineProblem,
  mergeNote,
  siteCalories,
  selectLineIngredient,
  lineHasUnitMismatch,
  type DraftIngredient,
  type DraftRecipeFields,
} from "./draft";
import { findDuplicateRecipe } from "./postprocess";
import type { RecipeImportLine } from "./types";
import { normalizeSourceKey } from "./url";

function line(over: Partial<RecipeImportLine>): RecipeImportLine {
  return {
    raw_text: "x",
    raw_name: "x",
    include: true,
    is_section_header: false,
    optional: false,
    ingredient_id: null,
    match_confidence: null,
    original_amount: null,
    original_unit: null,
    quantity: null,
    quantity_unit: "g",
    conversion_note: null,
    is_estimate: false,
    search_term: "",
    suggested_unit: "g",
    suggested_category: null,
    note: null,
    ...over,
  };
}

const ings: DraftIngredient[] = [
  { id: "a", name: "Faina", unit: "g" },
  { id: "b", name: "Dovlecei", unit: "g" },
];
const fields: DraftRecipeFields = {
  name: " Bastonase ",
  portions: 4,
  containerTypeId: null,
  sourceUrl: " https://x.ro/r ",
  steps: ["Mix", "  ", "Fry"],
  customerDescription: "  ",
};

describe("initReviewLines", () => {
  it("skips optional lines, drops header matches and uses decimal comma", () => {
    const r = initReviewLines([
      line({ is_section_header: true, include: false }),
      line({ include: false, optional: true }),
      line({ ingredient_id: "a", quantity: 4.5 }),
    ]);
    expect(r.map((l) => l.include)).toEqual([false, false, true]);
    expect(r[2].qty).toBe("4,5");
  });
});

describe("canApprove / lineProblem", () => {
  it("blocks unmatched or zero-quantity included lines, ignores skipped and headers", () => {
    const ls = initReviewLines([
      line({ is_section_header: true, include: false }),
      line({ ingredient_id: "a", quantity: 100 }),
      line({ ingredient_id: null, quantity: 5 }),
    ]);
    expect(canApprove(ls, "R")).toBe(false);
    expect(blockingCount(ls)).toBe(1);
    ls[2].include = false;
    expect(canApprove(ls, "R")).toBe(true);
    expect(canApprove(ls, "  ")).toBe(false);
    ls[1].qty = "0";
    expect(lineProblem(ls[1])).toMatch(/amount/);
    expect(canApprove(ls, "R")).toBe(false);
    ls[1].qty = "1,5";
    expect(canApprove(ls, "R")).toBe(true);
  });
  it("needs at least one included line", () => {
    expect(canApprove(initReviewLines([line({ include: false })]), "R")).toBe(false);
  });
});

describe("buildSavePayload", () => {
  it("excludes skipped, optional and header lines and sends every recipe key", () => {
    const ls = initReviewLines([
      line({ is_section_header: true, include: false, raw_name: "Pentru sos" }),
      line({ ingredient_id: "a", quantity: 200, raw_name: "faina alba" }),
      line({ ingredient_id: "b", quantity: 300, raw_name: "dovlecei", include: false }),
      line({ ingredient_id: "b", quantity: 10, raw_name: "sare", optional: true, include: false }),
    ]);
    const p = buildSavePayload(fields, ls, ings);
    expect(p.ingredients).toEqual([{ ingredient_id: "a", quantity: 200 }]);
    expect(p.aliases).toEqual([{ alias: "faina alba", ingredient_id: "a" }]);
    expect(p.recipe).toEqual({
      name: "Bastonase",
      portions: 4,
      final_weight: null,
      notes: null,
      customer_description: null,
      container_type_id: null,
      source_url: "https://x.ro/r",
      instructions: ["Mix", "Fry"],
    });
  });

  it("persists canonical names too so an existing incorrect alias is corrected", () => {
    const ls = initReviewLines([line({ ingredient_id: "b", quantity: 1, raw_name: " FAINA " })]);
    ls[0] = selectLineIngredient(ls[0], ings[0]);
    expect(buildSavePayload(fields, ls, ings).aliases).toEqual([{ alias: "FAINA", ingredient_id: "a" }]);
  });

  it("does not add redundant canonical aliases when the match was unchanged", () => {
    const ls = initReviewLines([line({ ingredient_id: "a", quantity: 1, raw_name: " FAINA " })]);
    expect(buildSavePayload(fields, ls, ings).aliases).toEqual([]);
  });

  it("merges two lines on the same ingredient and says so", () => {
    const ls = initReviewLines([
      line({ ingredient_id: "a", quantity: 100, raw_name: "faina" }),
      line({ ingredient_id: "a", quantity: 50.5, raw_name: "faina pentru pane" }),
    ]);
    const p = buildSavePayload(fields, ls, ings);
    expect(p.ingredients).toEqual([{ ingredient_id: "a", quantity: 150.5 }]);
    expect(p.mergedIngredientIds).toEqual(["a"]);
    expect(mergeNote(p.mergedIngredientIds, ings)).toContain("Faina");
    expect(mergeNote([], ings)).toBeNull();
  });

  it("de-duplicates aliases by text and parses decimal comma quantities", () => {
    const ls = initReviewLines([
      line({ ingredient_id: "a", quantity: 1, raw_name: "faina x" }),
      line({ ingredient_id: "b", quantity: 1, raw_name: "Faina X" }),
    ]);
    ls[0].qty = "2,5";
    const p = buildSavePayload(fields, ls, ings);
    expect(p.aliases).toHaveLength(1);
    expect(p.ingredients[0].quantity).toBe(2.5);
  });
});

describe("normalizeSourceKey / findDuplicateRecipe", () => {
  it("ignores host case, www, trailing slash, fragment and utm params", () => {
    const a = normalizeSourceKey("HTTPS://WWW.Gustos.RO/retete/x.html/?utm_source=fb&utm_medium=a#top");
    expect(a).toBe("gustos.ro/retete/x.html");
    expect(normalizeSourceKey("https://gustos.ro/retete/x.html")).toBe(a);
    expect(normalizeSourceKey("https://a.ro/p?id=2&utm_x=1")).toBe("a.ro/p?id=2");
    expect(normalizeSourceKey("ftp://a.ro/x")).toBeNull();
    expect(normalizeSourceKey("not a url")).toBeNull();
    expect(normalizeSourceKey(null)).toBeNull();
  });
  it("prefers the source link over the name match", () => {
    const recipes = [
      { id: "1", name: "Pancakes", source_url: null },
      { id: "2", name: "Other title", source_url: "https://site.com/p/1/" },
    ];
    expect(findDuplicateRecipe("Pancakes", "https://SITE.com/p/1?utm_source=x", recipes)).toEqual({
      id: "2",
      name: "Other title",
    });
    expect(findDuplicateRecipe("pancakes", null, recipes)).toEqual({ id: "1", name: "Pancakes" });
    expect(findDuplicateRecipe("Nope", "https://other.com", recipes)).toBeNull();
  });
});

describe("siteCalories", () => {
  it("reads the first number", () => {
    expect(siteCalories({ calories: "61 calories" })).toBe(61);
    expect(siteCalories({ calories: "320,5 kcal" })).toBe(320.5);
    expect(siteCalories(null)).toBeNull();
    expect(siteCalories({ fat: "3 g" })).toBeNull();
  });
});

describe("unit correction across selection flows", () => {
  const pieces = { id: "pieces", name: "Eggs", unit: "buc" };
  const grams = { id: "grams", name: "Eggs by weight", unit: "g" };
  it("clears grams when repicking a piece ingredient, requiring a corrected quantity", () => {
    const original = initReviewLines([line({ ingredient_id: "grams", quantity: 100 })])[0];
    const picked = selectLineIngredient(original, pieces);
    expect(picked.qty).toBe("");
    expect(picked.qtyUnit).toBe("buc");
    expect(canApprove([picked], "R")).toBe(false);
    expect(canApprove([{ ...picked, qty: "2" }], "R", [pieces])).toBe(true);
    expect(original.qty).toBe("100");
  });
  it("also clears quantities when creating an ingredient in a different unit", () => {
    const unmatched = initReviewLines([line({ quantity: 100 })])[0];
    expect(selectLineIngredient(unmatched, pieces).qty).toBe("");
    expect(selectLineIngredient(unmatched, grams).qty).toBe("100");
  });
  it("cannot bypass correction by clearing and reselecting or selecting back", () => {
    const original = initReviewLines([line({ ingredient_id: "grams", quantity: 100 })])[0];
    const changed = selectLineIngredient(original, pieces);
    const cleared = selectLineIngredient(changed, null);
    expect(selectLineIngredient(cleared, grams).qty).toBe("");
  });
  it("blocks mismatches in validation, scaling callers without a catalog, and save payloads", () => {
    const original = initReviewLines([line({ ingredient_id: "grams", quantity: 100 })])[0];
    const mismatch = { ...original, ingredient_id: "pieces", matchedUnit: "buc" };
    expect(lineHasUnitMismatch(mismatch, pieces)).toBe(true);
    expect(canApprove([mismatch], "R")).toBe(false);
    expect(blockingCount([mismatch], [pieces])).toBe(1);
    expect(() => buildSavePayload(fields, [mismatch], [pieces])).toThrow(/Correct/);
    // Catalog validation also protects restored rows from stale or missing unit metadata.
    expect(canApprove([{ ...mismatch, matchedUnit: undefined }], "R", [pieces])).toBe(false);
  });
  it("rejects missing catalog ingredients and amounts rounded to zero", () => {
    const original = initReviewLines([line({ ingredient_id: "grams", quantity: 100 })])[0];
    expect(canApprove([original], "R", [])).toBe(false);
    expect(canApprove([{ ...original, qty: "0,0001" }], "R", [grams])).toBe(false);
  });
});
