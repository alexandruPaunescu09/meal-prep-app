import { createHash } from "node:crypto";

/**
 * Normalises an IP for use as a rate-limit key: IPv4-mapped IPv6 becomes IPv4, other IPv6
 * addresses collapse to their /64 prefix (a single customer controls a whole /64), IPv4 is kept.
 */
export function normalizeIp(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (!ip.includes(":")) return ip;

  const mapped = /^(?:0{0,4}:){2,5}ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];

  // Expand "::" and an optional trailing dotted IPv4 into eight 16-bit groups.
  let tail: string[] = [];
  let head = ip;
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    head = ip.slice(0, dotted.index) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = head.split("::");
  if (halves.length > 2) return ip;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 0) return ip;
    tail = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    tail = left;
  }
  if (tail.length !== 8) return ip;
  return tail.slice(0, 4).map((g) => parseInt(g || "0", 16).toString(16)).join(":") + "::/64";
}

/**
 * Client IP for rate limiting. Assumes Vercel's edge sets these headers (it overwrites
 * x-vercel-forwarded-for / x-real-ip and appends to x-forwarded-for); a different proxy in front
 * of the app would need this revisited, because clients could spoof them otherwise.
 * Order: x-vercel-forwarded-for, x-real-ip, first x-forwarded-for entry, else "unknown".
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const raw =
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return raw ? normalizeIp(raw) : "unknown";
}

/** SHA-256 hex of a rate-limit key, so raw IPs are never stored. */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
