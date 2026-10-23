import { NutritionSearchResult, NutritionData } from "@/lib/supabase/types";
import { containsCookedKeyword, queryRequestsCooked } from "./classification";
import { SourceError, fetchWithRetry } from "./http";
import { SourceOutcome, createTtlCache, withSourceCache } from "./search-cache";

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

interface USDANutrient {
  nutrientId: number;
  value: number;
}

interface USDAFood {
  description: string;
  brandOwner?: string;
  fdcId: number;
  dataType?: string;
  foodNutrients: USDANutrient[];
}

const NUTRIENT_MAP: Record<number, { key: string; macro: boolean }> = {
  1008: { key: "calories", macro: true },
  1003: { key: "protein", macro: true },
  1005: { key: "carbs", macro: true },
  1004: { key: "fat", macro: true },
  1079: { key: "fiber", macro: true },
  2000: { key: "sugar", macro: true },
  1258: { key: "sat_fat", macro: true },
  1093: { key: "sodium", macro: true },
  1087: { key: "calcium_mg", macro: false },
  1089: { key: "iron_mg", macro: false },
  1090: { key: "magnesium_mg", macro: false },
  1091: { key: "phosphorus_mg", macro: false },
  1092: { key: "potassium_mg", macro: false },
  1095: { key: "zinc_mg", macro: false },
  1106: { key: "vitamin_a_ug", macro: false },
  1162: { key: "vitamin_c_mg", macro: false },
  1110: { key: "vitamin_d_ug", macro: false },
  1109: { key: "vitamin_e_mg", macro: false },
  1185: { key: "vitamin_k_ug", macro: false },
  1178: { key: "vitamin_b12_ug", macro: false },
  1177: { key: "folate_ug", macro: false },
  1103: { key: "selenium_ug", macro: false },
};

const CONFIDENCE_BY_TYPE: Record<string, number> = {
  Foundation: 1.0,
  "SR Legacy": 0.97,
  "Survey (FNDDS)": 0.93,
  Branded: 0.85,
};

function extractNutrition(nutrients: USDANutrient[]): NutritionData {
  const macros: Record<string, number | null> = {
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    fiber: null,
    sugar: null,
    sat_fat: null,
    salt: null,
  };
  const micros: Record<string, number> = {};

  for (const n of nutrients) {
    const mapping = NUTRIENT_MAP[n.nutrientId];
    if (!mapping) continue;

    if (mapping.macro) {
      if (mapping.key === "sodium") {
        macros["salt"] = (n.value * 2.5) / 1000;
      } else {
        macros[mapping.key] = n.value;
      }
    } else {
      if (n.value > 0) {
        micros[mapping.key] = n.value;
      }
    }
  }

  return {
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    fiber: macros.fiber,
    sugar: macros.sugar,
    sat_fat: macros.sat_fat,
    salt: macros.salt,
    micronutrients: micros,
  };
}

function completeness(nutrition: NutritionData): number {
  let filled = 0;
  const macroValues = [
    nutrition.calories,
    nutrition.protein,
    nutrition.carbs,
    nutrition.fat,
  ];
  filled += macroValues.filter((v) => v !== null).length;
  filled += Object.keys(nutrition.micronutrients).length;
  return filled;
}

/** False when the key is missing or still the .env.example placeholder: USDA is "disabled". */
export function isUsdaEnabled(): boolean {
  const apiKey = process.env.USDA_API_KEY;
  return !!apiKey && apiKey !== "your-usda-key";
}

export const usdaSearchCache = createTtlCache<NutritionSearchResult[]>();

/**
 * Cached USDA search. Throws SourceError when BOTH requests fail; when only one fails the other's results
 * come back with `complete: false` (reported as an error by the caller, never cached).
 * Callers check isUsdaEnabled() first.
 */
export const searchUSDA = withSourceCache("usda", usdaSearchCache, (query: string) => searchUsdaUncached(query));

export async function searchUsdaUncached(query: string): Promise<SourceOutcome<NutritionSearchResult>> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) throw new SourceError("USDA key missing");

  // Two requests in parallel, merged by fdcId.
  // 1. The default request (no dataType filter, pageSize 15). A dataType filter containing "Survey (FNDDS)"
  //    makes USDA's gateway answer a random ~60% of requests with an nginx 400 (measured 8/8 ok without it,
  //    ~3/8 with it), so that type is only reached through this unfiltered request.
  // 2. Foundation + SR Legacy only (`dataType=Foundation,SR%20Legacy`, no parentheses: measured 8/8 ok).
  //    The unfiltered request is crowded by branded items ("RICE" x15) and dishes, so the generic raw entries
  //    ("Rice, white, long-grain, raw") never reach the pool. USDA's relevance order for this request is poor
  //    too (raw rice is ~55th of 141), hence the larger page; our own ranking picks the generic entries.
  const base = `${USDA_SEARCH_URL}?query=${encodeURIComponent(query)}&api_key=${apiKey}`;
  const settled = await Promise.allSettled([
    fetchUsdaFoods(`${base}&pageSize=15`),
    fetchUsdaFoods(`${base}&pageSize=100&dataType=Foundation,SR%20Legacy`, BIG_PAGE_TIMEOUT_MS),
  ]);
  const failed = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length === settled.length) throw failed[0].reason;
  for (const f of failed) console.error("USDA request failed:", f.reason);

  const seen = new Set<number>();
  const foods: USDAFood[] = [];
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const food of r.value) {
      if (seen.has(food.fdcId)) continue;
      seen.add(food.fdcId);
      foods.push(food);
    }
  }
  return { results: mapUsdaFoods(foods, query), complete: failed.length === 0 };
}

/** The pageSize-100 response is 1-3.5 MB (median ~0.9 s, max 1.8 s measured, one 4 s timeout seen): give it more room than the default 4 s. */
const BIG_PAGE_TIMEOUT_MS = 8000;

async function fetchUsdaFoods(url: string, timeoutMs?: number): Promise<USDAFood[]> {
  const res = await fetchWithRetry(url, {}, timeoutMs);
  if (!res.ok) throw new SourceError(`USDA answered ${res.status}`);
  const data = await res.json();
  return data.foods ?? [];
}

function mapUsdaFoods(foods: USDAFood[], query: string): NutritionSearchResult[] {
  const wantsCooked = queryRequestsCooked(query);

  return foods
    .filter((food) => {
      if (!wantsCooked && containsCookedKeyword(food.description)) {
        return false;
      }
      return true;
    })
    .map((food) => {
      const nutrition = extractNutrition(food.foodNutrients);
      const dt = food.dataType || "Branded";
      return {
        name: food.description,
        brand: food.brandOwner || null,
        source: "usda" as const,
        barcode: null,
        nutrition,
        completeness: completeness(nutrition),
        dataType: food.dataType || undefined,
        confidenceScore: CONFIDENCE_BY_TYPE[dt] ?? 0.85,
        category: food.brandOwner ? ("lightly_processed" as const) : ("primary" as const),
      };
    })
    .filter((r) => r.completeness >= 3);
}
