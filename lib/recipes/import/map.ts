// Server-only module: imported exclusively from route handlers.
import type Anthropic from "@anthropic-ai/sdk";
import { ClaudeError, callStructured, type ClaudeErrorMessages } from "@/lib/ai/claude";
import type { ExtractedRecipe } from "./json-ld";
import { postProcessRecipeLines, type CatalogAlias } from "./postprocess";
import { RecipeModelSchema, toModelLine } from "./schema";
import { RECIPE_ALIAS_STORE, type RecipeImportLine, type RecipeImportRecipe } from "./types";

export interface RecipeImageFile {
  name: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  base64: string;
}

export type RecipeMapInput =
  | { kind: "json-ld"; recipe: ExtractedRecipe }
  | { kind: "page-text"; title: string; text: string }
  | { kind: "text"; text: string }
  | { kind: "images"; files: RecipeImageFile[] };

export interface MapCatalogIngredient {
  id: string;
  name: string;
  brand?: string | null;
  unit: string;
  /** Added by RI-0a; optional so this compiles with or without that migration. */
  piece_weight_g?: number | null;
}

export interface MapCategory {
  slug: string;
  name: string;
}

export interface MapRecipeResult {
  recipe: RecipeImportRecipe;
  lines: RecipeImportLine[];
  model: string;
}

const MAX_STEPS = 40;

const RECIPE_ERRORS: ClaudeErrorMessages = {
  malformed: "The model's answer was cut off or malformed — try a shorter recipe or paste only the ingredients and steps",
  timeout: "Claude took too long to read this recipe — try again or paste the text instead",
  tooLong: "The recipe is too long to parse in one go; paste a shorter part",
  refusal: "The model refused to read this recipe",
};

const SYSTEM = `You turn a cooking recipe (from a web page, pasted text or screenshots; usually Romanian or English) into structured data and map each ingredient line onto the admin's ingredient catalog.

Output one entry in "lines" for EVERY printed ingredient line, in order, including section headers.

Per line:
- raw_text: the line as printed. raw_name: the ingredient name only (no amount, no preparation words like "tocat"), as printed.
- is_section_header: true for group headings such as "Pentru sos:", "Pentru blat", "For the dressing". They are NOT ingredients. For those set quantity -1, quantity_unit "none", suggested_unit "none", ingredient_id "", search_term "". Use "none" for quantity_unit/suggested_unit on any line without an amount too.
- optional: true for "după gust"/"dupa gust"/"to taste"/"as needed" lines and a pinch ("un vârf de cuțit", "un praf"). Pinches/to-taste lines have no real amount: quantity -1.
- ingredient_id: ONLY an id from the catalog below, never invent one. "" when there is no confident match. match_confidence: high (clearly the same ingredient), medium (probably), low (a guess), none when ingredient_id is "". An alias in the catalog that equals the printed name means that ingredient. Prefer the plain ingredient over a branded product unless the brand is stated. Match despite missing diacritics (faina = făină, ardei = ardei).
- original_amount / original_unit: what the source says (e.g. 2 and "linguri"); -1 and "" when absent. For a range such as "4-5" use the midpoint (4.5) here.
- quantity: the amount in quantity_unit. For a MATCHED ingredient quantity_unit MUST be that ingredient's catalog unit (g, ml or buc): for a buc ingredient give pieces; for a g/ml ingredient convert pieces/spoons/cups to grams or millilitres. When unmatched, quantity_unit is the natural unit of the ingredient (g solids, ml liquids, buc countable things) and quantity is in it.
- conversion_note: short remark when you converted something (e.g. "2 linguri = 30 ml × 0.92 g/ml"), else "".
- is_estimate: true when the amount is a guess: a range, a piece converted to grams with a typical weight, a size word ("mediu"), "o legătură", etc.
- search_term: the plain ENGLISH name of the ingredient for a nutrition database lookup (e.g. "carrot", "wheat flour", "sunflower oil"). Raw form unless the line says cooked/canned.
- suggested_unit: the unit to create the ingredient in if it is missing (g, ml or buc). suggested_category: a slug from the category list below that fits, "" if none.

Conversion table (use it; state it in conversion_note):
- linguriță/lingurita/tsp/teaspoon = 5 ml; lingură/lingura/tbsp/tablespoon = 15 ml; Romanian cană/ceașcă 250 ml; US cup 240 ml; "pahar" 200 ml; 1 kg = 1000 g; 1 l = 1000 ml; 1 dl = 100 ml.
- Densities: water/milk/stock ~1.0 g/ml; oil 0.92 g/ml; honey 1.4 g/ml; sour cream/yogurt ~1.03 g/ml; butter 1 tbsp = 14 g. Per US cup: all-purpose flour ~125 g, sugar ~200 g, brown sugar ~210 g, long-grain rice ~185 g, rolled oats ~90 g, grated cheese ~100 g. Per tablespoon: flour ~8 g, sugar ~12.5 g, salt ~18 g. Per teaspoon: salt ~6 g.
- Typical piece weights (when the catalog row shows no piece weight): medium onion ~110 g, garlic clove ~5 g (a head ~50 g), egg ~55 g, medium potato ~170 g, medium carrot ~60 g, medium tomato ~120 g, medium zucchini ~200 g, bell pepper ~150 g, lemon ~100 g (juice ~40 ml), slice of bread ~30 g. If the catalog row has a piece weight, use THAT for pieces → grams and still flag is_estimate only if the size is vague.

Romanian specifics: text often lacks diacritics (lingurite, faina, ouă/oua); "după gust"/"dupa gust" = to taste (optional); "un vârf de cuțit"/"varf de cutit" = a pinch; "o legătură" = a bunch (estimate); "4-5 linguri" = range → midpoint 4.5, is_estimate true; "1/2", "1 1/2" are fractions; "sau" alternatives: take the first, mention the other in conversion_note.

Recipe fields:
- name: the recipe's title, cleaned (no site name, no "reteta video" suffixes). portions: number of portions/servings stated (e.g. "4 portii"); 0 when not stated.
- steps: the cooking steps, concise, in YOUR OWN WORDS, in the language of the source (never copy sentences verbatim), at most 40 steps, no numbering, no marketing text. Empty list if the source has none.

Ignore ads, comments, navigation and unrelated text on pages. If the input contains no recipe at all, return an empty lines list and name "".`;

function catalogText(ingredients: MapCatalogIngredient[], aliases: CatalogAlias[]): string {
  const clean = (s: string) => s.replace(/\s*\|\s*/g, " ").trim();
  const byIng = new Map<string, Set<string>>();
  for (const a of aliases) {
    if (a.store.trim().toLowerCase() !== RECIPE_ALIAS_STORE) continue;
    const set = byIng.get(a.ingredient_id) ?? new Set<string>();
    set.add(clean(a.alias));
    byIng.set(a.ingredient_id, set);
  }
  return ingredients
    .map((i) =>
      [
        i.id,
        clean(i.name),
        clean(i.brand ?? ""),
        i.unit,
        i.piece_weight_g ? `${i.piece_weight_g} g/buc` : "",
        [...(byIng.get(i.id) ?? [])].join("; "),
      ].join(" | "),
    )
    .join("\n");
}

function extractedToText(r: ExtractedRecipe): string {
  const parts: string[] = [];
  if (r.name) parts.push(`Title: ${r.name}`);
  if (r.yield) parts.push(`Yield: ${r.yield.raw}`);
  if (r.totalTimeMinutes) parts.push(`Total time: ${r.totalTimeMinutes} min`);
  parts.push("Ingredients:");
  for (const l of r.ingredients) parts.push(`- ${l.text}${l.isSectionHeader ? "   [section header]" : ""}`);
  parts.push("Instructions:");
  r.instructions.forEach((s, i) => parts.push(`${i + 1}. ${s}`));
  return parts.join("\n");
}

function buildContent(
  input: RecipeMapInput,
  catalog: string,
  categories: MapCategory[],
): Anthropic.Beta.BetaContentBlockParam[] {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  let intro: string;
  switch (input.kind) {
    case "json-ld":
      intro = `Recipe data from a web page:\n\n${extractedToText(input.recipe)}`;
      break;
    case "page-text":
      intro = `Text of a web page that contains a recipe (ignore everything that is not the recipe):\n\nTitle: ${input.title}\n\n${input.text}`;
      break;
    case "text":
      intro = `Pasted recipe text:\n\n${input.text}`;
      break;
    case "images": {
      const imageCount = input.files.filter((f) => f.mediaType !== "application/pdf").length;
      let idx = 0;
      for (const f of input.files) {
        if (f.mediaType === "application/pdf") {
          content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.base64 } });
        } else {
          idx++;
          if (imageCount > 1) content.push({ type: "text", text: `Part ${idx}/${imageCount}:` });
          content.push({ type: "image", source: { type: "base64", media_type: f.mediaType, data: f.base64 } });
        }
      }
      intro = "The recipe is in the image(s)/document above (several parts may overlap; do not repeat lines).";
      break;
    }
  }
  content.push({
    type: "text",
    text: `${intro}\n\nCatalog (id | name | brand | unit | piece weight | aliases):\n${catalog}\n\nCategory slugs (slug | name):\n${categories
      .map((c) => `${c.slug} | ${c.name}`)
      .join("\n")}\n\nMap every ingredient line of the recipe.`,
  });
  return content;
}

export async function mapRecipe(args: {
  input: RecipeMapInput;
  ingredients: MapCatalogIngredient[];
  aliases: CatalogAlias[];
  categories: MapCategory[];
}): Promise<MapRecipeResult> {
  const { input, ingredients, aliases, categories } = args;
  const model = process.env.RECIPE_PARSER_MODEL ?? "claude-haiku-5-5";

  const parsed = await callStructured({
    label: "recipe parse",
    model,
    system: SYSTEM,
    content: buildContent(input, catalogText(ingredients, aliases), categories),
    schema: RecipeModelSchema,
    messages: RECIPE_ERRORS,
  });

  // Preserve the model's explicit no-recipe result before applying source-title fallbacks.
  if (parsed.lines.length === 0 && !parsed.name.trim()) {
    throw new ClaudeError("No recipe was found in that input.", 422);
  }

  const extracted = input.kind === "json-ld" ? input.recipe : null;
  const headerTexts = extracted ? extracted.ingredients.filter((l) => l.isSectionHeader).map((l) => l.text) : [];
  const lines = postProcessRecipeLines(
    parsed.lines.map(toModelLine),
    ingredients,
    aliases,
    categories.map((c) => c.slug),
    headerTexts,
  );

  const portions = parsed.portions > 0 ? parsed.portions : (extracted?.yield?.portions ?? null);
  const fallbackName =
    input.kind === "json-ld" ? input.recipe.name : input.kind === "page-text" ? input.title : null;
  const recipe: RecipeImportRecipe = {
    name: parsed.name.trim() || (fallbackName ?? "").trim(),
    portions: portions && portions > 0 ? Math.round(portions) : null,
    steps: parsed.steps.map((s) => s.trim()).filter(Boolean).slice(0, MAX_STEPS),
    nutrition: extracted?.nutrition ?? null,
    total_time_minutes: extracted?.totalTimeMinutes ?? null,
  };

  return { recipe, lines, model };
}
