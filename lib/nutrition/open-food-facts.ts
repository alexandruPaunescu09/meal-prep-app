import { NutritionSearchResult, NutritionData } from "@/lib/supabase/types";
import { computeNCS, OFFProductFull } from "./confidence";
import { classifyByCategories } from "./classification";
import { SourceError, fetchWithRetry } from "./http";
import { SourceOutcome, createTtlCache, withSourceCache } from "./search-cache";

const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const OFF_USER_AGENT = "MealPrepApp/1.0 (meal-prep admin app)";

const OFF_FIELDS = [
  "product_name",
  "product_name_ro",
  "product_name_en",
  "generic_name",
  "brands",
  "code",
  "nutriments",
  "lang",
  "countries_tags",
  "nutrition_data_per",
  "completeness",
  "last_modified_t",
  "image_nutrition_url",
  "ingredients_text",
  "categories_tags",
].join(",");

const OFF_BARCODE_FIELDS = [
  OFF_FIELDS,
  "product_quantity",
  "product_quantity_unit",
  "quantity",
  "serving_size",
  "serving_quantity",
  "serving_quantity_unit",
].join(",");

interface OFFProductWithQuantity extends OFFProductFull {
  product_name_ro?: string;
  product_name_en?: string;
  generic_name?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
}

export interface BarcodeLookup {
  result: NutritionSearchResult;
  packageSize: { quantity: number; unit: "g" | "ml" } | null;
  /** One serving in g/ml (and the label OFF prints for it), when OFF knows it. */
  serving: { size: number; label: string | null } | null;
  /** Unit the per-100 values refer to, or null when OFF gives no way to tell (never guessed). */
  unit: "g" | "ml" | null;
  perServingOnly: boolean;
}

const CORE_NUTRIENT_KEYS = [
  "energy-kcal_100g",
  "fat_100g",
  "carbohydrates_100g",
  "sugars_100g",
  "proteins_100g",
  "salt_100g",
] as const;

function extractNutrition(nutriments: Record<string, number>): NutritionData {
  return {
    calories: nutriments["energy-kcal_100g"] ?? null,
    protein: nutriments["proteins_100g"] ?? null,
    carbs: nutriments["carbohydrates_100g"] ?? null,
    fat: nutriments["fat_100g"] ?? null,
    fiber: nutriments["fiber_100g"] ?? null,
    sugar: nutriments["sugars_100g"] ?? null,
    sat_fat: nutriments["saturated-fat_100g"] ?? null,
    salt: nutriments["salt_100g"] ?? null,
    micronutrients: extractMicros(nutriments),
  };
}

// Open Food Facts reports every `*_100g` micronutrient in GRAMS (iron_100g 0.012 = 12 mg). Our keys
// carry their unit in the suffix, so convert: g -> mg is x1000, g -> ug is x1e6.
const MICRO_MAP: Record<string, { key: string; factor: number }> = {
  iron_100g: { key: "iron_mg", factor: 1e3 },
  calcium_100g: { key: "calcium_mg", factor: 1e3 },
  potassium_100g: { key: "potassium_mg", factor: 1e3 },
  magnesium_100g: { key: "magnesium_mg", factor: 1e3 },
  zinc_100g: { key: "zinc_mg", factor: 1e3 },
  "vitamin-a_100g": { key: "vitamin_a_ug", factor: 1e6 },
  "vitamin-c_100g": { key: "vitamin_c_mg", factor: 1e3 },
  "vitamin-d_100g": { key: "vitamin_d_ug", factor: 1e6 },
  "vitamin-e_100g": { key: "vitamin_e_mg", factor: 1e3 },
  "vitamin-k_100g": { key: "vitamin_k_ug", factor: 1e6 },
  phosphorus_100g: { key: "phosphorus_mg", factor: 1e3 },
  selenium_100g: { key: "selenium_ug", factor: 1e6 },
  folate_100g: { key: "folate_ug", factor: 1e6 },
};

export function extractMicros(n: Record<string, number>): Record<string, number> {
  const micros: Record<string, number> = {};
  for (const [offKey, { key, factor }] of Object.entries(MICRO_MAP)) {
    const val = Number(n[offKey]);
    if (Number.isFinite(val) && val > 0) {
      // Round away float noise from the multiplication (0.012 * 1000 = 12.000000000000002).
      micros[key] = Math.round(val * factor * 1e6) / 1e6;
    }
  }
  return micros;
}

function completeness(nutrition: NutritionData): number {
  let filled = 0;
  const macros = [
    nutrition.calories,
    nutrition.protein,
    nutrition.carbs,
    nutrition.fat,
  ];
  filled += macros.filter((v) => v !== null).length;
  filled += Object.keys(nutrition.micronutrients).length;
  return filled;
}

function countMissingCore(nutriments: Record<string, number>): number {
  let missing = 0;
  for (const key of CORE_NUTRIENT_KEYS) {
    if (nutriments[key] === undefined || nutriments[key] === null) missing++;
  }
  return missing;
}

/** Primary name, then the Romanian / English / generic names (OFF often fills only one). */
function productName(p: OFFProductFull & { product_name_ro?: string; product_name_en?: string; generic_name?: string }): string {
  for (const n of [p.product_name, p.product_name_ro, p.product_name_en, p.generic_name]) {
    if (n && n.trim()) return n.trim();
  }
  return "";
}

function mapProduct(p: OFFProductFull, nameFallback?: string): NutritionSearchResult {
  const nutrition = extractNutrition(p.nutriments ?? {});
  const ncs = computeNCS(p);
  const category = classifyByCategories(p.categories_tags ?? []);

  return {
    name: productName(p) || nameFallback || "",
    brand: p.brands || null,
    source: "openfoodfacts" as const,
    barcode: p.code || null,
    nutrition,
    completeness: completeness(nutrition),
    confidenceScore: Math.round(ncs * 100) / 100,
    category,
  };
}

// ---- Search (Search-a-licious) -------------------------------------------------------------------
// The legacy cgi/search.pl endpoint answered ~80% of requests with a fast 503, so search uses OFF's
// Search-a-licious API. It does NOT return nutrition_data_per, ingredients_text or image_nutrition_url
// (asking for them via `fields` is ignored); categories_tags and the *_100g nutriments are returned.

const OFF_SEARCH_URL = "https://search.openfoodfacts.org/search";
const ROMANIA_TERM = 'countries_tags:"en:romania"';
const MIN_RO_RESULTS = 3;
const SEARCH_PAGE_SIZE = 15;

const OFF_SEARCH_FIELDS = [
  "code",
  "product_name",
  "product_name_ro",
  "product_name_en",
  "generic_name",
  "brands",
  "nutriments",
  "lang",
  "countries_tags",
  "completeness",
  "last_modified_t",
  "categories_tags",
].join(",");

/**
 * Makes user input safe inside a Lucene-style query: every operator/special character becomes a
 * space and the bare boolean words are dropped, so input cannot add clauses, fields or phrases.
 */
export function sanitizeSearchQuery(input: string): string {
  return input
    .replace(/[+\-&|!(){}[\]^"~*?:\\/<>=]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(AND|OR|NOT|TO)$/.test(w))
    .join(" ");
}

interface SearchHit {
  code?: string;
  product_name?: string;
  product_name_ro?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string[] | string;
  nutriments?: Record<string, number>;
  lang?: string;
  countries_tags?: string[];
  completeness?: number;
  last_modified_t?: number;
  categories_tags?: string[];
}

/** Hit -> the OFFProductFull shape mapProduct / computeNCS already understand. */
export function hitToProduct(h: SearchHit): OFFProductWithQuantity {
  const nutriments: Record<string, number> = { ...(h.nutriments ?? {}) };
  // Some products only carry kJ; derive kcal so they are not rejected as missing a core nutrient.
  if (nutriments["energy-kcal_100g"] === undefined && Number.isFinite(nutriments["energy-kj_100g"])) {
    nutriments["energy-kcal_100g"] = Math.round((nutriments["energy-kj_100g"] / 4.184) * 10) / 10;
  }
  const brands = Array.isArray(h.brands) ? h.brands.join(", ") : h.brands;
  return {
    product_name: h.product_name,
    product_name_ro: h.product_name_ro,
    product_name_en: h.product_name_en,
    generic_name: h.generic_name,
    brands: brands || undefined,
    code: h.code,
    lang: h.lang,
    nutriments,
    countries_tags: h.countries_tags,
    completeness: h.completeness,
    last_modified_t: h.last_modified_t,
    categories_tags: h.categories_tags,
    searchIndex: true,
  };
}

function keepProduct(p: OFFProductFull): boolean {
  if (!productName(p) || !p.nutriments) return false;
  if (p.nutrition_data_per && p.nutrition_data_per !== "100g") return false;
  if (countMissingCore(p.nutriments) > 2) return false;
  return true;
}

async function fetchHits(q: string): Promise<NutritionSearchResult[]> {
  const url =
    `${OFF_SEARCH_URL}?q=${encodeURIComponent(q)}` +
    `&page_size=${SEARCH_PAGE_SIZE}&fields=${OFF_SEARCH_FIELDS}`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": OFF_USER_AGENT } });
  if (!res.ok) throw new SourceError(`Open Food Facts search answered ${res.status}`);
  const data = await res.json();
  const hits: SearchHit[] = Array.isArray(data?.hits) ? data.hits : [];
  return hits.map(hitToProduct).filter(keepProduct).map((p) => mapProduct(p));
}

function mergeByBarcode(
  first: NutritionSearchResult[],
  second: NutritionSearchResult[]
): NutritionSearchResult[] {
  const seen = new Set(first.map((r) => r.barcode).filter(Boolean));
  return [...first, ...second.filter((r) => !r.barcode || !seen.has(r.barcode))];
}

/**
 * Romania first; when that yields fewer than 3 usable products, one more query without the country
 * term is merged in (de-duplicated by barcode). Throws SourceError when the Romania query fails. A
 * failing fallback returns the Romania results flagged `complete: false` (shown, never cached).
 */
export async function searchOffUncached(query: string): Promise<SourceOutcome<NutritionSearchResult>> {
  const clean = sanitizeSearchQuery(query);
  if (!clean) return { results: [], complete: true };

  const ro = await fetchHits(`${clean} ${ROMANIA_TERM}`);
  if (ro.length >= MIN_RO_RESULTS) return { results: ro, complete: true };

  try {
    const global = await fetchHits(clean);
    return { results: mergeByBarcode(ro, global), complete: true };
  } catch {
    return { results: ro, complete: false };
  }
}

export const offSearchCache = createTtlCache<NutritionSearchResult[]>();
export const searchOpenFoodFacts = withSourceCache("off", offSearchCache, searchOffUncached);

function toBaseUnit(
  value: number,
  rawUnit: string
): { quantity: number; unit: "g" | "ml" } | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const u = rawUnit.trim().toLowerCase();
  switch (u) {
    case "g":
      return { quantity: value, unit: "g" };
    case "kg":
      return { quantity: value * 1000, unit: "g" };
    case "ml":
      return { quantity: value, unit: "ml" };
    case "cl":
      return { quantity: value * 10, unit: "ml" };
    case "l":
      return { quantity: value * 1000, unit: "ml" };
    default:
      return null;
  }
}

function parsePackageSize(
  p: OFFProductWithQuantity
): { quantity: number; unit: "g" | "ml" } | null {
  const qty = Number(p.product_quantity);
  if (p.product_quantity !== undefined && p.product_quantity !== "" && p.product_quantity_unit) {
    const parsed = toBaseUnit(qty, p.product_quantity_unit);
    if (parsed) return parsed;
  }
  if (p.quantity) {
    const m = p.quantity.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)(?![a-z])/i);
    if (m) return toBaseUnit(parseFloat(m[1].replace(",", ".")), m[2]);
  }
  return null;
}

const MAX_SERVING = 2000;

/** One serving as g/ml. Prefers OFF's numeric `serving_quantity`, else parses the "30 g" label. */
export function parseServing(
  p: Pick<OFFProductWithQuantity, "serving_size" | "serving_quantity" | "serving_quantity_unit">
): { size: number; unit: "g" | "ml" | null; label: string | null } | null {
  const label = p.serving_size?.trim().slice(0, 60) || null;
  const qty = Number(p.serving_quantity);
  if (p.serving_quantity !== undefined && p.serving_quantity !== "" && qty > 0 && qty <= MAX_SERVING) {
    const unit = p.serving_quantity_unit?.trim().toLowerCase();
    return { size: qty, unit: unit === "ml" ? "ml" : unit === "g" ? "g" : null, label };
  }
  const m = label?.match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)(?![a-z])/i);
  if (m) {
    const parsed = toBaseUnit(parseFloat(m[1].replace(",", ".")), m[2]);
    if (parsed && parsed.quantity <= MAX_SERVING) {
      return { size: parsed.quantity, unit: parsed.unit, label };
    }
  }
  return null;
}

const LIQUID_CATEGORY = /^en:(beverages?|drinks?|waters?|juices?|sodas?|milks?|plant-based-milks?|dairy-drinks?|beers?|wines?|spirits|liqueurs?|energy-drinks?|teas?-based-beverages?)$/;

/**
 * The unit the per-100 values refer to. Explicit package / serving units win; otherwise liquid
 * categories mean ml. With no evidence we return null instead of assuming grams (a drink stored
 * as grams would log the wrong amount), and the caller treats the product as incomplete.
 */
export function inferUnit(
  packageUnit: "g" | "ml" | null | undefined,
  servingUnit: "g" | "ml" | null | undefined,
  categories: string[] | undefined
): "g" | "ml" | null {
  if (packageUnit) return packageUnit;
  if (servingUnit) return servingUnit;
  if ((categories ?? []).some((c) => LIQUID_CATEGORY.test(c))) return "ml";
  return null;
}

/** Thrown when Open Food Facts could not answer (rate limit, outage), as opposed to "no such product". */
export class OffUnavailableError extends Error {}

export async function lookupBarcode(code: string): Promise<BarcodeLookup | null> {
  const res = await fetch(
    `${OFF_PRODUCT_URL}/${encodeURIComponent(code)}?fields=${OFF_BARCODE_FIELDS}`,
    {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": OFF_USER_AGENT },
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new OffUnavailableError(`Open Food Facts answered ${res.status}`);

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p: OFFProductWithQuantity = data.product;
  const result = mapProduct({ ...p, code });
  result.brand = p.brands?.split(",")[0]?.trim() || null;

  const nutriments = p.nutriments ?? {};
  const perServingOnly =
    (!!p.nutrition_data_per && p.nutrition_data_per !== "100g") ||
    nutriments["energy-kcal_100g"] === undefined;

  const packageSize = parsePackageSize(p);
  const serving = parseServing(p);
  return {
    result,
    packageSize,
    serving: serving ? { size: serving.size, label: serving.label } : null,
    unit: inferUnit(packageSize?.unit, serving?.unit, p.categories_tags),
    perServingOnly,
  };
}
