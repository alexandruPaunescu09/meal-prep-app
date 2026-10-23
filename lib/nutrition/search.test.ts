import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NutritionSearchResult } from "@/lib/supabase/types";
import { fetchWithRetry } from "./http";
import { compareStable, searchNutrition } from "./index";
import { hitToProduct, offSearchCache, sanitizeSearchQuery, searchOffUncached, searchOpenFoodFacts } from "./open-food-facts";
import { createTtlCache, normalizeQuery, withSourceCache } from "./search-cache";
import { usdaSearchCache } from "./usda";

const NOW_SEC = Math.floor(Date.now() / 1000);

function hit(code: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    code,
    product_name: name,
    brands: ["Helga"],
    countries_tags: ["en:romania"],
    categories_tags: ["en:dairies", "en:milks"],
    last_modified_t: NOW_SEC,
    nutriments: {
      "energy-kcal_100g": 60,
      proteins_100g: 3,
      carbohydrates_100g: 4.7,
      fat_100g: 3.5,
      sugars_100g: 4.7,
      salt_100g: 0.1,
    },
    ...extra,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const urls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  offSearchCache.clear();
  usdaSearchCache.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sanitizeSearchQuery", () => {
  it("strips Lucene operators, quotes, field syntax and boolean words", () => {
    expect(sanitizeSearchQuery('lapte" OR countries_tags:(en:france) -x')).toBe("lapte countries_tags en france x");
    expect(sanitizeSearchQuery('a AND b NOT c * ? ~ \\ /')).toBe("a b c");
    expect(sanitizeSearchQuery('"":()')).toBe("");
  });
  it("keeps Romanian diacritics and plain words", () => {
    expect(sanitizeSearchQuery("brânză  de  vacă")).toBe("brânză de vacă");
  });
});

describe("hitToProduct", () => {
  it("maps a Search-a-licious hit (brands array, kJ-only energy)", () => {
    const p = hitToProduct({
      code: "5998200455490",
      brands: ["Helga", "Other"],
      product_name_ro: "Helga Lapte UHT 3,5%",
      categories_tags: ["en:milks"],
      countries_tags: ["en:romania"],
      nutriments: { "energy-kj_100g": 260, proteins_100g: 3, carbohydrates_100g: 4.7, fat_100g: 3.5 },
    });
    expect(p.brands).toBe("Helga, Other");
    expect(p.nutriments?.["energy-kcal_100g"]).toBeCloseTo(62.1, 1);
    expect(p.searchIndex).toBe(true);
    expect(p.categories_tags).toEqual(["en:milks"]);
  });
});

describe("searchOffUncached", () => {
  it("queries Search-a-licious with the Romania term, escaped input and a User-Agent", async () => {
    fetchMock.mockResolvedValue(json({ hits: [hit("1", "Lapte A"), hit("2", "Lapte B"), hit("3", "Lapte C")] }));
    const out = await searchOffUncached('lapte" OR x:y');
    expect(out.complete).toBe(true);
    expect(out.results.map((r) => r.barcode)).toEqual(["1", "2", "3"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const u = new URL(urls(fetchMock)[0]);
    expect(u.host).toBe("search.openfoodfacts.org");
    expect(u.searchParams.get("q")).toBe('lapte x y countries_tags:"en:romania"');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ "User-Agent": expect.any(String) });
  });

  it("falls back to a global query when Romania gives < 3, merging and de-duplicating by barcode", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ hits: [hit("1", "Lapte A")] }))
      .mockResolvedValueOnce(json({ hits: [hit("1", "Lapte A"), hit("9", "Milk Z", { countries_tags: ["en:france"] })] }));
    const out = await searchOffUncached("lapte");
    expect(out.results.map((r) => r.barcode)).toEqual(["1", "9"]);
    expect(out.complete).toBe(true);
    expect(new URL(urls(fetchMock)[1]).searchParams.get("q")).toBe("lapte");
  });

  it("drops hits missing core nutrients or a name", async () => {
    fetchMock.mockResolvedValue(
      json({ hits: [hit("1", "Good"), hit("2", "", {}), hit("3", "No macros", { nutriments: { fat_100g: 1 } })] })
    );
    const out = await searchOffUncached("x1");
    expect(out.results.map((r) => r.barcode)).toContain("1");
    expect(out.results.map((r) => r.barcode)).not.toContain("3");
    expect(out.results.map((r) => r.barcode)).not.toContain("2");
  });

  it("marks the outcome incomplete (not thrown) when only the fallback fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ hits: [hit("1", "Lapte A")] }))
      .mockResolvedValue(json({}, 400));
    const out = await searchOffUncached("lapte");
    expect(out.complete).toBe(false);
    expect(out.results).toHaveLength(1);
  });

  it("throws when the Romania query fails", async () => {
    fetchMock.mockResolvedValue(json({}, 400));
    await expect(searchOffUncached("lapte")).rejects.toThrow();
  });
});

describe("fetchWithRetry", () => {
  it("retries once on 503 then succeeds", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json({ ok: 1 }));
    const res = await fetchWithRetry("https://example.test/");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not retry on 400", async () => {
    fetchMock.mockResolvedValue(json({}, 400));
    const res = await fetchWithRetry("https://example.test/");
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries a network error once and then throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(fetchWithRetry("https://example.test/")).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("returns the final 5xx response after the retry", async () => {
    fetchMock.mockResolvedValue(json({}, 503));
    const res = await fetchWithRetry("https://example.test/");
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("cache", () => {
  it("normalises keys and expires entries", () => {
    expect(normalizeQuery("  Piept   DE Pui ")).toBe("piept de pui");
    let t = 0;
    const c = createTtlCache<number[]>(2, 100, () => t);
    c.set("a", [1]);
    t = 99;
    expect(c.get("a")).toEqual([1]);
    t = 200;
    expect(c.get("a")).toBeUndefined();
  });
  it("evicts the least recently used entry beyond the bound", () => {
    const c = createTtlCache<number>(2, 1000);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
  });
  it("stores successes but not failures or incomplete outcomes", async () => {
    const cache = createTtlCache<string[]>();
    const search = vi
      .fn<(q: string) => Promise<{ results: string[]; complete: boolean }>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValueOnce({ results: ["partial"], complete: false })
      .mockResolvedValueOnce({ results: ["full"], complete: true });
    const cached = withSourceCache("s", cache, search);
    await expect(cached("Oats")).rejects.toThrow();
    expect((await cached("oats")).results).toEqual(["partial"]);
    expect((await cached(" OATS ")).results).toEqual(["full"]);
    expect((await cached("oats")).results).toEqual(["full"]);
    expect(search).toHaveBeenCalledTimes(3);
  });
  it("serves a repeated OFF search without another request", async () => {
    fetchMock.mockResolvedValue(json({ hits: [hit("1", "A"), hit("2", "B"), hit("3", "C")] }));
    await searchOpenFoodFacts("lapte");
    await searchOpenFoodFacts("  LAPTE ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not cache a failed OFF search", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 400));
    await expect(searchOpenFoodFacts("lapte")).rejects.toThrow();
    fetchMock.mockResolvedValue(json({ hits: [hit("1", "A"), hit("2", "B"), hit("3", "C")] }));
    const out = await searchOpenFoodFacts("lapte");
    expect(out.results).toHaveLength(3);
  });
});

describe("searchNutrition source status", () => {
  const usdaBody = {
    foods: [
      {
        description: "Oats, raw",
        fdcId: 1,
        dataType: "Foundation",
        foodNutrients: [
          { nutrientId: 1008, value: 380 },
          { nutrientId: 1003, value: 13 },
          { nutrientId: 1005, value: 66 },
          { nutrientId: 1004, value: 7 },
        ],
      },
    ],
  };
  const offBody = { hits: [hit("1", "Oats A"), hit("2", "Oats B"), hit("3", "Oats C")] };

  function route(usda: () => Response | Promise<Response>, off: () => Response | Promise<Response>) {
    fetchMock.mockImplementation((url: string) =>
      String(url).includes("nal.usda.gov") ? usda() : off()
    );
  }

  it("reports ok / ok", async () => {
    vi.stubEnv("USDA_API_KEY", "test-key");
    route(() => json(usdaBody), () => json(offBody));
    const out = await searchNutrition("oats");
    expect(out.sources).toEqual({ usda: "ok", off: "ok" });
    expect(out.results.some((r) => r.source === "usda")).toBe(true);
    expect(out.results.some((r) => r.source === "openfoodfacts")).toBe(true);
  });

  it("reports usda disabled without a key (and for the placeholder) without calling USDA", async () => {
    vi.stubEnv("USDA_API_KEY", "your-usda-key");
    route(() => json(usdaBody), () => json(offBody));
    const out = await searchNutrition("oats");
    expect(out.sources).toEqual({ usda: "disabled", off: "ok" });
    expect(urls(fetchMock).some((u) => u.includes("nal.usda.gov"))).toBe(false);
  });

  it("reports off error but still returns USDA results", async () => {
    vi.stubEnv("USDA_API_KEY", "test-key");
    route(() => json(usdaBody), () => json({}, 400));
    const out = await searchNutrition("oats");
    expect(out.sources).toEqual({ usda: "ok", off: "error" });
    expect(out.results).toHaveLength(1);
  });

  it("reports usda error and retries a later search", async () => {
    vi.stubEnv("USDA_API_KEY", "test-key");
    route(() => json({}, 403), () => json(offBody));
    expect((await searchNutrition("oats")).sources.usda).toBe("error");
    route(() => json(usdaBody), () => json(offBody));
    expect((await searchNutrition("oats")).sources.usda).toBe("ok");
  });
});

describe("compareStable", () => {
  const r = (name: string, barcode: string | null): NutritionSearchResult =>
    ({ name, brand: null, source: "openfoodfacts", barcode } as NutritionSearchResult);
  it("orders by name, then barcode, regardless of input order", () => {
    const list = [r("B", "2"), r("A", "9"), r("A", "1")];
    const a = [...list].sort(compareStable).map((x) => x.name + x.barcode);
    const b = [...list].reverse().sort(compareStable).map((x) => x.name + x.barcode);
    expect(a).toEqual(["A1", "A9", "B2"]);
    expect(b).toEqual(a);
  });
});
