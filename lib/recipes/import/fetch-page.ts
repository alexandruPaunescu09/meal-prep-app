// Server-only module: imported exclusively from route handlers (arbitrary-URL fetch with an SSRF guard).
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { isBlockedAddress, isIpLiteral } from "./ip-guard";

export type FetchFailureReason =
  | "invalid_url"
  | "blocked_address"
  | "blocked_by_site"
  | "not_found"
  | "too_large"
  | "timeout"
  | "not_html"
  | "network";

export type FetchPageResult =
  | { ok: true; finalUrl: string; html: string }
  | { ok: false; reason: FetchFailureReason; status?: number; detail?: string };

export interface ResolvedAddress {
  address: string;
  family: number;
}
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | ResolvedAddress[], family?: number) => void;
export type LookupFn = (hostname: string, options: unknown, callback: LookupCallback) => void;

export interface TransportRequest {
  url: URL;
  headers: Record<string, string>;
  /** Pass this as the `lookup` option of the socket so every connect-time address is validated. */
  lookup: LookupFn;
  signal: AbortSignal;
}
export interface TransportResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  destroy(): void;
}
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

export interface FetchPageDeps {
  resolver?: Resolver;
  transport?: Transport;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /**
   * Extra request headers. Only `Cookie` is honoured (e.g. consent cookies), and only on hops to the
   * ORIGINAL hostname, so it never leaks to a redirect target. Every other guard is unaffected.
   */
  extraHeaders?: Record<string, string>;
}

export const MAX_BODY_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_REDIRECTS = 5;
export const USER_AGENT = "meal-prep-app/1.0 (recipe import)";

const BLOCKED_CODE = "BLOCKED_ADDRESS";

class TooLargeError extends Error {}

const defaultResolver: Resolver = async (hostname) => {
  const res = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return res.map((r) => ({ address: r.address, family: r.family }));
};

/**
 * Builds a `lookup` function for sockets. It resolves ALL addresses and fails the connection when any
 * of them is private/reserved, and the socket then connects to exactly the addresses validated here,
 * so DNS rebinding between check and connect is not possible.
 */
export function createGuardedLookup(resolver: Resolver): LookupFn {
  return (hostname, options, callback) => {
    const wantsAll = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
    resolver(hostname).then(
      (addrs) => {
        if (addrs.length === 0) {
          const err = Object.assign(new Error(`No address for ${hostname}`), { code: "ENOTFOUND" });
          callback(err);
          return;
        }
        if (addrs.some((a) => isBlockedAddress(a.address))) {
          const err = Object.assign(new Error(`Blocked address for ${hostname}`), { code: BLOCKED_CODE });
          callback(err);
          return;
        }
        if (wantsAll) callback(null, addrs);
        else callback(null, addrs[0].address, addrs[0].family);
      },
      (e: unknown) => {
        const err = Object.assign(e instanceof Error ? e : new Error(String(e)), {
          code: (e as NodeJS.ErrnoException)?.code ?? "ENOTFOUND",
        });
        callback(err);
      },
    );
  };
}

const defaultTransport: Transport = ({ url, headers, lookup, signal }) =>
  new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      { method: "GET", headers, lookup: lookup as never, agent: false, signal },
      (res) => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: res,
          destroy: () => res.destroy(),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });

/** Returns a failure for URLs that must never be requested, else null. */
export function validateUrl(url: URL): FetchPageResult | null {
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "invalid_url" };
  if (url.username || url.password) return { ok: false, reason: "invalid_url", detail: "credentials" };
  if (url.port !== "" && url.port !== "80" && url.port !== "443") {
    return { ok: false, reason: "invalid_url", detail: "port" };
  }
  const host = url.hostname.toLowerCase();
  if (!host) return { ok: false, reason: "invalid_url" };
  if (host === "localhost" || host.endsWith(".localhost")) return { ok: false, reason: "blocked_address" };
  if (isIpLiteral(host) && isBlockedAddress(host)) return { ok: false, reason: "blocked_address" };
  return null;
}

function headerValue(h: string | string[] | undefined): string {
  return Array.isArray(h) ? (h[0] ?? "") : (h ?? "");
}

function findCharset(contentType: string, head: Buffer): string {
  const fromHeader = /charset\s*=\s*["']?([\w:.-]+)/i.exec(contentType);
  if (fromHeader) return fromHeader[1];
  const sniff = head.subarray(0, 4096).toString("latin1");
  const meta =
    /<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i.exec(sniff) ??
    /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset=([\w:.-]+)/i.exec(sniff);
  return meta ? meta[1] : "utf-8";
}

function decodeBody(buf: Buffer, contentType: string): string {
  const label = findCharset(contentType, buf);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label);
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(buf);
}

async function readBody(res: TransportResponse, maxBytes: number): Promise<Buffer> {
  const encoding = headerValue(res.headers["content-encoding"]).trim().toLowerCase();
  const stages: NodeJS.ReadWriteStream[] = [];
  if (encoding === "gzip" || encoding === "x-gzip") stages.push(zlib.createGunzip());
  else if (encoding === "deflate") stages.push(zlib.createInflate());
  else if (encoding === "br") stages.push(zlib.createBrotliDecompress());
  else if (encoding !== "" && encoding !== "identity") throw new Error(`Unsupported content-encoding ${encoding}`);

  let rawBytes = 0;
  async function* limitedRaw() {
    for await (const chunk of res.body) {
      rawBytes += chunk.byteLength;
      if (rawBytes > maxBytes) throw new TooLargeError();
      yield chunk;
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  // pipeline's overloads cannot express a variable number of stages; the call is simple at runtime.
  await (pipeline as (...args: unknown[]) => Promise<void>)(
    Readable.from(limitedRaw()),
    ...stages,
    async (source: AsyncIterable<Buffer | Uint8Array>) => {
      for await (const chunk of source) {
        const b = Buffer.from(chunk);
        total += b.length;
        // Checked on the DECOMPRESSED size so a small gzip bomb aborts immediately.
        if (total > maxBytes) throw new TooLargeError();
        chunks.push(b);
      }
    },
  );
  return Buffer.concat(chunks);
}

function mapError(e: unknown, timedOut: boolean): FetchPageResult {
  if (timedOut) return { ok: false, reason: "timeout" };
  if (e instanceof TooLargeError) return { ok: false, reason: "too_large" };
  const err = e as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
  if (err?.code === BLOCKED_CODE || err?.cause?.code === BLOCKED_CODE) return { ok: false, reason: "blocked_address" };
  if (err?.name === "AbortError" || err?.code === "ABORT_ERR") return { ok: false, reason: "timeout" };
  return { ok: false, reason: "network", detail: err?.code ?? err?.message };
}

/**
 * Fetches an HTML page from an arbitrary URL with SSRF protection:
 * http(s) on ports 80/443 only, no credentials, every redirect hop re-validated, every resolved DNS
 * address checked at connect time, 10 s overall timeout, 2 MB cap on the decompressed body.
 */
export async function fetchPage(rawUrl: string, deps: FetchPageDeps = {}): Promise<FetchPageResult> {
  const resolver = deps.resolver ?? defaultResolver;
  const transport = deps.transport ?? defaultTransport;
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? MAX_BODY_BYTES;
  const maxRedirects = deps.maxRedirects ?? MAX_REDIRECTS;
  const lookup = createGuardedLookup(resolver);
  const cookie = Object.entries(deps.extraHeaders ?? {}).find(([k]) => k.toLowerCase() === "cookie")?.[1];

  let current: URL;
  try {
    current = new URL(rawUrl.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  const originalHost = current.hostname.toLowerCase();

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  timeout.catch(() => {}); // avoid an unhandled rejection when the work finishes first

  let openResponse: TransportResponse | null = null;
  const work = (async (): Promise<FetchPageResult> => {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const invalid = validateUrl(current);
      if (invalid) return invalid;

      const res = await transport({
        url: current,
        lookup,
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "ro,en;q=0.8",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "gzip, deflate, br",
          ...(cookie && current.hostname.toLowerCase() === originalHost ? { Cookie: cookie } : {}),
        },
      });
      openResponse = res;
      const status = res.status;

      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = headerValue(res.headers.location);
        res.destroy();
        if (!location) return { ok: false, reason: "network", status, detail: "redirect without location" };
        try {
          current = new URL(location, current);
        } catch {
          return { ok: false, reason: "invalid_url", status };
        }
        continue;
      }

      if (status === 404 || status === 410) {
        res.destroy();
        return { ok: false, reason: "not_found", status };
      }
      if ([401, 402, 403, 406, 407, 429, 451].includes(status)) {
        res.destroy();
        return { ok: false, reason: "blocked_by_site", status };
      }
      if (status < 200 || status >= 300) {
        res.destroy();
        return { ok: false, reason: "network", status };
      }

      const contentType = headerValue(res.headers["content-type"]).toLowerCase();
      if (!/^\s*(text\/html|application\/xhtml\+xml)\b/.test(contentType)) {
        res.destroy();
        return { ok: false, reason: "not_html", status };
      }

      const declared = Number(headerValue(res.headers["content-length"]));
      const encoded = headerValue(res.headers["content-encoding"]).trim().toLowerCase();
      if (!encoded && Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        return { ok: false, reason: "too_large", status };
      }

      const buf = await readBody(res, maxBytes);
      return { ok: true, finalUrl: current.toString(), html: decodeBody(buf, contentType) };
    }
    return { ok: false, reason: "network", detail: "too many redirects" };
  })();

  try {
    return await Promise.race([work, timeout]);
  } catch (e) {
    return mapError(e, timedOut);
  } finally {
    clearTimeout(timer);
    work.catch(() => {});
    if (timedOut) (openResponse as TransportResponse | null)?.destroy();
  }
}
