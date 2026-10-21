import { describe, expect, it } from "vitest";
import { clientIp, hashKey } from "./rate-limit-key";

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });

describe("clientIp", () => {
  it("prefers x-vercel-forwarded-for, then x-real-ip, then first x-forwarded-for", () => {
    const all = { "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3, 4.4.4.4" };
    expect(clientIp(h(all))).toBe("1.1.1.1");
    expect(clientIp(h({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(h({ "x-forwarded-for": " 3.3.3.3 , 4.4.4.4" }))).toBe("3.3.3.3");
  });
  it("returns unknown without headers", () => {
    expect(clientIp(h({}))).toBe("unknown");
    expect(clientIp(h({ "x-forwarded-for": "" }))).toBe("unknown");
  });
  it("keys IPv6 on the /64 prefix, including compressed forms", () => {
    const a = clientIp(h({ "x-real-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" }));
    expect(a).toBe("2001:db8:1:2::/64");
    expect(clientIp(h({ "x-real-ip": "2001:DB8:1:2::1" }))).toBe(a);
    expect(clientIp(h({ "x-real-ip": "2001:db8:1:2:0:0:0:ffff" }))).toBe(a);
    expect(clientIp(h({ "x-real-ip": "2001:db8:1:3::1" }))).not.toBe(a);
    expect(clientIp(h({ "x-real-ip": "::1" }))).toBe("0:0:0:0::/64");
    expect(clientIp(h({ "x-real-ip": "2001:db8::" }))).toBe("2001:db8:0:0::/64");
  });
  it("treats IPv4-mapped IPv6 as IPv4", () => {
    expect(clientIp(h({ "x-real-ip": "::ffff:1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-real-ip": "0:0:0:0:0:ffff:1.2.3.4" }))).toBe("1.2.3.4");
  });
});

describe("hashKey", () => {
  it("is a stable 64-char hex digest that hides the input", () => {
    const a = hashKey("1.2.3.4");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(hashKey("1.2.3.4"));
    expect(a).not.toContain("1.2.3.4");
    expect(a).not.toBe(hashKey("1.2.3.5"));
  });
});
