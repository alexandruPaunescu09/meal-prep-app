import { createHash } from "node:crypto";

/** Client IP from proxy headers: first x-forwarded-for entry, else x-real-ip, else "unknown". */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff;
  const real = headers.get("x-real-ip")?.trim();
  return real || "unknown";
}

/** SHA-256 hex of a rate-limit key, so raw IPs are never stored. */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
