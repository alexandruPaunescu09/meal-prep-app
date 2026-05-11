import { NutritionSearchResult, NutritionData } from "@/lib/supabase/types";
import { computeNCS, OFFProductFull } from "./confidence";
import { classifyByCategories } from "./classification";

const OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl";
const OFF_BARCODE_URL = "https://world.openfoodfacts.org/api/v0/product";

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
    .map((p) => {
      const nutrition = extractNutrition(p.nutriments!);
      const ncs = computeNCS(p);
      const categories = p.categories_tags ?? [];
      const category = classifyByCategories(categories);

      return {
        name: p.product_name!,
        brand: p.brands || null,
        source: "openfoodfacts" as const,
        barcode: p.code || null,
        nutrition,
        completeness: completeness(nutrition),
        confidenceScore: Math.round(ncs * 100) / 100,
        category,
      };
    });
}

export async function searchByBarcode(
  barcode: string
): Promise<NutritionSearchResult | null> {
  const res = await fetch(`${OFF_BARCODE_URL}/${barcode}.json`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;

  const p: OFFProductFull = data.product;
  if (!p.nutriments) return null;

  const nutrition = extractNutrition(p.nutriments);
  const ncs = computeNCS(p);
  const categories = p.categories_tags ?? [];
  const category = classifyByCategories(categories);

  return {
    name: p.product_name || barcode,
    brand: p.brands || null,
    source: "openfoodfacts",
    barcode: barcode,
    nutrition,
    completeness: completeness(nutrition),
    confidenceScore: Math.round(ncs * 100) / 100,
    category,
  };
}
