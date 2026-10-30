// Server-only module: imported exclusively from route handlers.
import { fetchPage, type FetchFailureReason, type FetchPageDeps } from "./fetch-page";
import { extractJsonLdRecipe, type ExtractedRecipe } from "./json-ld";
import { extractPageText } from "./page-text";

export type { ExtractedRecipe, ExtractedIngredientLine } from "./json-ld";
export type { PageText } from "./page-text";
export type { FetchFailureReason, FetchPageDeps, FetchPageResult } from "./fetch-page";
export { fetchPage } from "./fetch-page";
export { extractJsonLdRecipe } from "./json-ld";
export { extractPageText } from "./page-text";

export type ExtractFromHtmlResult =
  | { source: "json-ld"; recipe: ExtractedRecipe }
  | { source: "page-text"; title: string; text: string };

export type ExtractFromUrlResult =
  | ({ ok: true; finalUrl: string } & ExtractFromHtmlResult)
  | { ok: false; reason: FetchFailureReason; status?: number; detail?: string };

/** Recipe JSON-LD when the page has a usable one, else the readable page text. */
export function extractRecipeFromHtml(html: string): ExtractFromHtmlResult {
  const recipe = extractJsonLdRecipe(html);
  if (recipe && (recipe.ingredients.length > 0 || recipe.instructions.length > 0)) {
    return { source: "json-ld", recipe };
  }
  const { title, text } = extractPageText(html);
  return { source: "page-text", title, text };
}

export async function extractRecipeFromUrl(url: string, deps?: FetchPageDeps): Promise<ExtractFromUrlResult> {
  const page = await fetchPage(url, deps);
  if (!page.ok) return page;
  return { ok: true, finalUrl: page.finalUrl, ...extractRecipeFromHtml(page.html) };
}
