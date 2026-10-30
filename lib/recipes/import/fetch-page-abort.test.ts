import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";

// Forces the ordering that made "caps the DECOMPRESSED size" flaky on CI: when the size cap tears the
// pipeline down, the rejection that reaches fetchPage is an AbortError instead of the TooLargeError.
vi.mock("node:stream/promises", async () => {
  const actual = await vi.importActual<typeof import("node:stream/promises")>("node:stream/promises");
  return {
    ...actual,
    pipeline: async (...args: unknown[]) => {
      try {
        await (actual.pipeline as (...a: unknown[]) => Promise<void>)(...args);
      } catch {
        throw Object.assign(new Error("The operation was aborted"), { name: "AbortError", code: "ABORT_ERR" });
      }
    },
  };
});

import { fetchPage, type Resolver, type Transport } from "./fetch-page";

const resolver: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];

function transportFor(body: Buffer, extra: Record<string, string> = {}): Transport {
  return async () => ({
    status: 200,
    headers: { "content-type": "text/html", ...extra },
    body: (async function* () {
      yield body;
    })(),
    destroy() {},
  });
}

describe("fetchPage size cap vs abort ordering", () => {
  it("reports too_large when the raw cap fires and the teardown surfaces an AbortError", async () => {
    const r = await fetchPage("https://a.test/", { resolver, transport: transportFor(Buffer.alloc(3 * 1024 * 1024, 97)) });
    expect(r).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("reports too_large when the decompressed cap fires and the teardown surfaces an AbortError", async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024, 97));
    const r = await fetchPage("https://a.test/", { resolver, transport: transportFor(bomb, { "content-encoding": "gzip" }) });
    expect(r).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("still reports timeout for a genuine abort that is not a size-cap teardown", async () => {
    const transport: Transport = async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: (async function* () {
        yield Buffer.from("<html>");
        throw Object.assign(new Error("aborted"), { name: "AbortError", code: "ABORT_ERR" });
      })(),
      destroy() {},
    });
    const r = await fetchPage("https://a.test/", { resolver, transport });
    expect(r).toMatchObject({ ok: false, reason: "timeout" });
  });
});
