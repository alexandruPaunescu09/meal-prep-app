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

describe("searchNutrition Romanian -> English for USDA", () => {
  let nextFdc = 1;
  const usdaFood = (description: string) => ({
    description,
    fdcId: nextFdc++,
    dataType: "Foundation",
    foodNutrients: [
      { nutrientId: 1008, value: 120 },
      { nutrientId: 1003, value: 22 },
      { nutrientId: 1005, value: 0 },
      { nutrientId: 1004, value: 2.6 },
    ],
  });
  const offBody = { hits: [hit("1", "Piept de pui Fraged"), hit("2", "Piept de pui Gigi"), hit("3", "Piept de pui X")] };

  function setup(usdaFoods = [usdaFood("Chicken, breast, raw")]) {
    vi.stubEnv("USDA_API_KEY", "test-key");
    fetchMock.mockImplementation((url: string) =>
      String(url).includes("nal.usda.gov") ? json({ foods: usdaFoods }) : json(offBody)
    );
  }
  const usdaUrl = () => new URL(urls(fetchMock).find((u) => u.includes("nal.usda.gov") && !u.includes("dataType"))!);
  const offUrl = () => urls(fetchMock).find((u) => !u.includes("nal.usda.gov"))!;

  it("sends USDA the English query and OFF the original, and reports usdaQuery", async () => {
    setup();
    const out = await searchNutrition("piept de pui");
    expect(usdaUrl().searchParams.get("query")).toBe("chicken breast");
    expect(decodeURIComponent(offUrl())).toContain("piept de pui");
    expect(decodeURIComponent(offUrl())).not.toContain("chicken breast");
    expect(out.usdaQuery).toBe("chicken breast");
  });

  it("returns usdaQuery null and sends the same query to both for English input", async () => {
    setup();
    const out = await searchNutrition("chicken breast");
    expect(out.usdaQuery).toBeNull();
    expect(usdaUrl().searchParams.get("query")).toBe("chicken breast");
  });

  it("shares the USDA cache entry between the Romanian and English spelling", async () => {
    setup();
    await searchNutrition("piept de pui");
    const usdaCalls = () => urls(fetchMock).filter((u) => u.includes("nal.usda.gov")).length;
    expect(usdaCalls()).toBe(2);
    await searchNutrition("chicken breast");
    expect(usdaCalls()).toBe(2);
  });

  it("ranks USDA names against the English query and OFF names against the original", async () => {
    // Same confidence/source for both would tie; the English-named USDA result must get full name relevance
    // for "chicken breast" and the Romanian OFF product full relevance for "piept de pui".
    setup();
    const out = await searchNutrition("piept de pui");
    const usda = out.results.find((r) => r.source === "usda")!;
    const off = out.results.find((r) => r.source === "openfoodfacts")!;
    const { computeRank } = await import("./index");
    expect(computeRank(usda, ["chicken", "breast"], "chicken breast")).toBeGreaterThan(
      computeRank(usda, ["piept", "de", "pui"], "piept de pui")
    );
    expect(computeRank(off, ["piept", "de", "pui"], "piept de pui")).toBeGreaterThan(
      computeRank(off, ["chicken", "breast"], "chicken breast")
    );
    expect(usda.name).toContain("Chicken");
  });

  it("the USDA cooked filter sees the English words (fiert -> boiled keeps cooked entries)", async () => {
    setup([usdaFood("Egg, whole, boiled"), usdaFood("Egg, whole, raw")]);
    const out = await searchNutrition("oua fierte");
    expect(usdaUrl().searchParams.get("query")).toBe("egg boiled");
    expect(out.results.some((r) => r.source === "usda" && r.name.includes("boiled"))).toBe(true);
  });

  it("logs only the unmapped words", async () => {
    setup();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await searchNutrition("lapte zuzu 1,5%");
    expect(info).toHaveBeenCalledWith("nutrition search: unmapped RO words", ["zuzu"]);
    info.mockClear();
    await searchNutrition("piept de pui");
    expect(info).not.toHaveBeenCalled();
  });
});

describe("searchNutrition ranking and USDA request pool", () => {
  let id = 1000;
  const usdaFood = (description: string, dataType: string, brandOwner?: string) => ({
    description,
    fdcId: id++,
    dataType,
    ...(brandOwner ? { brandOwner } : {}),
    foodNutrients: [
      { nutrientId: 1008, value: 130 },
      { nutrientId: 1003, value: 2.7 },
      { nutrientId: 1005, value: 28 },
      { nutrientId: 1004, value: 0.3 },
    ],
  });
  const isFiltered = (u: unknown) => String(u).includes("dataType");
  const usdaCalls = () => urls(fetchMock).filter((u) => u.includes("nal.usda.gov"));

  function route(plain: () => Response, filtered: () => Response, off: unknown) {
    vi.stubEnv("USDA_API_KEY", "test-key");
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (!u.includes("nal.usda.gov")) return json(off);
      return isFiltered(u) ? filtered() : plain();
    });
  }

  it("brand query: the OFF product of that brand outranks generic USDA (no USDA bonus, brand counts)", async () => {
    const milk = usdaFood("Milk, whole, 3.25% milkfat", "Foundation");
    const zuzu = hit("9", "Lapte 3.5% grasime 500ml", { brands: ["Zuzu"] });
    const other = hit("8", "Lapte UHT", { brands: ["Helga"] });
    route(() => json({ foods: [milk] }), () => json({ foods: [milk] }), { hits: [other, zuzu, hit("7", "Lapte Napolact", { brands: ["Napolact"] })] });
    const out = await searchNutrition("lapte zuzu");
    expect(out.results[0].source).toBe("openfoodfacts");
    expect(out.results[0].brand).toBe("Zuzu");
    expect(out.usdaQuery).toBe("milk");
  });

  it("no unknown words: generic USDA stays first, OFF keeps the original query", async () => {
    const chicken = usdaFood("Chicken, breast, boneless, skinless, raw", "Foundation");
    route(() => json({ foods: [chicken] }), () => json({ foods: [chicken] }), {
      hits: [hit("1", "Piept de pui Fraged"), hit("2", "Piept de pui Gigi"), hit("3", "Piept de pui X")],
    });
    const out = await searchNutrition("piept de pui");
    expect(out.results[0].source).toBe("usda");
  });

  it("plain query: a generic SR Legacy raw entry from the filtered request beats a dish and a branded item", async () => {
    const dish = usdaFood("Adobo, with rice", "Survey (FNDDS)");
    const branded = usdaFood("RICE", "Branded", "Acme Foods");
    const rice = usdaFood("Rice, white, long-grain, regular, raw, enriched", "SR Legacy");
    const crackers = usdaFood("Rice crackers", "SR Legacy");
    route(() => json({ foods: [dish, branded] }), () => json({ foods: [crackers, rice] }), { hits: [] });
    const out = await searchNutrition("rice");
    expect(out.sources.usda).toBe("ok");
    expect(out.results.map((r) => r.name)).toEqual(
      expect.arrayContaining(["Adobo, with rice", "RICE", "Rice crackers"])
    );
    expect(out.results[0].name).toBe("Rice, white, long-grain, regular, raw, enriched");
    // both USDA requests were made; the filtered one has no parentheses in its dataType
    expect(usdaCalls()).toHaveLength(2);
    expect(usdaCalls().find(isFiltered)).toContain("dataType=Foundation,SR%20Legacy");
  });

  it("merges the two USDA requests without duplicates (by fdcId)", async () => {
    const rice = usdaFood("Rice, white, raw", "SR Legacy");
    route(() => json({ foods: [rice] }), () => json({ foods: [rice] }), { hits: [] });
    const out = await searchNutrition("rice");
    expect(out.results.filter((r) => r.name === "Rice, white, raw")).toHaveLength(1);
  });

  it.each([
    ["the unfiltered", false],
    ["the Foundation/SR Legacy", true],
  ])("when %s USDA request fails: shows the other results, reports usda error, never caches", async (_n, failFiltered) => {
    const rice = usdaFood("Rice, white, raw", "SR Legacy");
    const ok = () => json({ foods: [rice] });
    const bad = () => json({}, 403);
    route(failFiltered ? ok : bad, failFiltered ? bad : ok, { hits: [] });
    const out = await searchNutrition("rice");
    expect(out.sources.usda).toBe("error");
    expect(out.results.map((r) => r.name)).toEqual(["Rice, white, raw"]);
    expect(usdaSearchCache.size).toBe(0);
    // a repeat retries (nothing cached) and now succeeds
    route(ok, ok, { hits: [] });
    expect((await searchNutrition("rice")).sources.usda).toBe("ok");
    expect(usdaSearchCache.size).toBe(1);
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
