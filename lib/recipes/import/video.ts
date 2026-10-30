// Server-only module: ALL video-platform scraping for the recipe import lives here.
// Everything fails soft: an unexpected page shape yields "no written recipe", never an exception.
import { fetchPage, type FetchPageDeps, type FetchPageResult } from "./fetch-page";
import { extractRecipeFromUrl, type ExtractFromUrlResult, type ExtractedRecipe } from "./index";

export type VideoPlatform = "youtube" | "tiktok" | "instagram";

export interface VideoLink {
  platform: VideoPlatform;
  url: string;
}

export const INSTAGRAM_MESSAGE =
  "Instagram doesn't let apps read posts. Paste the caption or upload screenshots.";
export const NO_WRITTEN_RECIPE_MESSAGE =
  "No written recipe found for that video. Paste the text or upload screenshots.";

export function noWrittenRecipeMessage(platform: VideoPlatform): string {
  return platform === "instagram" ? INSTAGRAM_MESSAGE : NO_WRITTEN_RECIPE_MESSAGE;
}

const YOUTUBE_CONSENT_COOKIE = "CONSENT=YES+1; SOCS=CAI";
const MAX_LINKS_TRIED = 3;
const MAX_TEXT_CHARS = 20_000;

// ------------------------------------------------------------------ host detection

const hostIs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Recognises a YouTube / TikTok / Instagram video URL by host and path (no network). */
export function detectVideo(raw: string): VideoLink | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname;

  if (host === "youtu.be") {
    return /^\/[\w-]{6,}/.test(path) ? { platform: "youtube", url: u.toString() } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (path === "/watch" && u.searchParams.get("v")) return { platform: "youtube", url: u.toString() };
    if (/^\/(?:shorts|live)\/[\w-]{6,}/.test(path)) return { platform: "youtube", url: u.toString() };
    return null;
  }
  if (host === "tiktok.com" || host === "m.tiktok.com") {
    if (/^\/@[^/]+\/video\/\d+/.test(path) || /^\/t\/\w+/.test(path)) return { platform: "tiktok", url: u.toString() };
    return null;
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    return path.length > 1 ? { platform: "tiktok", url: u.toString() } : null;
  }
  if (host === "instagram.com") {
    return /^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/[\w-]+/.test(path) ? { platform: "instagram", url: u.toString() } : null;
  }
  return null;
}

// ------------------------------------------------------------------ helpers

const SKIP_HOSTS = [
  "youtube.com",
  "youtu.be",
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "patreon.com",
  "amazon.com",
  "amzn.to",
  "spotify.com",
  "linktr.ee",
];

/** http(s) links in a description, in order, de-duplicated, minus obvious non-recipe hosts. */
export function extractRecipeLinks(description: string, max = MAX_LINKS_TRIED): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of description.matchAll(/https?:\/\/[^\s<>"'\\)\]]+/gi)) {
    const link = m[0].replace(/[.,;:!?]+$/, "");
    let host: string;
    try {
      host = new URL(link).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    if (SKIP_HOSTS.some((d) => hostIs(host, d))) continue;
    if (seen.has(link)) continue;
    seen.add(link);
    out.push(link);
    if (out.length >= max) break;
  }
  return out;
}

const QUANTITY_UNIT =
  /(?<![\p{L}\d])\d+(?:[.,/]\d+)?\s*(?:g|gr|grame?|kg|ml|l|dl|cl|oz|lbs?|cups?|c[aă]ni?|tbsp|tsp|tablespoons?|teaspoons?|lingur[\p{L}\p{M}]*|buc[\p{L}\p{M}]*|felii|cloves?|c[aă]tei)(?![\p{L}])/giu;

/** True when the text has several quantity+unit mentions, i.e. it reads like an ingredient list. */
export function looksLikeRecipe(text: string): boolean {
  return (text.match(QUANTITY_UNIT) ?? []).length >= 3;
}

/** Parses the JSON object that starts at `start` (a `{`), tracking strings; null when unbalanced/invalid. */
function parseJsonObjectAt(src: string, start: number): unknown {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(src.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

// ------------------------------------------------------------------ page parsers (pure)

export interface YoutubeDetails {
  title: string;
  author: string;
  description: string;
}

/** `ytInitialPlayerResponse.videoDetails` from a watch page, or null when the shape is not recognised. */
export function parseYoutubeWatchPage(html: string): YoutubeDetails | null {
  try {
    const marker = /ytInitialPlayerResponse\s*=\s*/.exec(html);
    if (!marker) return null;
    const start = html.indexOf("{", marker.index + marker[0].length);
    if (start < 0 || start - (marker.index + marker[0].length) > 4) return null;
    const json = parseJsonObjectAt(html, start) as { videoDetails?: Record<string, unknown> } | null;
    const vd = json?.videoDetails;
    if (!vd || typeof vd !== "object") return null;
    return {
      title: asString(vd.title),
      author: asString(vd.author),
      description: asString(vd.shortDescription),
    };
  } catch {
    return null;
  }
}

export interface TiktokDetails {
  caption: string;
  author: string;
}

/** The caption (`desc`) from TikTok's embedded rehydration JSON, or null when the shape is not recognised. */
export function parseTiktokPage(html: string): TiktokDetails | null {
  try {
    const m = /<script[^>]*\bid=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
    if (!m) return null;
    const data = JSON.parse(m[1]) as { __DEFAULT_SCOPE__?: Record<string, unknown> };
    const detail = data.__DEFAULT_SCOPE__?.["webapp.video-detail"] as
      | { itemInfo?: { itemStruct?: { desc?: unknown; author?: { nickname?: unknown } } } }
      | undefined;
    const item = detail?.itemInfo?.itemStruct;
    if (!item || typeof item.desc !== "string") return null;
    return { caption: item.desc, author: asString(item.author?.nickname) };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ resolution

export type VideoResolution =
  /** The description linked to a page with Recipe JSON-LD. */
  | { ok: true; kind: "linked-page"; platform: VideoPlatform; videoUrl: string; pageUrl: string; recipe: ExtractedRecipe }
  /** The description / caption itself reads like a recipe. */
  | { ok: true; kind: "text"; platform: VideoPlatform; videoUrl: string; title: string; text: string }
  | { ok: false; reason: "no_written_recipe"; platform: VideoPlatform };

export interface VideoDeps {
  fetchPage?: (url: string, deps?: FetchPageDeps) => Promise<FetchPageResult>;
  extractRecipeFromUrl?: (url: string, deps?: FetchPageDeps) => Promise<ExtractFromUrlResult>;
  fetchDeps?: FetchPageDeps;
}

function normalizeBody(body: string): string {
  return body
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

const none = (platform: VideoPlatform): VideoResolution => ({ ok: false, reason: "no_written_recipe", platform });

function textResult(
  platform: VideoPlatform,
  videoUrl: string,
  title: string,
  body: string,
): VideoResolution {
  const text = normalizeBody(body);
  return looksLikeRecipe(text) ? { ok: true, kind: "text", platform, videoUrl, title, text } : none(platform);
}

async function resolveYoutube(link: VideoLink, deps: VideoDeps): Promise<VideoResolution> {
  const fetchFn = deps.fetchPage ?? fetchPage;
  const extractFn = deps.extractRecipeFromUrl ?? extractRecipeFromUrl;
  const page = await fetchFn(link.url, {
    ...deps.fetchDeps,
    extraHeaders: { ...deps.fetchDeps?.extraHeaders, Cookie: YOUTUBE_CONSENT_COOKIE },
  });
  if (!page.ok) return none("youtube");
  const details = parseYoutubeWatchPage(page.html);
  if (!details || !details.description.trim()) return none("youtube");

  for (const target of extractRecipeLinks(details.description)) {
    const r = await extractFn(target, deps.fetchDeps);
    if (r.ok && r.source === "json-ld") {
      return { ok: true, kind: "linked-page", platform: "youtube", videoUrl: link.url, pageUrl: r.finalUrl, recipe: r.recipe };
    }
  }
  return textResult("youtube", link.url, details.title, details.description);
}

async function resolveTiktok(link: VideoLink, deps: VideoDeps): Promise<VideoResolution> {
  const fetchFn = deps.fetchPage ?? fetchPage;
  const page = await fetchFn(link.url, deps.fetchDeps);
  if (!page.ok) return none("tiktok");
  const details = parseTiktokPage(page.html);
  if (!details || !details.caption.trim()) return none("tiktok");
  return textResult("tiktok", page.finalUrl, details.author ? `TikTok by ${details.author}` : "TikTok video", details.caption);
}

/**
 * Finds the written recipe behind a video link. Instagram makes NO network call. Never throws:
 * any failure or unexpected page shape returns `no_written_recipe`.
 */
export async function resolveVideo(link: VideoLink, deps: VideoDeps = {}): Promise<VideoResolution> {
  try {
    if (link.platform === "instagram") return none("instagram");
    if (link.platform === "youtube") return await resolveYoutube(link, deps);
    return await resolveTiktok(link, deps);
  } catch (e) {
    console.error("video resolve failed", link.platform, e);
    return none(link.platform);
  }
}
