import { describe, expect, it } from "vitest";
import { todayInTz } from "./format";

describe("todayInTz", () => {
  const instant = new Date("2026-10-18T22:30:00Z");
  it("rolls over per timezone", () => {
    expect(todayInTz("UTC", instant)).toBe("2026-10-18");
    expect(todayInTz("Europe/Bucharest", instant)).toBe("2026-10-19"); // UTC+3
    expect(todayInTz("America/Los_Angeles", instant)).toBe("2026-10-18");
  });
  it("falls back to the business timezone for missing or invalid zones", () => {
    expect(todayInTz(undefined, instant)).toBe("2026-10-19");
    expect(todayInTz("Not/AZone", instant)).toBe("2026-10-19");
  });
});
