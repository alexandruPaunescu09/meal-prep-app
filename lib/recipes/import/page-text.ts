// Server-only module: used by the recipe import pipeline (route handlers).
import { cleanText, decodeEntities } from "./text";

export const PAGE_TEXT_MAX_CHARS = 30_000;

export interface PageText {
  title: string;
  text: string;
}

const STRIPPED = "script|style|noscript|svg|nav|header|footer|aside|form|template|iframe|button|select";

function firstBlock(html: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "i").exec(html);
  return m ? m[1] : null;
}

function toText(fragment: string): string {
  let s = fragment.replace(/<!--[\s\S]*?-->/g, " ");
  // Remove noise blocks (repeat to peel nested ones such as a nav inside a header).
  const re = new RegExp(`<(${STRIPPED})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
  for (let i = 0; i < 3; i++) s = s.replace(re, " ");
  s = s.replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|section|article|table|blockquote|dd|dt|figure|figcaption|main)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]*>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[\s ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageTitle(html: string): string {
  const og = /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*>/i.exec(html)?.[0];
  const ogContent = og ? /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(og) : null;
  const fromOg = ogContent ? cleanText(ogContent[1] ?? ogContent[2] ?? "") : "";
  if (fromOg) return fromOg;
  const title = firstBlock(html, "title");
  if (title) {
    const t = cleanText(title);
    if (t) return t;
  }
  const h1 = firstBlock(html, "h1");
  return h1 ? cleanText(h1) : "";
}

/** Readable text of the main content (article, then main, then body), capped at ~30 000 characters. */
export function extractPageText(html: string): PageText {
  const title = pageTitle(html);
  const candidates = [firstBlock(html, "article"), firstBlock(html, "main")];
  let text = "";
  for (const c of candidates) {
    if (!c) continue;
    const t = toText(c);
    if (t.length >= 200) {
      text = t;
      break;
    }
    if (t.length > text.length) text = t;
  }
  if (text.length < 200) {
    const t = toText(firstBlock(html, "body") ?? html);
    if (t.length > text.length) text = t;
  }
  if (text.length > PAGE_TEXT_MAX_CHARS) {
    const cut = text.slice(0, PAGE_TEXT_MAX_CHARS);
    const nl = cut.lastIndexOf("\n");
    text = nl > PAGE_TEXT_MAX_CHARS * 0.8 ? cut.slice(0, nl) : cut;
  }
  return { title, text };
}
