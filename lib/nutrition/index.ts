import { NutritionSearchResult } from "@/lib/supabase/types";
import { searchOpenFoodFacts } from "./open-food-facts";
import { searchUSDA } from "./usda";

export async function searchNutrition(
  query: string
): Promise<NutritionSearchResult[]> {
  // Search Open Food Facts first (best for branded products)
  const offResults = await searchOpenFoodFacts(query);

  // If fewer than 3 useful results, also search USDA (better for raw ingredients)
  let usdaResults: NutritionSearchResult[] = [];
  if (offResults.length < 3) {
    usdaResults = await searchUSDA(query);
  }

  // Merge and sort by completeness (most nutrition data = highest rank)
  const combined = [...offResults, ...usdaResults];
  combined.sort((a, b) => b.completeness - a.completeness);

  return combined.slice(0, 15);
}
