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

  const combined = [...usda, ...off];
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

  combined.sort(
    (a, b) =>
      computeRank(b, queryWords, queryLower) -
      computeRank(a, queryWords, queryLower)
  );

  return combined.slice(0, 15);
}

function computeRank(
  result: NutritionSearchResult,
  queryWords: string[],
  queryLower: string
): number {
  let score = 0;

  // Confidence score is the primary signal (0–1 → 0–45 points)
  score += result.confidenceScore * 45;

  // Name relevance (0–35 points)
  score += nameRelevanceScore(result.name, queryWords, queryLower);

  // Source authority bonus: USDA gets flat boost over OFF
  if (result.source === "usda") score += 10;

  // Category penalty: composites rank lower unless specifically searched
  if (result.category === "composite") {
    const nameMatchesQuery = nameRelevanceScore(result.name, queryWords, queryLower) >= 25;
    if (!nameMatchesQuery) score -= 15;
  }

  return score;
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
