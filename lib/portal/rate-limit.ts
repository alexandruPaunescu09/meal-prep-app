/**
 * Best-effort sliding-window limiter, kept in memory per server instance. It only has to stop one
 * customer hammering an upstream API; on serverless each warm instance has its own window, so the
 * effective cap is "limit per instance", which is fine for that purpose. Not a security boundary.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** Records an attempt and returns true when it is allowed. */
    take(key: string): boolean {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((h) => t - h < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((h) => t - h < windowMs)) hits.delete(k);
      return true;
    },
  };
}
