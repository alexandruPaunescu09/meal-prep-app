import { NutritionSearchResult } from "@/lib/supabase/types";
import { searchOpenFoodFacts } from "./open-food-facts";
import { isUsdaEnabled, searchUSDA } from "./usda";

export interface NutritionSearchSources {
  /** "disabled" = USDA_API_KEY missing or still the placeholder. */
  usda: "ok" | "error" | "disabled";
  /** "error" also covers a partial answer (Romania ok, global fallback failed). */
  off: "ok" | "error";
}

export interface NutritionSearchResponse {
  results: NutritionSearchResult[];
  sources: NutritionSearchSources;
}

export async function searchNutrition(query: string): Promise<NutritionSearchResponse> {
  const usdaEnabled = isUsdaEnabled();
  const [offResult, usdaResult] = await Promise.allSettled([
    searchOpenFoodFacts(query),
    usdaEnabled ? searchUSDA(query) : Promise.resolve({ results: [], complete: true }),
  ]);

  const sources: NutritionSearchSources = {
    off: offResult.status === "fulfilled" && offResult.value.complete ? "ok" : "error",
    usda: !usdaEnabled ? "disabled" : usdaResult.status === "fulfilled" ? "ok" : "error",
  };
  if (offResult.status === "rejected") console.error("OFF search failed:", offResult.reason);
  if (usdaResult.status === "rejected") console.error("USDA search failed:", usdaResult.reason);

  const off = offResult.status === "fulfilled" ? offResult.value.results : [];
  const usda = usdaResult.status === "fulfilled" ? usdaResult.value.results : [];

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 1);

  const ranked = [...usda, ...off].map((r) => ({
    r,
    score: computeRank(r, queryWords, queryLower),
  }));
  ranked.sort((a, b) => b.score - a.score || compareStable(a.r, b.r));

  return { results: ranked.slice(0, 15).map((x) => x.r), sources };
}

/** Stable tie-break so equal scores never reorder between identical searches: name, brand, barcode, source. */
export function compareStable(a: NutritionSearchResult, b: NutritionSearchResult): number {
  return (
    a.name.localeCompare(b.name, "en") ||
    (a.brand ?? "").localeCompare(b.brand ?? "", "en") ||
    (a.barcode ?? "").localeCompare(b.barcode ?? "") ||
    a.source.localeCompare(b.source)
  );
}

export function computeRank(
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
