import { describe, expect, it } from "vitest";
import { clientIp, hashKey } from "./rate-limit-key";

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });

describe("clientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    expect(clientIp(h({ "x-forwarded-for": " 1.2.3.4 , 5.6.7.8", "x-real-ip": "9.9.9.9" }))).toBe("1.2.3.4");
  });
  it("falls back to x-real-ip, then unknown", () => {
    expect(clientIp(h({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIp(h({}))).toBe("unknown");
    expect(clientIp(h({ "x-forwarded-for": "" }))).toBe("unknown");
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
