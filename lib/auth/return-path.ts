// Client + server safe: validates the `next` return path used after sign-in (open-redirect guard).

const BASE = "http://return-path.invalid";

function hasUnsafeChars(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\\\u0000-\u001f\u007f]/.test(s);
}

/**
 * Returns a same-origin relative path (`/x?y=z`) or null. Accepts only values that start with a single "/",
 * contain no backslash or control characters (raw or percent-encoded), and stay on the same origin when parsed.
 * Never returns the login page itself.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2000) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (hasUnsafeChars(raw)) return null;

  // Reject encoded tricks in the path: "/%2F...", "/%5C...", and anything that decodes to something unsafe.
  // The query is exempt: shared recipe text legitimately carries encoded newlines and slashes.
  let decoded = raw.split(/[?#]/, 1)[0];
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
  return u.pathname + u.search;
}
