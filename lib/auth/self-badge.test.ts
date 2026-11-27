import { describe, expect, it } from "vitest";
import { selfBadge } from "./self-badge";

describe("selfBadge", () => {
  it("own record is you, even if flagged admin-linked", () => {
    expect(selfBadge({ id: "a", admin_linked: true }, "a")).toBe("you");
  });
  it("another admin's record is admin", () => {
    expect(selfBadge({ id: "b", admin_linked: true }, "a")).toBe("admin");
    expect(selfBadge({ id: "b", admin_linked: true }, null)).toBe("admin");
  });
  it("regular client has no badge", () => {
    expect(selfBadge({ id: "c", admin_linked: false }, "a")).toBeNull();
    expect(selfBadge({ id: "c" }, null)).toBeNull();
  });
});
