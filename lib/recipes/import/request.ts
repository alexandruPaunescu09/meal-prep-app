// Pure request validation / messages for POST /api/recipes/import/parse.
import type { FetchFailureReason } from "./fetch-page";

export const MIN_TEXT_CHARS = 20;
export const MAX_TEXT_CHARS = 30_000;
export const MAX_FILES = 10;
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export type ParseBody =
  | { ok: true; kind: "url"; url: string }
  | { ok: true; kind: "text"; text: string }
  | { ok: false; error: string };

/** Validates the JSON body: exactly one of `url` or `text`. */
export function validateJsonBody(body: unknown): ParseBody {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Invalid request body" };
  const { url, text } = body as { url?: unknown; text?: unknown };
  const hasUrl = typeof url === "string" && url.trim() !== "";
  const hasText = typeof text === "string" && text.trim() !== "";
  if (hasUrl === hasText) return { ok: false, error: "Send either a url or text" };
  if (hasUrl) return { ok: true, kind: "url", url: (url as string).trim() };
  const t = (text as string).trim();
  if (t.length < MIN_TEXT_CHARS) return { ok: false, error: `Text must be at least ${MIN_TEXT_CHARS} characters` };
  if (t.length > MAX_TEXT_CHARS) return { ok: false, error: `Text must be at most ${MAX_TEXT_CHARS} characters` };
  return { ok: true, kind: "text", text: t };
}

/** Validates uploaded files (count, total size, type). Returns an error message or null. */
export function validateUploads(files: { size: number; type: string; name: string }[]): string | null {
  if (files.length === 0) return "No files uploaded";
  if (files.length > MAX_FILES) return `At most ${MAX_FILES} files allowed`;
  if (files.reduce((s, f) => s + f.size, 0) > MAX_TOTAL_BYTES) return "Files exceed the 4 MB total limit";
  for (const f of files) {
    if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(f.type))
      return `Unsupported file type: ${f.type || f.name}`;
  }
  return null;
}

const PASTE_HINT = "Paste the recipe text or upload screenshots instead.";

/** Friendly message + HTTP status for a failed page fetch. */
export function fetchFailureResponse(reason: FetchFailureReason): { error: string; status: number } {
  switch (reason) {
    case "invalid_url":
      return { error: "That doesn't look like a valid web address (it must start with http:// or https://).", status: 400 };
    case "blocked_address":
      return { error: "That address can't be opened from here.", status: 400 };
    case "blocked_by_site":
      return { error: `This site blocks automatic reading. ${PASTE_HINT}`, status: 422 };
    case "not_found":
      return { error: `That page was not found. Check the link, or ${PASTE_HINT.toLowerCase()}`, status: 422 };
    case "too_large":
      return { error: `That page is too large to read. ${PASTE_HINT}`, status: 422 };
    case "timeout":
      return { error: `The site took too long to answer. Try again, or ${PASTE_HINT.toLowerCase()}`, status: 422 };
    case "not_html":
      return { error: `That link is not a web page. ${PASTE_HINT}`, status: 422 };
    case "network":
    default:
      return { error: `Could not reach that site. Try again, or ${PASTE_HINT.toLowerCase()}`, status: 422 };
  }
}
