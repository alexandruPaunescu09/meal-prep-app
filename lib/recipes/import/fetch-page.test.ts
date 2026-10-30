import net from "node:net";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  fetchPage,
  type Resolver,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from "./fetch-page";
import { isBlockedAddress } from "./ip-guard";
import { extractRecipeFromUrl } from "./index";

const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

interface FakeResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer | Buffer[];
  hang?: boolean;
}

/**
 * Fake transport that mimics a real socket: for hostnames it runs the guarded `lookup` exactly like
 * Node would at connect time (IP literals skip lookup), then answers from the `routes` map.
 */
function fake(routes: Record<string, FakeResponse | ((req: TransportRequest) => FakeResponse)>) {
  const calls: string[] = [];
  const transport: Transport = async (req) => {
    calls.push(req.url.toString());
    if (!net.isIP(req.url.hostname.replace(/^\[|\]$/g, ""))) {
      await new Promise<void>((resolve, reject) =>
        req.lookup(req.url.hostname, { all: true }, (err) => (err ? reject(err) : resolve())),
      );
    }
    const entry = routes[req.url.toString()];
    if (!entry) throw Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
    const r = typeof entry === "function" ? entry(req) : entry;
    if (r.hang) {
      await new Promise((_, reject) => req.signal.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    const chunks = Array.isArray(r.body) ? r.body : [r.body ?? Buffer.from("")];
    const res: TransportResponse = {
      status: r.status ?? 200,
      headers: { "content-type": "text/html; charset=utf-8", ...(r.headers ?? {}) },
      body: (async function* () {
        for (const c of chunks) yield c;
      })(),
      destroy() {},
    };
    return res;
  };
  return { transport, calls };
}

const html = (s: string) => Buffer.from(`<html><body>${s}</body></html>`);
const publicResolver: Resolver = async () => PUBLIC;

describe("isBlockedAddress", () => {
  it.each([
    "0.0.0.0", "10.1.2.3", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.0.0.1", "192.0.2.5", "192.168.1.1", "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "240.0.0.1",
    "255.255.255.255", "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "2001:db8::1", "::ffff:127.0.0.1",
    "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "64:ff9b::169.254.169.254", "2002:7f00:1::1", "not-an-ip",
  ])("blocks %s", (a) => expect(isBlockedAddress(a)).toBe(true));

  it.each(["93.184.216.34", "8.8.8.8", "100.63.255.255", "172.15.0.1", "172.32.0.1", "198.20.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808"])(
    "allows %s",
    (a) => expect(isBlockedAddress(a)).toBe(false),
  );
});

describe("fetchPage SSRF guard", () => {
  it("rejects non-http schemes", async () => {
    const { transport, calls } = fake({});
    for (const u of ["ftp://example.com/a", "file:///etc/passwd", "javascript:alert(1)", "not a url"]) {
      const r = await fetchPage(u, { transport, resolver: publicResolver });
      expect(r).toMatchObject({ ok: false, reason: "invalid_url" });
    }
    expect(calls).toHaveLength(0);
  });

  it("rejects non-default ports and embedded credentials", async () => {
    const { transport, calls } = fake({});
    expect(await fetchPage("http://example.com:8080/", { transport, resolver: publicResolver })).toMatchObject({ reason: "invalid_url" });
    expect(await fetchPage("https://example.com:22/", { transport, resolver: publicResolver })).toMatchObject({ reason: "invalid_url" });
    expect(await fetchPage("https://user:pw@example.com/", { transport, resolver: publicResolver })).toMatchObject({ reason: "invalid_url" });
    expect(calls).toHaveLength(0);
  });

  it("allows explicit 80/443", async () => {
    const { transport } = fake({ "http://example.com:80/": {}, "https://example.com/": { body: html("ok") } });
    expect(await fetchPage("https://example.com:443/", { transport, resolver: publicResolver })).toMatchObject({ ok: true });
  });

  it.each([
    "http://127.0.0.1/",
    "http://10.0.0.5/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[fe80::1]/",
    "http://2130706433/", // decimal form of 127.0.0.1, normalised by URL
    "http://0x7f.1/",
    "http://localhost/",
    "http://foo.localhost/",
  ])("blocks IP-literal / local host %s without connecting", async (u) => {
    const { transport, calls } = fake({});
    const r = await fetchPage(u, { transport, resolver: publicResolver });
    expect(r).toMatchObject({ ok: false, reason: "blocked_address" });
    expect(calls).toHaveLength(0);
  });

  it("blocks a hostname that resolves to a private IPv4", async () => {
    const { transport } = fake({ "https://evil.test/": { body: html("secret") } });
    const resolver: Resolver = async () => [{ address: "10.0.0.7", family: 4 }];
    expect(await fetchPage("https://evil.test/", { transport, resolver })).toMatchObject({ ok: false, reason: "blocked_address" });
  });

  it("blocks a hostname that resolves to loopback IPv6 or an IPv4-mapped address", async () => {
    const { transport } = fake({ "https://evil.test/": { body: html("secret") } });
    for (const address of ["::1", "::ffff:192.168.0.1"]) {
      const resolver: Resolver = async () => [{ address, family: 6 }];
      expect(await fetchPage("https://evil.test/", { transport, resolver })).toMatchObject({ reason: "blocked_address" });
    }
  });

  it("blocks when ANY resolved address is private (public answer mixed with a private one)", async () => {
    const { transport } = fake({ "https://mixed.test/": { body: html("secret") } });
    const resolver: Resolver = async () => [...PUBLIC, { address: "127.0.0.1", family: 4 }];
    expect(await fetchPage("https://mixed.test/", { transport, resolver })).toMatchObject({ reason: "blocked_address" });
  });

  it("maps resolver failures to network", async () => {
    const { transport } = fake({});
    const resolver: Resolver = async () => {
      throw Object.assign(new Error("nx"), { code: "ENOTFOUND" });
    };
    expect(await fetchPage("https://nx.test/", { transport, resolver })).toMatchObject({ reason: "network" });
  });

  it("re-validates redirect hops: redirect to a private IP literal", async () => {
    const { transport, calls } = fake({
      "https://a.test/": { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } },
    });
    const r = await fetchPage("https://a.test/", { transport, resolver: publicResolver });
    expect(r).toMatchObject({ ok: false, reason: "blocked_address" });
    expect(calls).toEqual(["https://a.test/"]);
  });

  it("re-validates redirect hops: redirect to a host resolving to a private address", async () => {
    const { transport } = fake({
      "https://a.test/": { status: 301, headers: { location: "https://internal.test/admin" } },
      "https://internal.test/admin": { body: html("secret") },
    });
    const resolver: Resolver = async (h) => (h === "internal.test" ? [{ address: "192.168.1.10", family: 4 }] : PUBLIC);
    expect(await fetchPage("https://a.test/", { transport, resolver })).toMatchObject({ reason: "blocked_address" });
  });

  it("rejects a redirect to a non-http scheme or odd port", async () => {
    const a = fake({ "https://a.test/": { status: 302, headers: { location: "file:///etc/passwd" } } });
    expect(await fetchPage("https://a.test/", { transport: a.transport, resolver: publicResolver })).toMatchObject({ reason: "invalid_url" });
    const b = fake({ "https://a.test/": { status: 302, headers: { location: "http://a.test:6379/" } } });
    expect(await fetchPage("https://a.test/", { transport: b.transport, resolver: publicResolver })).toMatchObject({ reason: "invalid_url" });
  });

  it("follows relative redirects and reports the final URL", async () => {
    const { transport } = fake({
      "https://a.test/old": { status: 301, headers: { location: "/new" } },
      "https://a.test/new": { body: html("hello") },
    });
    const r = await fetchPage("https://a.test/old", { transport, resolver: publicResolver });
    expect(r).toMatchObject({ ok: true, finalUrl: "https://a.test/new" });
  });

  it("stops after too many redirects", async () => {
    const routes: Record<string, FakeResponse> = {};
    for (let i = 0; i < 10; i++) routes[`https://a.test/${i}`] = { status: 302, headers: { location: `/${i + 1}` } };
    const { transport, calls } = fake(routes);
    const r = await fetchPage("https://a.test/0", { transport, resolver: publicResolver });
    expect(r).toMatchObject({ ok: false, reason: "network", detail: "too many redirects" });
    expect(calls).toHaveLength(6); // original + 5 hops
  });
});

describe("fetchPage responses", () => {
  const opts = { resolver: publicResolver };

  it("maps 401/402/403/429 to blocked_by_site and keeps the status", async () => {
    for (const status of [401, 402, 403, 429]) {
      const { transport } = fake({ "https://a.test/": { status } });
      expect(await fetchPage("https://a.test/", { transport, ...opts })).toEqual({ ok: false, reason: "blocked_by_site", status });
    }
  });

  it("maps 404/410 to not_found and 5xx to network", async () => {
    for (const status of [404, 410]) {
      const { transport } = fake({ "https://a.test/": { status } });
      expect(await fetchPage("https://a.test/", { transport, ...opts })).toEqual({ ok: false, reason: "not_found", status });
    }
    const { transport } = fake({ "https://a.test/": { status: 503 } });
    expect(await fetchPage("https://a.test/", { transport, ...opts })).toEqual({ ok: false, reason: "network", status: 503 });
  });

  it("rejects non-HTML content types", async () => {
    const { transport } = fake({ "https://a.test/": { headers: { "content-type": "application/pdf" }, body: Buffer.from("%PDF") } });
    expect(await fetchPage("https://a.test/", { transport, ...opts })).toMatchObject({ reason: "not_html" });
    const x = fake({ "https://a.test/": { headers: { "content-type": "application/xhtml+xml" }, body: html("x") } });
    expect(await fetchPage("https://a.test/", { transport: x.transport, ...opts })).toMatchObject({ ok: true });
  });

  it("aborts an oversized body", async () => {
    const big = Buffer.alloc(1024 * 1024, 97);
    const { transport } = fake({ "https://a.test/": { body: [big, big, big] } });
    expect(await fetchPage("https://a.test/", { transport, ...opts })).toMatchObject({ reason: "too_large" });
  });

  it("caps the DECOMPRESSED size (gzip bomb)", async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024, 97));
    expect(bomb.length).toBeLessThan(2 * 1024 * 1024);
    const { transport } = fake({ "https://a.test/": { headers: { "content-encoding": "gzip" }, body: bomb } });
    expect(await fetchPage("https://a.test/", { transport, ...opts })).toMatchObject({ reason: "too_large" });
  });

  it("decodes a gzip body", async () => {
    const { transport } = fake({
      "https://a.test/": { headers: { "content-encoding": "gzip" }, body: zlib.gzipSync(html("zipped é")) },
    });
    const r = await fetchPage("https://a.test/", { transport, ...opts });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.html).toContain("zipped é");
  });

  it("decodes deflate and brotli bodies", async () => {
    for (const [enc, body] of [["deflate", zlib.deflateSync(html("dd"))], ["br", zlib.brotliCompressSync(html("bb"))]] as const) {
      const { transport } = fake({ "https://a.test/": { headers: { "content-encoding": enc }, body } });
      const r = await fetchPage("https://a.test/", { transport, ...opts });
      expect(r.ok && r.html).toContain(enc === "br" ? "bb" : "dd");
    }
  });

  it("decodes windows-1250 via the Content-Type charset", async () => {
    // "ț" does not exist in windows-1250; use ž (0x9E) and ě (0xEC)
    const body = Buffer.concat([Buffer.from("<html><body>"), Buffer.from([0x9e, 0xec]), Buffer.from("</body></html>")]);
    const { transport } = fake({ "https://a.test/": { headers: { "content-type": "text/html; charset=windows-1250" }, body } });
    const r = await fetchPage("https://a.test/", { transport, ...opts });
    expect(r.ok && r.html).toContain("žě");
  });

  it("decodes windows-1250 via <meta charset> and falls back to utf-8 on an unknown label", async () => {
    const body = Buffer.concat([Buffer.from('<html><head><meta charset="windows-1250"></head><body>'), Buffer.from([0x9e]), Buffer.from("</body></html>")]);
    const a = fake({ "https://a.test/": { headers: { "content-type": "text/html" }, body } });
    const r = await fetchPage("https://a.test/", { transport: a.transport, ...opts });
    expect(r.ok && r.html).toContain("ž");
    const b = fake({ "https://a.test/": { headers: { "content-type": "text/html; charset=bogus-9" }, body: html("ţ") } });
    const r2 = await fetchPage("https://a.test/", { transport: b.transport, ...opts });
    expect(r2.ok && r2.html).toContain("ţ");
  });

  it("times out a hanging server", async () => {
    const { transport } = fake({ "https://a.test/": { hang: true } });
    expect(await fetchPage("https://a.test/", { transport, ...opts, timeoutMs: 30 })).toMatchObject({ ok: false, reason: "timeout" });
  });

  it("times out even when the transport ignores the abort signal", async () => {
    const transport: Transport = () => new Promise(() => {});
    expect(await fetchPage("https://a.test/", { transport, ...opts, timeoutMs: 30 })).toMatchObject({ reason: "timeout" });
  });

  it("sends the plain UA and Accept-Language", async () => {
    let seen: Record<string, string> = {};
    const { transport } = fake({
      "https://a.test/": (req) => {
        seen = req.headers;
        return { body: html("x") };
      },
    });
    await fetchPage("https://a.test/", { transport, ...opts });
    expect(seen["User-Agent"]).toBe("meal-prep-app/1.0 (recipe import)");
    expect(seen["Accept-Language"]).toBe("ro,en;q=0.8");
  });
});

describe("fetchPage extraHeaders", () => {
  it("sends the Cookie header to the original host only, never to a redirect target", async () => {
    const seen: Record<string, string | undefined> = {};
    const record = (req: TransportRequest) => {
      seen[req.url.hostname] = req.headers.Cookie;
      return {};
    };
    const { transport } = fake({
      "https://a.test/": { status: 302, headers: { location: "https://b.test/x" } },
      "https://b.test/x": (req) => ({ ...record(req), body: html("ok") }),
    });
    const r = await fetchPage("https://a.test/", {
      transport,
      resolver: publicResolver,
      extraHeaders: { Cookie: "CONSENT=YES+1; SOCS=CAI" },
    });
    expect(r.ok).toBe(true);
    expect(seen["b.test"]).toBeUndefined();
  });

  it("sends the Cookie on the first hop and ignores every other extra header", async () => {
    let headers: Record<string, string> = {};
    const { transport } = fake({
      "https://a.test/": (req) => {
        headers = req.headers;
        return { body: html("ok") };
      },
    });
    await fetchPage("https://a.test/", {
      transport,
      resolver: publicResolver,
      extraHeaders: { Cookie: "a=b", Host: "169.254.169.254", Authorization: "x" },
    });
    expect(headers.Cookie).toBe("a=b");
    expect(headers.Host).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it("still blocks private addresses when extra headers are set", async () => {
    const { transport, calls } = fake({});
    const r = await fetchPage("http://169.254.169.254/", {
      transport,
      resolver: publicResolver,
      extraHeaders: { Cookie: "a=b" },
    });
    expect(r).toMatchObject({ ok: false, reason: "blocked_address" });
    expect(calls).toHaveLength(0);
  });
});

describe("extractRecipeFromUrl", () => {
  it("returns the failure reason and status for a blocked site", async () => {
    const { transport } = fake({ "https://a.test/": { status: 403 } });
    expect(await extractRecipeFromUrl("https://a.test/", { transport, resolver: publicResolver })).toEqual({
      ok: false,
      reason: "blocked_by_site",
      status: 403,
    });
  });

  it("extracts JSON-LD from a fetched page", async () => {
    const ld = JSON.stringify({ "@type": "Recipe", name: "Supa", recipeIngredient: ["1 g sare"], recipeInstructions: ["Fierbe."] });
    const { transport } = fake({ "https://a.test/": { body: Buffer.from(`<script type="application/ld+json">${ld}</script>`) } });
    const r = await extractRecipeFromUrl("https://a.test/", { transport, resolver: publicResolver });
    expect(r).toMatchObject({ ok: true, source: "json-ld", finalUrl: "https://a.test/" });
    if (r.ok && r.source === "json-ld") expect(r.recipe.name).toBe("Supa");
  });

  it("falls back to page text", async () => {
    const { transport } = fake({ "https://a.test/": { body: Buffer.from("<html><head><title>T</title></head><body><main>Reteta fara date</main></body></html>") } });
    const r = await extractRecipeFromUrl("https://a.test/", { transport, resolver: publicResolver });
    expect(r).toMatchObject({ ok: true, source: "page-text", title: "T", text: "Reteta fara date" });
  });
});
