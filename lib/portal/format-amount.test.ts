import { describe, expect, it } from "vitest";
import { formatEntryAmount } from "./format-amount";

describe("formatEntryAmount", () => {
  it("shows servings and portions with decimals and pluralises on the shown value", () => {
    expect(formatEntryAmount(1, "serving")).toBe("1 serving");
    expect(formatEntryAmount(1.5, "serving")).toBe("1,5 servings");
    expect(formatEntryAmount(2.5, "portion")).toBe("2,5 portions");
    expect(formatEntryAmount(0.25, "portion")).toBe("0,25 portions");
    expect(formatEntryAmount(1.004, "serving")).toBe("1 serving");
    expect(formatEntryAmount(2, "serving")).toBe("2 servings");
  });
  it("keeps g and ml compact", () => {
    expect(formatEntryAmount(150, "g")).toBe("150g");
    expect(formatEntryAmount(250, "ml")).toBe("250ml");
  });
});
