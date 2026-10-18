import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BarcodeLookup } from "@/lib/nutrition/open-food-facts";
import { OffUnavailableError } from "@/lib/nutrition/open-food-facts";
import { energyMatchesMacros, mapOffToFood, normalizeBarcode, resolveBarcode } from "./foods";
import { createRateLimiter } from "./rate-limit";

const ME = "client-me";
const OTHER = "client-other";
const CODE = "5941234567890";

type Row = Record<string, unknown>;
interface Db {
  foods: Row[];
  ingredients: Row[];
  /** Runs inside every foods insert; return an error object to fail it. */
  onInsert?: (row: Row, db: Db) => { code: string; message: string } | null;
}

const food = (over: Row = {}): Row => ({
  id: `f-${Math.random()}`,
  barcode: CODE,
  name: "Biscuits",
  brand: null,
  unit: "g",
  calories: 450,
  protein: 7,
  carbs: 68,
  fat: 16,
  fiber: null,
  sugar: null,
  sat_fat: null,
  salt: null,
  micronutrients: {},
  serving_size: null,
  serving_label: null,
  status: "active",
  created_by_client_id: OTHER,
  promoted_ingredient_id: null,
  created_at: new Date().toISOString(),
  ...over,
});

const ingredient = (over: Row = {}): Row => ({
  id: "i-1",
  barcode: CODE,
  name: "Biscuit ingredient",
  brand: null,
  unit: "g",
  calories: 400,
  protein: 5,
  carbs: 60,
  fat: 10,
  fiber: null,
  sugar: null,
  sat_fat: null,
  salt: null,
  micronutrients: {},
  ...over,
});

/** Minimal in-memory stand-in for the PostgREST builder, enough for lib/portal/foods.ts. */
function fakeService(db: Db): { client: SupabaseClient; inserts: Row[] } {
  const inserts: Row[] = [];
  class Q {
    filters: [string, string, unknown][] = [];
    op: "select" | "insert" = "select";
    head = false;
    payload: Row | null = null;
    constructor(public table: "foods" | "ingredients") {}
    select(_cols?: string, opts?: { head?: boolean }) {
      if (opts?.head) this.head = true;
      return this;
    }
    insert(p: Row) {
      this.op = "insert";
      this.payload = p;
      return this;
    }
    eq(c: string, v: unknown) {
      this.filters.push([c, "eq", v]);
      return this;
    }
    in(c: string, v: unknown) {
      this.filters.push([c, "in", v]);
      return this;
    }
    gte(c: string, v: unknown) {
      this.filters.push([c, "gte", v]);
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    single() {
      return this;
    }
    run(): { data?: unknown; error?: unknown; count?: number } {
      const rows = db[this.table];
      if (this.op === "insert") {
        const row: Row = { ...this.payload!, id: `new-${rows.length}`, created_at: new Date().toISOString() };
        const err = db.onInsert?.(row, db);
        if (err) return { error: err };
        if (rows.some((r) => r.barcode === row.barcode)) return { error: { code: "23505", message: "duplicate" } };
        inserts.push(row);
        rows.push(row);
        return { data: row };
      }
      const hit = rows.filter((r) =>
        this.filters.every(([c, op, v]) =>
          op === "eq" ? r[c] === v : op === "in" ? (v as unknown[]).includes(r[c]) : String(r[c]) >= String(v)
        )
      );
      return this.head ? { count: hit.length } : { data: hit };
    }
    then<T>(ok: (v: unknown) => T, bad?: (e: unknown) => T) {
      return Promise.resolve(this.run()).then(ok, bad);
    }
  }
  const client = { from: (t: "foods" | "ingredients") => new Q(t) } as unknown as SupabaseClient;
  return { client, inserts };
}

const offProduct = (over: Partial<BarcodeLookup> = {}): BarcodeLookup =>
  ({
    result: {
      name: "Off biscuits",
      brand: "B",
      source: "openfoodfacts",
      barcode: CODE,
      nutrition: { calories: 450, protein: 7, carbs: 68, fat: 16, fiber: null, sugar: null, sat_fat: null, salt: null, micronutrients: {} },
      completeness: 4,
      confidenceScore: 0.9,
      category: null,
    },
    packageSize: { quantity: 250, unit: "g" },
    serving: null,
    unit: "g",
    perServingOnly: false,
    ...over,
  }) as BarcodeLookup;

const allow = { allowOffLookup: () => true };

describe("resolveBarcode order", () => {
  it("returns a visible food without touching ingredients or OFF", async () => {
    const { client } = fakeService({ foods: [food()], ingredients: [ingredient()] });
    const lookup = vi.fn();
    const r = await resolveBarcode(client, ME, CODE, { lookup, ...allow });
    expect(r).toMatchObject({ ok: true, source: "food", created: false });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("falls back to an ingredient (price-free item) before OFF", async () => {
    const { client } = fakeService({ foods: [], ingredients: [ingredient()] });
    const lookup = vi.fn();
    const r = await resolveBarcode(client, ME, CODE, { lookup, ...allow });
    expect(r).toMatchObject({ ok: true, source: "ingredient" });
    expect(JSON.stringify(r)).not.toMatch(/price/i);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("creates one canonical off food when nothing is local", async () => {
    const db: Db = { foods: [], ingredients: [] };
    const { client, inserts } = fakeService(db);
    const lookup = vi.fn().mockResolvedValue(offProduct());
    const r = await resolveBarcode(client, ME, CODE, { lookup, ...allow });
    expect(r).toMatchObject({ ok: true, source: "off", created: true });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ barcode: CODE, status: "active", source: "off", created_by_client_id: ME });
  });

  it("reports not_found when OFF has no product, incomplete_data when it is unusable", async () => {
    const mk = () => fakeService({ foods: [], ingredients: [] }).client;
    expect(await resolveBarcode(mk(), ME, CODE, { lookup: async () => null, ...allow })).toEqual({ ok: false, reason: "not_found" });
    expect(await resolveBarcode(mk(), ME, CODE, { lookup: async () => offProduct({ perServingOnly: true }), ...allow })).toEqual({
      ok: false,
      reason: "incomplete_data",
    });
  });

  it("lets an OFF outage propagate so the route can answer 502", async () => {
    const { client } = fakeService({ foods: [], ingredients: [] });
    await expect(
      resolveBarcode(client, ME, CODE, { lookup: async () => Promise.reject(new OffUnavailableError("429")), ...allow })
    ).rejects.toBeInstanceOf(OffUnavailableError);
  });
});

describe("visibility", () => {
  it("hides another customer's pending food and hidden foods (and does not call OFF)", async () => {
    for (const row of [food({ status: "pending", created_by_client_id: OTHER }), food({ status: "hidden" })]) {
      const { client } = fakeService({ foods: [row], ingredients: [ingredient()] });
      const lookup = vi.fn();
      expect(await resolveBarcode(client, ME, CODE, { lookup, ...allow })).toEqual({ ok: false, reason: "not_found" });
      expect(lookup).not.toHaveBeenCalled();
    }
  });

  it("shows the customer's own pending food", async () => {
    const { client } = fakeService({ foods: [food({ status: "pending", created_by_client_id: ME })], ingredients: [] });
    expect(await resolveBarcode(client, ME, CODE, allow)).toMatchObject({ ok: true, source: "food", item: { verified: false } });
  });
});

describe("promoted foods", () => {
  it("redirect to the ingredient", async () => {
    const { client } = fakeService({ foods: [food({ promoted_ingredient_id: "i-9" })], ingredients: [ingredient({ id: "i-9", barcode: null })] });
    expect(await resolveBarcode(client, ME, CODE, allow)).toMatchObject({ ok: true, source: "ingredient", item: { id: "i-9" } });
  });

  it("fall back to the food when the target ingredient is gone", async () => {
    const { client } = fakeService({ foods: [food({ promoted_ingredient_id: "i-gone" })], ingredients: [] });
    expect(await resolveBarcode(client, ME, CODE, allow)).toMatchObject({ ok: true, source: "food" });
  });
});

describe("insert conflicts", () => {
  it("returns the winning row when another scan inserted first", async () => {
    const db: Db = {
      foods: [],
      ingredients: [],
      onInsert: (_row, d) => {
        d.foods.push(food({ id: "winner" }));
        return { code: "23505", message: "duplicate" };
      },
    };
    const { client } = fakeService(db);
    const r = await resolveBarcode(client, ME, CODE, { lookup: async () => offProduct(), ...allow });
    expect(r).toMatchObject({ ok: true, source: "food", created: false, item: { id: "winner" } });
  });

  it("answers not_found when the winning row is not usable by this customer", async () => {
    const db: Db = {
      foods: [],
      ingredients: [],
      onInsert: (_row, d) => {
        d.foods.push(food({ status: "hidden" }));
        return { code: "23505", message: "duplicate" };
      },
    };
    const { client } = fakeService(db);
    expect(await resolveBarcode(client, ME, CODE, { lookup: async () => offProduct(), ...allow })).toEqual({ ok: false, reason: "not_found" });
  });

  it("rethrows other database errors", async () => {
    const db: Db = { foods: [], ingredients: [], onInsert: () => ({ code: "XX000", message: "boom" }) };
    const { client } = fakeService(db);
    await expect(resolveBarcode(client, ME, CODE, { lookup: async () => offProduct(), ...allow })).rejects.toThrow("boom");
  });
});

describe("quotas", () => {
  const owned = (n: number) => Array.from({ length: n }, (_, i) => food({ barcode: `88800000${String(i).padStart(6, "0")}`, created_by_client_id: ME }));

  it("allows the 30th new food (29 existing) and blocks the 31st before calling OFF", async () => {
    const lookup = vi.fn().mockResolvedValue(offProduct());
    expect(await resolveBarcode(fakeService({ foods: owned(29), ingredients: [] }).client, ME, CODE, { lookup, ...allow })).toMatchObject({ ok: true, created: true });

    lookup.mockClear();
    expect(await resolveBarcode(fakeService({ foods: owned(30), ingredients: [] }).client, ME, CODE, { lookup, ...allow })).toEqual({ ok: false, reason: "rate_limited" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("ignores foods older than 24 hours", async () => {
    const old = owned(30).map((f) => ({ ...f, created_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() }));
    const r = await resolveBarcode(fakeService({ foods: old, ingredients: [] }).client, ME, CODE, { lookup: async () => offProduct(), ...allow });
    expect(r).toMatchObject({ ok: true, created: true });
  });

  it("caps OFF lookups per customer", async () => {
    const lookup = vi.fn().mockResolvedValue(null);
    const r = await resolveBarcode(fakeService({ foods: [], ingredients: [] }).client, ME, CODE, { lookup, allowOffLookup: () => false });
    expect(r).toEqual({ ok: false, reason: "too_many_lookups" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("sliding-window limiter allows N per window then recovers", () => {
    let t = 0;
    const l = createRateLimiter(2, 1000, () => t);
    expect([l.take("a"), l.take("a"), l.take("a"), l.take("b")]).toEqual([true, true, false, true]);
    t = 1001;
    expect(l.take("a")).toBe(true);
  });
});

describe("barcode normalisation", () => {
  it("treats UPC-A and EAN-13 / GTIN-14 spellings as one canonical code", () => {
    expect(normalizeBarcode("036000291452")).toEqual({ canonical: "0036000291452", variants: ["0036000291452", "036000291452"] });
    expect(normalizeBarcode("0036000291452")?.canonical).toBe("0036000291452");
    expect(normalizeBarcode("00036000291452")?.canonical).toBe("0036000291452");
    expect(normalizeBarcode(" 5941234567890 ")).toEqual({ canonical: "5941234567890", variants: ["5941234567890"] });
    expect(normalizeBarcode("12345678")?.canonical).toBe("12345678");
    expect(normalizeBarcode("abc")).toBeNull();
    expect(normalizeBarcode("1234567")).toBeNull();
  });

  it("finds a food stored under the other spelling and stores new foods canonically", async () => {
    const stored = food({ barcode: "0036000291452" });
    expect(await resolveBarcode(fakeService({ foods: [stored], ingredients: [] }).client, ME, "036000291452", allow)).toMatchObject({ ok: true, source: "food" });

    const ing = ingredient({ barcode: "036000291452" }); // admin typed the 12-digit form
    expect(await resolveBarcode(fakeService({ foods: [], ingredients: [ing] }).client, ME, "0036000291452", allow)).toMatchObject({ ok: true, source: "ingredient" });

    const { client, inserts } = fakeService({ foods: [], ingredients: [] });
    const lookup = vi.fn().mockResolvedValue(offProduct());
    await resolveBarcode(client, ME, "036000291452", { lookup, ...allow });
    expect(lookup).toHaveBeenCalledWith("0036000291452");
    expect(inserts[0].barcode).toBe("0036000291452");
  });
});

describe("OFF data sanity", () => {
  it("rejects energy that disagrees with the macros", () => {
    expect(energyMatchesMacros(450, 7, 68, 16)).toBe(true);
    expect(energyMatchesMacros(45, 7, 68, 16)).toBe(false); // shifted decimal
    expect(energyMatchesMacros(1800, 7, 68, 16)).toBe(false); // kJ filed as kcal
    expect(energyMatchesMacros(12, 0, 3, 0)).toBe(true); // small absolute differences are fine
  });

  it("rejects a product whose unit cannot be determined", () => {
    expect(mapOffToFood(offProduct({ unit: null }), CODE, ME)).toBeNull();
    const bad = offProduct();
    bad.result.nutrition.calories = 90;
    expect(mapOffToFood(bad, CODE, ME)).toBeNull();
  });
});
