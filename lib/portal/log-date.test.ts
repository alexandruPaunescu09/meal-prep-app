import { describe, expect, it } from "vitest";
import { maxLogDate } from "./log-date";

describe("maxLogDate", () => {
  const now = new Date("2026-10-18T22:30:00Z"); // 19 Oct in Bucharest, 18 Oct in Los Angeles
  it("is the customer's today + 1 day", () => {
    expect(maxLogDate("Europe/Bucharest", now)).toBe("2026-10-20");
    expect(maxLogDate("America/Los_Angeles", now)).toBe("2026-10-19");
  });
  it("falls back to the business timezone", () => {
    expect(maxLogDate(undefined, now)).toBe("2026-10-20");
  });
  it("lexicographic compare rejects later dates", () => {
    expect("2026-10-21" > maxLogDate("Europe/Bucharest", now)).toBe(true);
    expect("2026-10-20" > maxLogDate("Europe/Bucharest", now)).toBe(false);
  });
});
