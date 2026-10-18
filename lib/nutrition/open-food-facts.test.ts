import { afterEach, describe, expect, it, vi } from "vitest";
import { OffUnavailableError, extractMicros, inferUnit, lookupBarcode } from "./open-food-facts";

describe("extractMicros", () => {
  it("converts OFF grams to our mg / ug keys (real Chocapic-shaped values)", () => {
    // OFF *_100g values are grams: iron 12 mg, vitamin D 3.4 ug, calcium 120 mg, folate 200 ug.
    const micros = extractMicros({
      iron_100g: 0.012,
      "vitamin-d_100g": 0.0000034,
      calcium_100g: 0.12,
      folate_100g: 0.0002,
      "vitamin-c_100g": 0.0285,
      "vitamin-a_100g": 0.0004,
      selenium_100g: 0.0000275,
    });
    expect(micros).toEqual({
      iron_mg: 12,
      vitamin_d_ug: 3.4,
      calcium_mg: 120,
      folate_ug: 200,
      vitamin_c_mg: 28.5,
      vitamin_a_ug: 400,
      selenium_ug: 27.5,
    });
  });

  it("skips zero, missing and non-numeric values", () => {
    expect(extractMicros({ iron_100g: 0, zinc_100g: Number.NaN, "vitamin-k_100g": undefined as unknown as number })).toEqual({});
  });
});

describe("inferUnit", () => {
  it("prefers explicit package, then serving units", () => {
    expect(inferUnit("ml", "g", ["en:beverages"])).toBe("ml");
    expect(inferUnit(null, "ml", [])).toBe("ml");
  });
  it("infers ml from liquid categories and refuses to guess otherwise", () => {
    expect(inferUnit(null, null, ["en:snacks", "en:sodas"])).toBe("ml");
    expect(inferUnit(null, null, ["en:biscuits"])).toBeNull();
    expect(inferUnit(null, null, undefined)).toBeNull();
  });
});

describe("lookupBarcode failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns null for 404 but throws for rate limits and outages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await lookupBarcode("5941234567890")).toBeNull();
    for (const status of [429, 500, 503]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
      await expect(lookupBarcode("5941234567890")).rejects.toBeInstanceOf(OffUnavailableError);
    }
  });

  it("falls back to the Romanian / English / generic product name", async () => {
    const product = {
      product_name: "",
      product_name_ro: "Biscuiti",
      nutriments: { "energy-kcal_100g": 450, proteins_100g: 7, carbohydrates_100g: 68, fat_100g: 16 },
      quantity: "250 g",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 1, product }) }));
    const found = await lookupBarcode("5941234567890");
    expect(found?.result.name).toBe("Biscuiti");
    expect(found?.unit).toBe("g");
  });
});
