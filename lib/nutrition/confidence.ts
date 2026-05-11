import { classifyByCategories } from "./classification";

export interface OFFProductFull {
  product_name?: string;
  brands?: string;
  code?: string;
  lang?: string;
  nutriments?: Record<string, number>;
  countries_tags?: string[];
  nutrition_data_per?: string;
  completeness?: number;
  last_modified_t?: number;
  image_nutrition_url?: string;
  ingredients_text?: string;
  categories_tags?: string[];
}

const CORE_NUTRIENTS = [
  "energy-kcal_100g",
  "fat_100g",
  "carbohydrates_100g",
  "sugars_100g",
  "proteins_100g",
  "salt_100g",
] as const;

const EXPECTED_RANGES: Record<
  string,
  { protein: [number, number]; fat: [number, number]; carbs: [number, number] }
> = {
  protein_source: { protein: [15, 35], fat: [0, 20], carbs: [0, 5] },
  dairy: { protein: [3, 12], fat: [0, 15], carbs: [3, 15] },
  grains: { protein: [5, 15], fat: [1, 10], carbs: [50, 80] },
  fruits: { protein: [0, 3], fat: [0, 2], carbs: [5, 25] },
  vegetables: { protein: [0, 5], fat: [0, 2], carbs: [2, 15] },
  fats_oils: { protein: [0, 1], fat: [80, 100], carbs: [0, 1] },
  nuts_seeds: { protein: [10, 30], fat: [40, 70], carbs: [5, 30] },
};

const CATEGORY_TO_RANGE: Record<string, string> = {
  "en:meats": "protein_source",
  "en:poultries": "protein_source",
  "en:fishes": "protein_source",
  "en:eggs": "protein_source",
  "en:dairies": "dairy",
  "en:milks": "dairy",
  "en:cheeses": "dairy",
  "en:cereals-and-potatoes": "grains",
  "en:breads": "grains",
  "en:rices": "grains",
  "en:pastas": "grains",
  "en:fruits": "fruits",
  "en:fresh-fruits": "fruits",
  "en:vegetables": "vegetables",
  "en:fresh-vegetables": "vegetables",
  "en:fats": "fats_oils",
  "en:oils": "fats_oils",
  "en:plant-oils": "fats_oils",
  "en:nuts": "nuts_seeds",
  "en:seeds": "nuts_seeds",
};

export function computeNCS(product: OFFProductFull): number {
  const completenessScore = ncsCompleteness(product);
  const verificationScore = ncsVerification(product);
  const freshnessScore = ncsFreshness(product);
  const consistencyScore = ncsScientificConsistency(product);
  const contextScore = ncsContextAccuracy(product);

  return (
    completenessScore * 0.3 +
    verificationScore * 0.2 +
    freshnessScore * 0.15 +
    consistencyScore * 0.2 +
    contextScore * 0.15
  );
}

function ncsCompleteness(product: OFFProductFull): number {
  const n = product.nutriments ?? {};
  let filled = 0;
  for (const key of CORE_NUTRIENTS) {
    if (n[key] !== undefined && n[key] !== null) filled++;
  }
  let score = filled / CORE_NUTRIENTS.length;

  if (n["fiber_100g"] !== undefined) score = Math.min(1, score + 0.05);
  if (n["saturated-fat_100g"] !== undefined) score = Math.min(1, score + 0.05);

  return score;
}

function ncsVerification(product: OFFProductFull): number {
  let score = 0;
  if (product.image_nutrition_url) score += 0.4;
  if (product.ingredients_text) score += 0.35;
  if (product.brands) score += 0.25;
  return score;
}

function ncsFreshness(product: OFFProductFull): number {
  if (!product.last_modified_t) return 0.5;

  const nowSec = Date.now() / 1000;
  const ageDays = (nowSec - product.last_modified_t) / 86400;
  const ageYears = ageDays / 365;

  if (ageYears <= 2) return 1.0;
  if (ageYears <= 5) return 0.7;
  return Math.max(0.3, 1.0 - ageYears * 0.12);
}

function ncsScientificConsistency(product: OFFProductFull): number {
  const n = product.nutriments ?? {};
  const protein = n["proteins_100g"];
  const fat = n["fat_100g"];
  const carbs = n["carbohydrates_100g"];
  const calories = n["energy-kcal_100g"];

  if (protein === undefined || fat === undefined || carbs === undefined) {
    return 0.5;
  }

  let score = 1.0;

  // Macros should not sum > 100g per 100g of product
  if (protein + fat + carbs > 105) {
    score -= 0.4;
  }

  // Calories should roughly match: protein*4 + carbs*4 + fat*9
  if (calories !== undefined) {
    const expected = protein * 4 + carbs * 4 + fat * 9;
    const ratio = expected > 0 ? calories / expected : 1;
    if (ratio < 0.7 || ratio > 1.4) {
      score -= 0.3;
    } else if (ratio < 0.85 || ratio > 1.2) {
      score -= 0.1;
    }
  }

  // Check against category-specific expected ranges
  const categories = product.categories_tags ?? [];
  let rangeKey: string | null = null;
  for (const cat of categories) {
    if (CATEGORY_TO_RANGE[cat]) {
      rangeKey = CATEGORY_TO_RANGE[cat];
      break;
    }
  }

  if (rangeKey && EXPECTED_RANGES[rangeKey]) {
    const range = EXPECTED_RANGES[rangeKey];
    if (protein < range.protein[0] * 0.5 || protein > range.protein[1] * 2) {
      score -= 0.15;
    }
    if (fat < range.fat[0] * 0.5 || fat > range.fat[1] * 2) {
      score -= 0.1;
    }
    if (carbs < range.carbs[0] * 0.5 || carbs > range.carbs[1] * 2) {
      score -= 0.1;
    }
  }

  return Math.max(0, score);
}

function ncsContextAccuracy(product: OFFProductFull): number {
  let score = 0;

  const countries = product.countries_tags ?? [];
  if (countries.includes("en:romania")) score += 0.4;

  const per = product.nutrition_data_per;
  if (!per || per === "100g") score += 0.3;

  const categories = product.categories_tags ?? [];
  const classification = classifyByCategories(categories);
  if (classification === "primary") score += 0.3;
  else if (classification === "lightly_processed") score += 0.2;
  else score += 0.05;

  return score;
}
