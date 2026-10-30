// Client + server safe: URL normalisation for the duplicate-by-source-link check.

const TRACKING = /^(utm_|fbclid$|gclid$|mc_)/i;

/**
 * Comparable form of a recipe link: lowercase host, no `www.`, no fragment, no trailing slash,
 * no tracking params (`utm_*`, fbclid, gclid). null when it is not an http(s) URL.
 */
export function normalizeSourceKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  params.sort(([a], [b]) => a.localeCompare(b));
  const qs = new URLSearchParams(params).toString();
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  return `${host}${u.port ? `:${u.port}` : ""}${path}${qs ? `?${qs}` : ""}`;
}
