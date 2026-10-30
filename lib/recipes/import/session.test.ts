import { describe, expect, it } from "vitest";
import {
  restoreReview, serializeReview, reviewSessionKey, REVIEW_SESSION_MAX_AGE_MS,
  REVIEW_SESSION_MAX_CHARS, type ReviewSnapshot,
} from "./session";
import { initReviewLines } from "./draft";
import type { RecipeImportLine } from "./types";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const ingredient = "33333333-3333-4333-8333-333333333333";
const base: RecipeImportLine = {
  raw_text: "100 g flour", raw_name: "flour", include: true, is_section_header: false,
  optional: false, ingredient_id: ingredient, match_confidence: "high", original_amount: 100,
  original_unit: "g", quantity: 100, quantity_unit: "g", conversion_note: null,
  is_estimate: false, search_term: "flour", suggested_unit: "g", suggested_category: null, note: null,
};
function fixture(): ReviewSnapshot {
  return {
    draft: {
      source: { kind: "text" },
      recipe: { name: "Bread", portions: 2, steps: ["Mix"], nutrition: null, total_time_minutes: null },
      lines: [base], duplicateOf: null,
    },
    model: "test", lines: initReviewLines([base]), name: "Edited bread", portionsStr: "3",
    containerTypeId: null, sourceUrl: "", steps: [{ id: "step", text: "Edited step" }],
    description: "Customer description",
  };
}
describe("review session", () => {
  it("round trips review edits, skipped lines, invalid partial amounts and selected units", () => {
    const snapshot = fixture();
    snapshot.lines[0] = { ...snapshot.lines[0], include: false, qty: "2,", qtyUnit: "buc", matchedUnit: "buc" };
    const raw = serializeReview(owner, snapshot, 1000);
    expect(restoreReview(raw, owner, 1100)).toEqual(snapshot);
    expect(restoreReview(null, owner)).toBeNull(); // successful save/discard removes the entry
  });
  it("isolates owners even if another owner's value is copied into their storage key", () => {
    const raw = serializeReview(owner, fixture(), 1000);
    expect(reviewSessionKey(owner)).not.toBe(reviewSessionKey(other));
    expect(restoreReview(raw, other, 1100)).toBeNull();
  });
  it("rejects corrupt, wrong-version, expired and future snapshots", () => {
    expect(restoreReview("{oops", owner, 1000)).toBeNull();
    const envelope = JSON.parse(serializeReview(owner, fixture(), 1000)!);
    expect(restoreReview(JSON.stringify({ ...envelope, version: 2 }), owner, 1000)).toBeNull();
    expect(restoreReview(JSON.stringify(envelope), owner, 1000 + REVIEW_SESSION_MAX_AGE_MS + 1)).toBeNull();
    expect(restoreReview(JSON.stringify(envelope), owner, 999)).toBeNull();
  });
  it("rejects malformed nested rows, duplicate uids, non-finite values and excessive bounds", () => {
    const snapshot = fixture();
    snapshot.lines.push({ ...snapshot.lines[0] });
    expect(serializeReview(owner, snapshot)).toBeNull();
    const invalid = fixture();
    invalid.draft.recipe.portions = Infinity;
    expect(serializeReview(owner, invalid)).toBeNull();
    const tooMany = fixture();
    tooMany.steps = Array.from({ length: 41 }, (_, n) => ({ id: String(n), text: "Mix" }));
    expect(serializeReview(owner, tooMany)).toBeNull();
    const tooLong = fixture();
    tooLong.description = "x".repeat(20_001);
    expect(serializeReview(owner, tooLong)).toBeNull();
    const bad = JSON.parse(serializeReview(owner, fixture(), 1000)!);
    bad.snapshot.lines[0].qtyUnit = "kg";
    expect(restoreReview(JSON.stringify(bad), owner, 1000)).toBeNull();
    expect(restoreReview("x".repeat(REVIEW_SESSION_MAX_CHARS + 1), owner)).toBeNull();
    const tooManyLines = fixture();
    tooManyLines.draft.lines = Array.from({ length: 301 }, () => base);
    expect(serializeReview(owner, tooManyLines)).toBeNull();
    const oversized = fixture();
    oversized.draft.lines = Array.from({ length: 300 }, () => ({ ...base, raw_text: "x".repeat(4000) }));
    expect(serializeReview(owner, oversized)).toBeNull();
  });
});
