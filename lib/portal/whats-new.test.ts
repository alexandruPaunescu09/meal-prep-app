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
