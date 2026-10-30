import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";
import { resolveSharedInput } from "../recipes/import/share";

describe("safeReturnPath", () => {
  it("preserves multiline encoded recipe text through the login query round trip", () => {
    const text = "Clătite cu brânză\n200 g făină\n2 ouă\nAmestecă și coace până se rumenește.\n".repeat(15).trim();
    const wanted = `/recipes/import?${new URLSearchParams({ title: "Rețetă", text })}`;
    expect(wanted.length).toBeGreaterThan(2000);
    expect(safeReturnPath(wanted)).toBe(wanted);

    // Proxy nests the path in next; login reads and validates it again.
    const login = new URL("https://meal-prep.example/login");
    login.searchParams.set("next", wanted);
    const returned = safeReturnPath(new URLSearchParams(login.search).get("next"));
    expect(returned).toBe(wanted);
    const params = new URL(returned!, login.origin).searchParams;
    expect(resolveSharedInput({ text: params.get("text"), title: params.get("title") })).toEqual({ kind: "text", text });
  });

  it("bounds the total return URL at 16 KiB without truncating the payload", () => {
    const prefix = "/recipes/import?text=";
    const atLimit = prefix + "a".repeat(16 * 1024 - prefix.length);
    expect(safeReturnPath(atLimit)).toBe(atLimit);
    expect(safeReturnPath(atLimit + "a")).toBeNull();
  });

  it("also bounds raw Unicode after URL serialization", () => {
    const prefix = "/recipes/import?text=";
    expect(safeReturnPath(prefix + "ă".repeat(3000))).toBeNull();
    expect(safeReturnPath(prefix + "ă".repeat(100))).toBe(prefix + "%C4%83".repeat(100));
  });

  it("keeps the pathname bounded separately from shared query text", () => {
    expect(safeReturnPath("/" + "a".repeat(1999))).toHaveLength(2000);
    expect(safeReturnPath("/" + "a".repeat(2000) + "?text=recipe")).toBeNull();
  });

  it("still rejects redirect attacks with a long shared query", () => {
    const query = `?text=${"recipe".repeat(500)}`;
    for (const path of [
      "//evil.example", "/\\evil.example", "/%2Fevil.example", "/%5Cevil.example",
      "/%255Cevil.example", "/%252F%252Fevil.example", "/a%0d%0ab", "/ok\nx",
      "https://evil.example", "javascript:alert(1)", "/%E0%A4%A", "/login", "/login/forgot-password",
    ]) {
      expect(safeReturnPath(path + query), path).toBeNull();
    }
  });

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
