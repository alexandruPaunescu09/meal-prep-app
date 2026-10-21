import { describe, expect, it } from "vitest";
import { RELEASES, pendingReleases, type Release } from "./whats-new";

const rel = (id: string, date: string): Release => ({ id, date, items: [] });
const releases = [rel("c", "2026-12-01"), rel("b", "2026-11-01"), rel("a", "2026-10-01")];
const old = "2026-01-01T10:00:00Z";
const ids = (r: Release[]) => r.map((x) => x.id);

describe("pendingReleases", () => {
  it("shows everything, newest first, when never seen", () => {
    expect(ids(pendingReleases({ seenId: null, accountCreatedAt: old, releases }))).toEqual(["c", "b", "a"]);
  });
  it("shows nothing when the newest was seen", () => {
    expect(pendingReleases({ seenId: "c", accountCreatedAt: old, releases })).toEqual([]);
  });
  it("shows only releases newer than an older seen one", () => {
    expect(ids(pendingReleases({ seenId: "a", accountCreatedAt: old, releases }))).toEqual(["c", "b"]);
  });
  it("hides releases dated on or before account creation", () => {
    expect(ids(pendingReleases({ seenId: null, accountCreatedAt: "2026-11-01T08:00:00Z", releases }))).toEqual(["c"]);
    expect(pendingReleases({ seenId: null, accountCreatedAt: "2027-01-01T00:00:00Z", releases })).toEqual([]);
  });
  it("uses the Bucharest calendar day, not the UTC day", () => {
    const one = [rel("x", "2026-10-21")];
    // 21:30 UTC on 20 Oct = 00:30 on 21 Oct in Bucharest (UTC+3): same day as release, hidden
    expect(pendingReleases({ seenId: null, accountCreatedAt: "2026-10-20T21:30:00Z", releases: one })).toEqual([]);
    // 20:30 UTC on 20 Oct = 23:30 on 20 Oct in Bucharest: strictly before, shown
    expect(ids(pendingReleases({ seenId: null, accountCreatedAt: "2026-10-20T20:30:00Z", releases: one }))).toEqual(["x"]);
    // 22:30 UTC on 20 Oct is already 21 Oct locally (the UTC day would wrongly show it)
    expect(pendingReleases({ seenId: null, accountCreatedAt: "2026-10-20T22:30:00Z", releases: one })).toEqual([]);
  });
  it("shows nothing for a missing or invalid created_at", () => {
    expect(pendingReleases({ seenId: null, accountCreatedAt: null, releases })).toEqual([]);
    expect(pendingReleases({ seenId: null, accountCreatedAt: undefined, releases })).toEqual([]);
    expect(pendingReleases({ seenId: null, accountCreatedAt: "garbage", releases })).toEqual([]);
  });
  it("treats an unknown seen id as never seen", () => {
    expect(ids(pendingReleases({ seenId: "zzz", accountCreatedAt: old, releases }))).toEqual(["c", "b", "a"]);
  });
});

describe("RELEASES registry", () => {
  it("has unique ids, newest first", () => {
    const list = RELEASES.map((r) => r.id);
    expect(new Set(list).size).toBe(list.length);
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
