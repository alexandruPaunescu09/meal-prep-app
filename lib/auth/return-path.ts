// Client + server safe: validates the `next` return path used after sign-in (open-redirect guard).

const BASE = "http://return-path.invalid";
// Shared recipes expand when percent-encoded; allow a bounded query without expanding the path budget.
const MAX_RETURN_PATH_LENGTH = 16 * 1024;
const MAX_PATHNAME_LENGTH = 2000;

function hasUnsafeChars(s: string): boolean {
  return /[\\\u0000-\u001f\u007f]/.test(s);
}

/**
 * Returns a same-origin relative path (`/x?y=z`) or null. Accepts only values that start with a single "/",
 * contain no backslash or control characters (raw or percent-encoded), and stay on the same origin when parsed.
 * Never returns the login page itself.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_RETURN_PATH_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (hasUnsafeChars(raw)) return null;

  // Reject encoded tricks in the path: "/%2F...", "/%5C...", and anything that decodes to something unsafe.
  // The query is exempt: shared recipe text legitimately carries encoded newlines and slashes.
  let decoded = raw.split(/[?#]/, 1)[0];
  if (decoded.length > MAX_PATHNAME_LENGTH) return null;
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) break;
    decoded = next;
    if (decoded.startsWith("//") || hasUnsafeChars(decoded)) return null;
  }
  if (decoded.startsWith("//") || hasUnsafeChars(decoded)) return null;

  let u: URL;
  try {
    u = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (u.origin !== BASE) return null;
  if (u.pathname === "/login" || u.pathname.startsWith("/login/")) return null;
  const destination = u.pathname + u.search;
  // URL parsing percent-encodes raw Unicode too, so bound the serialized result as well.
  return destination.length <= MAX_RETURN_PATH_LENGTH ? destination : null;
}
