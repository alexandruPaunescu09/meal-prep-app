import { NutritionSearchResult } from "@/lib/supabase/types";
import { searchOpenFoodFacts } from "./open-food-facts";
import { searchUSDA } from "./usda";

export async function searchNutrition(
  query: string
): Promise<NutritionSearchResult[]> {
  const [offResult, usdaResult] = await Promise.allSettled([
    searchOpenFoodFacts(query),
    searchUSDA(query),
  ]);

  const off = offResult.status === "fulfilled" ? offResult.value : [];
  const usda = usdaResult.status === "fulfilled" ? usdaResult.value : [];

  const combined = [...off, ...usda];
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

  combined.sort(
    (a, b) =>
      computeScore(b, queryWords, queryLower) -
      computeScore(a, queryWords, queryLower)
  );

  return combined.slice(0, 15);
}

function computeScore(
  result: NutritionSearchResult,
  queryWords: string[],
  queryLower: string
): number {
  let score = 0;
  score += sourceAuthorityScore(result);
  score += nameRelevanceScore(result.name, queryWords, queryLower);
  score += Math.min(result.completeness * 1.5, 25);
  return score;
}

function sourceAuthorityScore(result: NutritionSearchResult): number {
  if (result.source === "usda") {
    const dt = result.dataType;
    if (dt === "Foundation") return 40;
    if (dt === "SR Legacy") return 35;
    if (dt === "Survey (FNDDS)") return 30;
    return 20;
  }
  return 10;
}

function nameRelevanceScore(
  name: string,
  queryWords: string[],
  queryLower: string
): number {
  const nameLower = name.toLowerCase();

  if (nameLower.includes(queryLower)) return 35;

  if (queryWords.length === 0) return 0;

  let matchedWords = 0;
  for (const word of queryWords) {
    if (nameLower.includes(word)) {
      matchedWords++;
    }
  }

  return Math.round((matchedWords / queryWords.length) * 30);
}
