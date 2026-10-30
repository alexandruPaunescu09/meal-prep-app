import { describe, expect, it } from "vitest";
import { moveItem, normalizeSourceUrl, normalizeSteps, validateSourceUrl, validateSteps } from "./steps";

describe("recipe steps", () => {
  it("trims and drops empty steps", () => {
    expect(normalizeSteps(["  Mix ", "", "   ", "Bake"])).toEqual(["Mix", "Bake"]);
  });
  it("rejects too many or too long steps", () => {
    expect(validateSteps(Array(41).fill("x"))).toMatch(/at most 40/);
    expect(validateSteps(["ok", "x".repeat(501)])).toMatch(/Step 2/);
    expect(validateSteps(["", "x".repeat(500)])).toBeNull();
  });
  it("validates the source link", () => {
    expect(validateSourceUrl("")).toBeNull();
    expect(validateSourceUrl(" https://example.com/r ")).toBeNull();
    expect(validateSourceUrl("ftp://example.com")).not.toBeNull();
    expect(validateSourceUrl("example.com")).not.toBeNull();
    expect(normalizeSourceUrl("  ")).toBeNull();
  });
  it("moves items within bounds only", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });
});
