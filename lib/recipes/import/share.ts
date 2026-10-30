// Client + server safe: interprets the params an Android share (or an iOS Shortcut) sends to /recipes/import.

export type SharedInput = { kind: "url"; url: string } | { kind: "text"; text: string } | null;

const URL_RE = /https?:\/\/[^\s<>"'`]+/i;
const TRAILING = /[)\]}>.,;:!?'"”’»]+$/;

/** First http(s) URL inside a string, with trailing punctuation trimmed. */
export function firstUrl(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = URL_RE.exec(s);
  if (!m) return null;
  const url = m[0].replace(TRAILING, "");
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * `url`, then `text`, then `title`: the first http(s) URL found starts a URL import. With no URL anywhere but
 * some `text`, returns the text for the Paste text tab (never parsed automatically).
 */
export function resolveSharedInput(p: { url?: string | null; text?: string | null; title?: string | null }): SharedInput {
  for (const field of [p.url, p.text, p.title]) {
    const u = firstUrl(field);
    if (u) return { kind: "url", url: u };
  }
  const text = p.text?.trim();
  return text ? { kind: "text", text } : null;
}
