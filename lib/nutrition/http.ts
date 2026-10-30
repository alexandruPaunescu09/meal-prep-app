/** Thrown by a source searcher when the upstream API did not give a usable answer. */
export class SourceError extends Error {}

export const RETRY_BACKOFF_MS = 300;
const ATTEMPT_TIMEOUT_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with ONE retry on network errors, timeouts and 5xx (after a short backoff). 4xx is returned
 * as-is and never retried. Returns the final Response (possibly !ok); throws SourceError only when
 * the network itself failed on both attempts. Worst case is about 2 x timeoutMs (default 4 s) + 0.3 s.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = ATTEMPT_TIMEOUT_MS
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(RETRY_BACKOFF_MS);
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status >= 500 && attempt === 0) {
        lastError = new SourceError(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (e) {
      lastError = e;
    }
  }
  throw new SourceError(lastError instanceof Error ? lastError.message : "network error");
}
