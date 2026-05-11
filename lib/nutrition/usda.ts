import { NutritionSearchResult, NutritionData } from "@/lib/supabase/types";

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

interface USDANutrient {
  nutrientId: number;
  value: number;
}

interface USDAFood {
  description: string;
  brandOwner?: string;
  fdcId: number;
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
        // Convert sodium (mg) to salt (g): salt = sodium * 2.5 / 1000
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

export async function searchUSDA(
  query: string
): Promise<NutritionSearchResult[]> {
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey || apiKey === "your-usda-key") return [];

  const url = `${USDA_SEARCH_URL}?query=${encodeURIComponent(query)}&api_key=${apiKey}&pageSize=10`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];

  const data = await res.json();
  const foods: USDAFood[] = data.foods ?? [];

  return foods
    .map((food) => {
      const nutrition = extractNutrition(food.foodNutrients);
      return {
        name: food.description,
        brand: food.brandOwner || null,
        source: "usda" as const,
        barcode: null,
        nutrition,
        completeness: completeness(nutrition),
      };
    })
    .filter((r) => r.completeness >= 3);
}
