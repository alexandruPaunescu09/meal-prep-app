/**
 * Bounded in-memory TTL cache for successful source responses.
 *
 * Why not unstable_cache: Next 16 deprecates it in favour of `use cache` (Cache Components, not
 * enabled here), it needs a request/incremental-cache context (unusable in unit tests), and failures
 * would have to be modelled as throws. A per-instance LRU is enough for an admin-only lookup: on
 * Vercel each warm lambda keeps its own copy, so a repeat may occasionally hit a cold instance and
 * re-fetch, which is only slower, never wrong.
 */
export const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 200;

interface CacheEntry<T> {
  value: T;
  expires: number;
}

export function createTtlCache<T>(max = MAX_ENTRIES, ttlMs = SEARCH_CACHE_TTL_MS, now = () => Date.now()) {
  const map = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const e = map.get(key);
      if (!e) return undefined;
      if (e.expires <= now()) {
        map.delete(key);
        return undefined;
      }
      map.delete(key); // refresh recency
      map.set(key, e);
      return e.value;
    },
    set(key: string, value: T) {
      map.delete(key);
      map.set(key, { value, expires: now() + ttlMs });
      while (map.size > max) map.delete(map.keys().next().value as string);
    },
    clear() {
      map.clear();
    },
    get size() {
      return map.size;
    },
  };
}

export type TtlCache<T> = ReturnType<typeof createTtlCache<T>>;

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface SourceOutcome<R> {
  results: R[];
  /** False when part of the lookup failed; such outcomes are returned but never cached. */
  complete: boolean;
}

/** Wraps a searcher: caches only complete outcomes, per source + normalised query. Errors propagate uncached. */
export function withSourceCache<R>(
  source: string,
  cache: TtlCache<R[]>,
  search: (query: string) => Promise<SourceOutcome<R>>
) {
  return async (query: string): Promise<SourceOutcome<R>> => {
    const key = `${source}:${normalizeQuery(query)}`;
    const hit = cache.get(key);
    if (hit) return { results: hit, complete: true };
    const out = await search(query);
    if (out.complete) cache.set(key, out.results);
    return out;
  };
}
