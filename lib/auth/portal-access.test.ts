import { describe, expect, it } from "vitest";
import { portalAccess } from "./portal-access";

describe("portalAccess", () => {
  it("customer with a client may use the portal", () => {
    expect(portalAccess({ role: "customer", client_id: "c1" })).toEqual({ canUsePortal: true, isAdmin: false, clientId: "c1" });
  });
  it("customer without a client may not", () => {
    expect(portalAccess({ role: "customer", client_id: null }).canUsePortal).toBe(false);
  });
  it("admin with a client may, flagged admin", () => {
    expect(portalAccess({ role: "admin", client_id: "c1" })).toEqual({ canUsePortal: true, isAdmin: true, clientId: "c1" });
  });
  it("admin without a client may not", () => {
    expect(portalAccess({ role: "admin", client_id: null })).toEqual({ canUsePortal: false, isAdmin: true, clientId: null });
  });
  it("missing or unknown profile may not", () => {
    expect(portalAccess(null).canUsePortal).toBe(false);
    expect(portalAccess({ role: "other", client_id: "c1" }).canUsePortal).toBe(false);
  });
});
