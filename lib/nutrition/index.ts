import { NutritionSearchResult } from "@/lib/supabase/types";
import { searchOpenFoodFacts } from "./open-food-facts";
import { fold, toUsdaQuery } from "./ro-en-terms";
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
  /** The English query USDA was asked (Romanian input translated by the built-in word list); null when the query was passed unchanged. */
  usdaQuery: string | null;
}

export async function searchNutrition(query: string): Promise<NutritionSearchResponse> {
  const usdaEnabled = isUsdaEnabled();
  // OFF keeps the original query (Romanian products); USDA only understands English.
  const usda = toUsdaQuery(query);
  if (usda.translated && usda.unmapped.length > 0) {
    console.info("nutrition search: unmapped RO words", usda.unmapped);
  }
  const [offResult, usdaResult] = await Promise.allSettled([
    searchOpenFoodFacts(query),
    usdaEnabled ? searchUSDA(usda.query) : Promise.resolve({ results: [], complete: true }),
  ]);

  const sources: NutritionSearchSources = {
    off: offResult.status === "fulfilled" && offResult.value.complete ? "ok" : "error",
    // "error" also covers one of USDA's two requests failing (partial results, not cached).
    usda: !usdaEnabled ? "disabled" : usdaResult.status === "fulfilled" && usdaResult.value.complete ? "ok" : "error",
  };
  if (offResult.status === "rejected") console.error("OFF search failed:", offResult.reason);
  if (usdaResult.status === "rejected") console.error("USDA search failed:", usdaResult.reason);

  const offResults = offResult.status === "fulfilled" ? offResult.value.results : [];
  const usdaResults = usdaResult.status === "fulfilled" ? usdaResult.value.results : [];

  // Brand query: Romanian words were recognised AND others were not (usually a brand: "lapte zuzu").
  // The brand is dropped for USDA, so its generic hit must not outrank the product of that brand.
  const brandQuery = usda.translated && usda.unmapped.length > 0;
  const rankWith = (results: NutritionSearchResult[], q: string, opts: RankOptions) => {
    const lower = q.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 1);
    return results.map((r) => ({ r, score: computeRank(r, words, lower, opts) }));
  };
  // Each source is ranked on name relevance against the query it was actually asked.
  const ranked = [
    ...rankWith(usdaResults, usda.query, { brandQuery }),
    ...rankWith(offResults, query, { brandQuery, unmapped: usda.unmapped }),
  ];
  ranked.sort((a, b) => b.score - a.score || compareStable(a.r, b.r));

  return {
    results: ranked.slice(0, 15).map((x) => x.r),
    sources,
    usdaQuery: usda.translated ? usda.query : null,
  };
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

export interface RankOptions {
  /** The query had words the Romanian list does not know (usually a brand). */
  brandQuery?: boolean;
  /** Folded unknown words, matched against an OFF product's name + brand. */
  unmapped?: string[];
}

/** OFF product that carries every unknown query word in its name or brand: must beat generic USDA hits. */
const BRAND_MATCH_BONUS = 40;
/** USDA generic-entry bonuses (name starts with the query words, e.g. "Rice, white, ..."). */
const GENERIC_FULL_BONUS = 10;
const GENERIC_HEAD_BONUS = 5;

export function computeRank(
  result: NutritionSearchResult,
  queryWords: string[],
  queryLower: string,
  opts: RankOptions = {}
): number {
  let score = 0;
  // OFF relevance also counts the brand, so "zuzu" in `brands` matches.
  const text = result.source === "openfoodfacts" && result.brand ? `${result.name} ${result.brand}` : result.name;

  // Confidence score is the primary signal (0–1 → 0–45 points)
  score += result.confidenceScore * 45;

  // Name relevance (0–35 points)
  const relevance = nameRelevanceScore(text, queryWords, queryLower);
  score += relevance;

  if (result.source === "usda") {
    // Source authority bonus: USDA gets flat boost over OFF. Dropped for brand queries, where USDA only
    // saw the generic words.
    if (!opts.brandQuery) {
      score += 10;
      // Generic (unbranded) entries named like the query ("Rice, white, ...") beat dishes and
      // look-alikes ("Adobo, with rice", "Rice crackers") that the relevance score cannot tell apart.
      if (!result.brand) {
        score += genericNameBonus(result.name, queryWords);
        score += plainFoodAdjustment(result.name, queryWords);
      }
    }
  } else if (opts.brandQuery && opts.unmapped?.length) {
    const haystack = fold(text);
    if (opts.unmapped.every((w) => haystack.includes(w))) score += BRAND_MATCH_BONUS;
  }

  // Category penalty: composites rank lower unless specifically searched
  if (result.category === "composite") {
    const nameMatchesQuery = relevance >= 25;
    if (!nameMatchesQuery) score -= 15;
  }

  return score;
}

const sameWord = (token: string, word: string) =>
  token === word || token + "s" === word || token === word + "s" || token === word + "es";

/**
 * USDA names the generic food first, comma separated ("Chicken, breast, boneless, skinless, raw").
 * Leading comma segments made only of query words: all query words covered = full bonus, only the first
 * segment = head bonus. "Adobo, with rice" and "Rice crackers" get none.
 */
function genericNameBonus(name: string, queryWords: string[]): number {
  const words = queryWords.map((w) => fold(w));
  if (words.length === 0) return 0;
  const segments = fold(name.replace(/\([^)]*\)/g, " ")).split(",");
  const covered = new Set<string>();
  let firstOk = false;
  for (let i = 0; i < segments.length; i++) {
    const tokens = segments[i].match(/[a-z]+/g) ?? [];
    const ok = tokens.length > 0 && tokens.every((t) => words.some((w) => sameWord(t, w)));
    if (!ok) break;
    if (i === 0) firstOk = true;
    for (const t of tokens) for (const w of words) if (sameWord(t, w)) covered.add(w);
  }
  if (covered.size === words.length) return GENERIC_FULL_BONUS;
  return firstOk ? GENERIC_HEAD_BONUS : 0;
}

const PROCESSED_WORDS = /\b(dried|dehydrated|powder|flour|bran|oil|juice|canned|frozen|mix|flavor|flavored|sliced|babyfood|infant)\b/;

/**
 * Small nudge between USDA's generic entries: the plain food ("Rice, ..., raw", "Milk, whole, ...") over
 * derivatives ("Egg, white, dried", "Bananas, dehydrated") unless the query asked for that derivative.
 */
function plainFoodAdjustment(name: string, queryWords: string[]): number {
  const lower = fold(name);
  const asked = queryWords.join(" ");
  let adj = 0;
  if (/\braw\b/.test(lower)) adj += 4;
  if (/(^|, )whole\b/.test(lower)) adj += 2;
  const m = PROCESSED_WORDS.exec(lower);
  if (m && !asked.includes(m[1])) adj -= 4;
  // Fewer comma segments = more generic ("Egg, whole, raw, fresh" over "Egg, duck, whole, fresh, raw").
  adj -= Math.max(0, lower.split(",").length - 4) * 1.5;
  return adj;
}

function nameRelevanceScore(
  name: string,
  queryWords: string[],
  queryLower: string
): number {
  // "Chicken, breast, raw" must match "chicken breast" like "Chicken breast, raw" does.
  const nameLower = fold(name).replace(/[,()]/g, " ").replace(/\s+/g, " ");
  queryLower = fold(queryLower);
  queryWords = queryWords.map(fold);

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
