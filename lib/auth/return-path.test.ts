import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("accepts same-origin relative paths with query", () => {
    expect(safeReturnPath("/recipes/import?url=https%3A%2F%2Fa.ro%2Fx")).toBe("/recipes/import?url=https%3A%2F%2Fa.ro%2Fx");
    expect(safeReturnPath("/")).toBe("/");
    expect(safeReturnPath("/recipes/import?text=a%0Ab")).toBe("/recipes/import?text=a%0Ab");
  });
  it("rejects protocol-relative and backslash forms", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "/\\/evil.example", "\\\\evil.example", "///evil.example"]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
  it("rejects encoded variants in the path", () => {
    for (const bad of ["/%2Fevil.example", "/%2f/evil.example", "/%5Cevil.example", "/%255Cevil.example", "/%252F%252Fevil.example", "/a%0d%0ab"]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
  it("rejects schemes, relative values and junk", () => {
    for (const bad of ["https://evil.example", "javascript:alert(1)", "evil.example", "recipes", "", null, undefined, "/ok\nx", "/%E0%A4%A"]) {
      expect(safeReturnPath(bad as string | null | undefined)).toBeNull();
    }
  });
  it("never returns to the login page", () => {
    expect(safeReturnPath("/login")).toBeNull();
    expect(safeReturnPath("/login?next=/x")).toBeNull();
    expect(safeReturnPath("/login/forgot-password")).toBeNull();
  });
});
