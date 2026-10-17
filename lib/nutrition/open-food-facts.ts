import { NutritionSearchResult, NutritionData } from "@/lib/supabase/types";
import { computeNCS, OFFProductFull } from "./confidence";
import { classifyByCategories } from "./classification";

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product";
const OFF_USER_AGENT = "MealPrepApp/1.0 (meal-prep admin app)";

const OFF_FIELDS = [
  "product_name",
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
].join(",");

interface OFFProductWithQuantity extends OFFProductFull {
  product_quantity?: number | string;
  product_quantity_unit?: string;
  quantity?: string;
}

export interface BarcodeLookup {
  result: NutritionSearchResult;
  packageSize: { quantity: number; unit: "g" | "ml" } | null;
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

function extractMicros(n: Record<string, number>): Record<string, number> {
  const micros: Record<string, number> = {};
  const mapping: Record<string, string> = {
    iron_100g: "iron_mg",
    calcium_100g: "calcium_mg",
    potassium_100g: "potassium_mg",
    magnesium_100g: "magnesium_mg",
    zinc_100g: "zinc_mg",
    "vitamin-a_100g": "vitamin_a_ug",
    "vitamin-c_100g": "vitamin_c_mg",
    "vitamin-d_100g": "vitamin_d_ug",
    "vitamin-e_100g": "vitamin_e_mg",
    "vitamin-k_100g": "vitamin_k_ug",
    phosphorus_100g: "phosphorus_mg",
    selenium_100g: "selenium_ug",
    folate_100g: "folate_ug",
  };

  for (const [offKey, ourKey] of Object.entries(mapping)) {
    const val = n[offKey];
    if (val !== undefined && val !== null && val > 0) {
      micros[ourKey] = val;
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

function mapProduct(p: OFFProductFull, nameFallback?: string): NutritionSearchResult {
  const nutrition = extractNutrition(p.nutriments ?? {});
  const ncs = computeNCS(p);
  const category = classifyByCategories(p.categories_tags ?? []);

  return {
    name: p.product_name || nameFallback || "",
    brand: p.brands || null,
    source: "openfoodfacts" as const,
    barcode: p.code || null,
    nutrition,
    completeness: completeness(nutrition),
    confidenceScore: Math.round(ncs * 100) / 100,
    category,
  };
}

export async function searchOpenFoodFacts(
  query: string
): Promise<NutritionSearchResult[]> {
  const url =
    `${OFF_SEARCH_URL}?search_terms=${encodeURIComponent(query)}` +
    `&json=1&page_size=15` +
    `&tagtype_0=countries&tag_contains_0=contains&tag_0=romania` +
    `&fields=${OFF_FIELDS}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];

  const data = await res.json();
  const products: OFFProductFull[] = data.products ?? [];

  return products
    .filter((p) => {
      if (!p.product_name || !p.nutriments) return false;
      if (p.nutrition_data_per && p.nutrition_data_per !== "100g") return false;
      if (countMissingCore(p.nutriments) > 2) return false;
      return true;
    })
    .map((p) => mapProduct(p));
}

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

export async function lookupBarcode(code: string): Promise<BarcodeLookup | null> {
  const res = await fetch(
    `${OFF_PRODUCT_URL}/${encodeURIComponent(code)}?fields=${OFF_BARCODE_FIELDS}`,
    {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": OFF_USER_AGENT },
    }
  );
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p: OFFProductWithQuantity = data.product;
  const result = mapProduct({ ...p, code });
  result.brand = p.brands?.split(",")[0]?.trim() || null;

  const nutriments = p.nutriments ?? {};
  const perServingOnly =
    (!!p.nutrition_data_per && p.nutrition_data_per !== "100g") ||
    nutriments["energy-kcal_100g"] === undefined;

  return { result, packageSize: parsePackageSize(p), perServingOnly };
}
