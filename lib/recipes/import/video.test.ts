import { describe, expect, it, vi } from "vitest";
import type { ExtractFromUrlResult, ExtractedRecipe } from "./index";
import type { FetchPageDeps, FetchPageResult } from "./fetch-page";
import {
  detectVideo,
  extractRecipeLinks,
  looksLikeRecipe,
  parseTiktokPage,
  parseYoutubeWatchPage,
  resolveVideo,
  type VideoLink,
} from "./video";

// ---- trimmed, hand-written snippets (only the fields the module reads)
function youtubePage(description: string, extra = ""): string {
  const player = { videoDetails: { title: "Gulas de vita", author: "Jamila", shortDescription: description }, extra };
  return `<html><head></head><body><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = {};</script></body></html>`;
}

function tiktokPage(desc: string): string {
  const data = {
    __DEFAULT_SCOPE__: {
      "webapp.video-detail": { itemInfo: { itemStruct: { desc, author: { nickname: "Ian" } } } },
    },
  };
  return `<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

const RECIPE_CAPTION =
  "Sauce: Mayo (1 cup) - Ketchup (1/2 cup) - Wash Sauce (1 1/2 tbsp) - Garlic (3-4 cloves) - Salt (tt)";

const RECIPE: ExtractedRecipe = {
  name: "Gulas",
  description: null,
  ingredients: [{ text: "500 g carne", isSectionHeader: false }],
  instructions: ["Fierbe."],
  yield: null,
  totalTimeMinutes: null,
  nutrition: null,
  siteName: "jamilacuisine.ro",
};

const ok = (html: string, finalUrl = "https://www.youtube.com/watch?v=abc"): FetchPageResult => ({ ok: true, finalUrl, html });
const jsonLd = (url: string): ExtractFromUrlResult => ({ ok: true, finalUrl: url, source: "json-ld", recipe: RECIPE });
const pageText = (url: string): ExtractFromUrlResult => ({ ok: true, finalUrl: url, source: "page-text", title: "x", text: "y".repeat(100) });

const YT: VideoLink = { platform: "youtube", url: "https://www.youtube.com/watch?v=abc123xyz" };

describe("detectVideo", () => {
  it.each([
    ["https://www.youtube.com/watch?v=eUlS7EfLPdo", "youtube"],
    ["https://m.youtube.com/watch?v=eUlS7EfLPdo&t=3", "youtube"],
    ["https://youtu.be/eUlS7EfLPdo?si=1", "youtube"],
    ["https://www.youtube.com/shorts/abcdEFG1234", "youtube"],
    ["https://www.tiktok.com/@iankyo/video/7392250604371938591", "tiktok"],
    ["https://vm.tiktok.com/ZMabc123/", "tiktok"],
    ["https://vt.tiktok.com/ZSxyz/", "tiktok"],
    ["https://www.instagram.com/reel/C1abcDEF/", "instagram"],
    ["https://instagram.com/p/C1abcDEF/", "instagram"],
    ["https://www.instagram.com/tv/C1abcDEF/", "instagram"],
    ["https://www.instagram.com/someone/reel/C1abcDEF/", "instagram"],
  ])("%s -> %s", (url, platform) => {
    expect(detectVideo(url)?.platform).toBe(platform);
  });

  it.each([
    "https://www.youtube.com/",
    "https://www.youtube.com/@jamilacuisine",
    "https://www.youtube.com/watch",
    "https://www.tiktok.com/@iankyo",
    "https://www.instagram.com/someone/",
    "https://jamilacuisine.ro/gulas",
    "https://notyoutube.com/watch?v=abc",
    "https://youtube.com.evil.example/watch?v=abc",
    "ftp://youtu.be/abcdefgh",
    "not a url",
  ])("%s is not a video link", (url) => {
    expect(detectVideo(url)).toBeNull();
  });
});

describe("extractRecipeLinks", () => {
  it("keeps order, drops social/shop hosts, de-duplicates and trims punctuation, max 3", () => {
    const d = `Reteta: https://jamilacuisine.ro/gulas/.
Insta https://www.instagram.com/jamila  Amazon https://amzn.to/x
https://youtu.be/zzzzzzzz https://linktr.ee/jamila
https://blog.example.com/a, https://blog.example.com/a https://b.example.com/b https://c.example.com/c https://d.example.com/d`;
    expect(extractRecipeLinks(d)).toEqual([
      "https://jamilacuisine.ro/gulas/",
      "https://blog.example.com/a",
      "https://b.example.com/b",
    ]);
  });
});

describe("looksLikeRecipe", () => {
  it("accepts ingredient lists with quantities and units", () => {
    expect(looksLikeRecipe(RECIPE_CAPTION)).toBe(true);
    expect(looksLikeRecipe("500 g carne\n2 linguri ulei\n1 kg cartofi")).toBe(true);
  });
  it("rejects prose and timestamps", () => {
    expect(looksLikeRecipe("Subscribe! 0:00 intro 1:30 cooking 10:45 done. Follow me.")).toBe(false);
    expect(looksLikeRecipe("A great video about 2 things")).toBe(false);
  });
});

describe("page parsers", () => {
  it("reads videoDetails from a watch page", () => {
    const d = parseYoutubeWatchPage(youtubePage("Descriere { cu acolade } si \"ghilimele\""));
    expect(d).toEqual({ title: "Gulas de vita", author: "Jamila", description: 'Descriere { cu acolade } si "ghilimele"' });
  });
  it("returns null when the page shape changed", () => {
    expect(parseYoutubeWatchPage("<html>consent wall</html>")).toBeNull();
    expect(parseYoutubeWatchPage("<script>ytInitialPlayerResponse = {broken</script>")).toBeNull();
    expect(parseYoutubeWatchPage("<script>ytInitialPlayerResponse = {\"videoDetails\":null}</script>")).toBeNull();
  });
  it("reads the TikTok caption", () => {
    expect(parseTiktokPage(tiktokPage("hello"))).toEqual({ caption: "hello", author: "Ian" });
  });
  it("returns null for a changed TikTok shape", () => {
    expect(parseTiktokPage("<html></html>")).toBeNull();
    expect(
      parseTiktokPage(`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"__DEFAULT_SCOPE__":{}}</script>`),
    ).toBeNull();
    expect(parseTiktokPage(`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">not json</script>`)).toBeNull();
  });
});

describe("resolveVideo - YouTube", () => {
  it("sends the consent cookie and follows description links until one has JSON-LD (first wins)", async () => {
    const fetchPage = vi.fn(async (...args: [string, FetchPageDeps?]) =>
      ok(youtubePage("Reteta: https://skip.example.com/1 si https://jamilacuisine.ro/gulas https://other.example.com/2")),
    );
    const extract = vi.fn(async (u: string) => (u.includes("jamilacuisine") ? jsonLd(u) : pageText(u)));
    const r = await resolveVideo(YT, { fetchPage, extractRecipeFromUrl: extract });
    expect(r).toMatchObject({ ok: true, kind: "linked-page", pageUrl: "https://jamilacuisine.ro/gulas", videoUrl: YT.url });
    expect(fetchPage.mock.calls[0][1]?.extraHeaders?.Cookie).toBe("CONSENT=YES+1; SOCS=CAI");
    expect(extract.mock.calls.map((c) => c[0])).toEqual(["https://skip.example.com/1", "https://jamilacuisine.ro/gulas"]);
  });

  it("tries at most 3 links", async () => {
    const links = [1, 2, 3, 4, 5].map((n) => `https://s${n}.example.com/r`).join(" ");
    const extract = vi.fn(async (u: string) => pageText(u));
    const r = await resolveVideo(YT, { fetchPage: async () => ok(youtubePage(links)), extractRecipeFromUrl: extract });
    expect(extract).toHaveBeenCalledTimes(3);
    expect(r).toEqual({ ok: false, reason: "no_written_recipe", platform: "youtube" });
  });

  it("falls back to the description when it reads like a recipe", async () => {
    const desc = "Ingrediente:\n500 g carne\n2 linguri ulei\n1 kg cartofi\n";
    const r = await resolveVideo(YT, {
      fetchPage: async () => ok(youtubePage(desc)),
      extractRecipeFromUrl: async (u) => pageText(u),
    });
    expect(r).toMatchObject({ ok: true, kind: "text", videoUrl: YT.url, title: "Gulas de vita" });
    expect((r as { text: string }).text).toContain("500 g carne");
  });

  it("returns no_written_recipe for a description without a recipe", async () => {
    const r = await resolveVideo(YT, { fetchPage: async () => ok(youtubePage("Subscribe! 0:00 intro")) });
    expect(r).toEqual({ ok: false, reason: "no_written_recipe", platform: "youtube" });
  });

  it("degrades softly on a changed page shape, a failed fetch, or a thrown error", async () => {
    const none = { ok: false, reason: "no_written_recipe", platform: "youtube" };
    expect(await resolveVideo(YT, { fetchPage: async () => ok("<html>new layout</html>") })).toEqual(none);
    expect(await resolveVideo(YT, { fetchPage: async () => ({ ok: false, reason: "blocked_by_site" }) })).toEqual(none);
    expect(
      await resolveVideo(YT, {
        fetchPage: async () => {
          throw new Error("boom");
        },
      }),
    ).toEqual(none);
  });
});

describe("resolveVideo - TikTok", () => {
  const TT: VideoLink = { platform: "tiktok", url: "https://vm.tiktok.com/ZMabc/" };

  it("uses the caption when it looks like a recipe (short link resolved by the fetcher)", async () => {
    const fetchPage = vi.fn(async () => ok(tiktokPage(RECIPE_CAPTION), "https://www.tiktok.com/@iankyo/video/1"));
    const r = await resolveVideo(TT, { fetchPage });
    expect(r).toMatchObject({ ok: true, kind: "text", videoUrl: "https://www.tiktok.com/@iankyo/video/1" });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("returns no_written_recipe for a caption without a recipe or a changed shape", async () => {
    const none = { ok: false, reason: "no_written_recipe", platform: "tiktok" };
    expect(await resolveVideo(TT, { fetchPage: async () => ok(tiktokPage("so funny lol")) })).toEqual(none);
    expect(await resolveVideo(TT, { fetchPage: async () => ok("<html></html>") })).toEqual(none);
  });
});

describe("resolveVideo - Instagram", () => {
  it("makes no network call", async () => {
    const fetchPage = vi.fn();
    const extract = vi.fn();
    const r = await resolveVideo(
      { platform: "instagram", url: "https://www.instagram.com/reel/C1abc/" },
      { fetchPage, extractRecipeFromUrl: extract },
    );
    expect(r).toEqual({ ok: false, reason: "no_written_recipe", platform: "instagram" });
    expect(fetchPage).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });
});
