import { describe, expect, it } from "vitest";
import { firstUrl, resolveSharedInput } from "./share";

describe("firstUrl", () => {
  it("finds a link inside text and trims punctuation", () => {
    expect(firstUrl("Look at this https://www.gustos.ro/a.html, wow!")).toBe("https://www.gustos.ro/a.html");
    expect(firstUrl("(see http://x.ro/r)")).toBe("http://x.ro/r");
  });
  it("ignores non-http schemes and empty values", () => {
    expect(firstUrl("javascript:alert(1)")).toBeNull();
    expect(firstUrl("ftp://x.ro/a")).toBeNull();
    expect(firstUrl("")).toBeNull();
    expect(firstUrl(null)).toBeNull();
  });
});

describe("resolveSharedInput", () => {
  it("prefers url, then text, then title", () => {
    expect(resolveSharedInput({ url: "https://a.ro/1", text: "https://b.ro/2" })).toEqual({ kind: "url", url: "https://a.ro/1" });
    expect(resolveSharedInput({ url: "", text: "Cool https://b.ro/2", title: "https://c.ro/3" })).toEqual({
      kind: "url",
      url: "https://b.ro/2",
    });
    expect(resolveSharedInput({ text: "no link", title: "T https://c.ro/3" })).toEqual({ kind: "url", url: "https://c.ro/3" });
  });
  it("falls back to the text for the paste tab", () => {
    expect(resolveSharedInput({ text: "  200 g flour\n2 eggs  " })).toEqual({ kind: "text", text: "200 g flour\n2 eggs" });
  });
  it("returns null with nothing usable", () => {
    expect(resolveSharedInput({})).toBeNull();
    expect(resolveSharedInput({ title: "Just a title", text: "  " })).toBeNull();
  });
});
