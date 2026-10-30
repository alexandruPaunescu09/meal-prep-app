// Server-only module: used by the recipe import pipeline (route handlers).
import { cleanText, decodeEntities, stripTags } from "./text";

export interface ExtractedIngredientLine {
  text: string;
  /** Heuristic only (no digits and ends with ":" or starts with "Pentru " / "For the "); the model decides. */
  isSectionHeader: boolean;
}

export interface ExtractedRecipe {
  name: string | null;
  description: string | null;
  ingredients: ExtractedIngredientLine[];
  /**
   * One string per step. A HowToSection (or nested ItemList) contributes its name as its own line
   * ending with ":" (e.g. "Pentru sos:") followed by its steps.
   */
  instructions: string[];
  yield: { raw: string; portions: number | null } | null;
  totalTimeMinutes: number | null;
  /** The site's raw nutrition strings (e.g. { calories: "61 calories" }), not parsed. */
  nutrition: Record<string, string> | null;
  siteName: string | null;
}

type Json = unknown;
type Obj = Record<string, Json>;

function isObj(v: Json): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function typesOf(node: Obj): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

function isRecipeNode(node: Obj): boolean {
  return typesOf(node).some((t) => t === "Recipe" || t.endsWith("/Recipe"));
}

function parseJsonTolerant(raw: string): Json | undefined {
  const body = raw
    .trim()
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^\/\/<!\[CDATA\[|^<!\[CDATA\[/, "")
    .replace(/\]\]>$|\/\/\]\]>$/, "")
    .trim();
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    // Common site bug: raw newlines/tabs inside string values.
    try {
      return JSON.parse(body.replace(/[\u0000-\u001f]+/g, " "));
    } catch {
      return undefined;
    }
  }
}

/** Returns the parsed content of every application/ld+json script block (invalid blocks are skipped). */
export function findJsonLdBlocks(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!/\btype\s*=\s*(["']?)\s*application\/ld\+json\b/i.test(m[1])) continue;
    const parsed = parseJsonTolerant(m[2]);
    if (parsed !== undefined) out.push(parsed);
  }
  return out;
}

function collectRecipes(node: Json, out: Obj[], depth = 0): void {
  if (depth > 8) return;
  if (Array.isArray(node)) {
    for (const n of node) collectRecipes(n, out, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  if (isRecipeNode(node)) out.push(node);
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage"]) {
    if (node[key] !== undefined) collectRecipes(node[key], out, depth + 1);
  }
}

function str(v: Json): string | null {
  if (typeof v === "string") return cleanText(v) || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function nameOf(v: Json): string | null {
  if (isObj(v)) return str(v.name);
  if (Array.isArray(v)) {
    for (const x of v) {
      const n = nameOf(x);
      if (n) return n;
    }
    return null;
  }
  return str(v);
}

export function isSectionHeaderLine(text: string): boolean {
  if (/\d/.test(text)) return false;
  return /:\s*$/.test(text) || /^\s*(pentru|for the)\s/i.test(text);
}

function ingredientLines(v: Json): ExtractedIngredientLine[] {
  const items = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  const out: ExtractedIngredientLine[] = [];
  for (const item of items) {
    const text = isObj(item) ? str(item.text ?? item.name) : str(item);
    if (text) out.push({ text, isSectionHeader: isSectionHeaderLine(text) });
  }
  return out;
}

function splitLines(raw: string): string[] {
  return decodeEntities(stripTags(raw.replace(/<\/\s*(p|li|div)\s*>|<br\s*\/?>/gi, "\n")))
    .split(/\r?\n/)
    .map((l) => l.replace(/[\s ]+/g, " ").trim())
    .filter(Boolean);
}

function collectSteps(v: Json, out: string[], depth = 0): void {
  if (depth > 6 || v === undefined || v === null) return;
  if (typeof v === "string") {
    out.push(...splitLines(v));
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) collectSteps(x, out, depth + 1);
    return;
  }
  if (!isObj(v)) return;
  const types = typesOf(v);
  const nested = v.itemListElement;
  if (nested !== undefined && (types.includes("HowToSection") || !v.text)) {
    const title = str(v.name);
    if (title) out.push(/[:.]$/.test(title) ? title : `${title}:`);
    collectSteps(nested, out, depth + 1);
    return;
  }
  const text = str(v.text) ?? str(v.name);
  if (text) out.push(text);
}

function firstPositiveInt(raw: string): number | null {
  const m = /\d+/.exec(raw);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n > 0 ? n : null;
}

function parseYield(v: Json): ExtractedRecipe["yield"] {
  const items = (Array.isArray(v) ? v : [v]).map(str).filter((x): x is string => !!x);
  if (items.length === 0) return null;
  let portions: number | null = null;
  for (const it of items) {
    portions = firstPositiveInt(it);
    if (portions) break;
  }
  return { raw: items.join(", "), portions };
}

/** ISO 8601 duration (e.g. PT1H30M, PT00H30M, P1DT2H) to whole minutes; null when unparsable or zero. */
export function parseIsoDurationMinutes(v: Json): number | null {
  if (typeof v !== "string") return null;
  const m = /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
    v.trim(),
  );
  if (!m) return null;
  const [w, d, h, min, s] = m.slice(1).map((x) => (x ? parseFloat(x) : 0));
  const total = Math.round(w * 7 * 1440 + d * 1440 + h * 60 + min + s / 60);
  return total > 0 ? total : null;
}

function parseNutrition(v: Json): ExtractedRecipe["nutrition"] {
  if (!isObj(v)) return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (k.startsWith("@")) continue;
    const s = str(val);
    if (s) out[k] = s;
  }
  return Object.keys(out).length ? out : null;
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const tag = re.exec(html)?.[0];
  if (!tag) return null;
  const c = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  const val = c ? (c[1] ?? c[2]) : null;
  return val ? cleanText(val) || null : null;
}

function mapRecipe(node: Obj, html: string): ExtractedRecipe {
  const time =
    parseIsoDurationMinutes(node.totalTime) ??
    (() => {
      const sum = (parseIsoDurationMinutes(node.prepTime) ?? 0) + (parseIsoDurationMinutes(node.cookTime) ?? 0);
      return sum > 0 ? sum : null;
    })();
  const steps: string[] = [];
  collectSteps(node.recipeInstructions, steps);
  return {
    name: str(node.name),
    description: str(node.description),
    ingredients: ingredientLines(node.recipeIngredient ?? node.ingredients),
    instructions: steps,
    yield: parseYield(node.recipeYield),
    totalTimeMinutes: time,
    nutrition: parseNutrition(node.nutrition),
    siteName: nameOf(node.publisher) ?? metaContent(html, "og:site_name"),
  };
}

/** Extracts the best Recipe JSON-LD node on the page, or null. Images and videos are dropped. */
export function extractJsonLdRecipe(html: string): ExtractedRecipe | null {
  const nodes: Obj[] = [];
  for (const block of findJsonLdBlocks(html)) collectRecipes(block, nodes);
  if (nodes.length === 0) return null;
  const recipes = nodes.map((n) => mapRecipe(n, html));
  return (
    recipes.find((r) => r.ingredients.length > 0 && r.instructions.length > 0) ??
    recipes.find((r) => r.ingredients.length > 0 || r.instructions.length > 0) ??
    recipes[0]
  );
}
