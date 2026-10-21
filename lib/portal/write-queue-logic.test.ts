import { describe, expect, it } from "vitest";
import { queueKey, requestFor, stubFor, withoutSuperseded, type QueueLike } from "./write-queue-logic";

const status = (id: string): QueueLike => ({ kind: "status", payload: { meal_plan_entry_id: id } });
const review = (id: string): QueueLike => ({ kind: "review", payload: { meal_plan_entry_id: id } });
const upsert = (id: string): QueueLike => ({ kind: "diary-upsert", payload: { id } });
const del = (id: string): QueueLike => ({ kind: "diary-delete", payload: { id } });

describe("queueKey / withoutSuperseded", () => {
  it("keeps review/status behaviour: same kind + entry supersedes, other kinds do not", () => {
    const items = [status("e1"), review("e1"), status("e2")];
    expect(withoutSuperseded(items, status("e1"))).toEqual([review("e1"), status("e2")]);
    expect(withoutSuperseded(items, review("e1"))).toEqual([status("e1"), status("e2")]);
  });

  it("diary upserts of the same id supersede each other", () => {
    expect(withoutSuperseded([upsert("a"), upsert("b")], upsert("a"))).toEqual([upsert("b")]);
  });

  it("a delete replaces a pending upsert for the same id, and vice versa", () => {
    expect(withoutSuperseded([upsert("a"), upsert("b")], del("a"))).toEqual([upsert("b")]);
    expect(withoutSuperseded([del("a")], upsert("a"))).toEqual([]);
  });

  it("diary ids never collide with meal_plan_entry ids", () => {
    expect(queueKey(status("x"))).not.toBe(queueKey(upsert("x")));
    expect(withoutSuperseded([status("x")], upsert("x"))).toEqual([status("x")]);
  });

  it("stubFor builds the key used by dropQueued", () => {
    expect(queueKey(stubFor("diary-delete", "a"))).toBe(queueKey(upsert("a")));
    expect(queueKey(stubFor("status", "e1"))).toBe(queueKey(status("e1")));
  });
});

describe("requestFor", () => {
  it("maps kinds to endpoints", () => {
    expect(requestFor({ kind: "review", payload: { a: 1 } })).toMatchObject({ url: "/api/portal/reviews", method: "POST" });
    expect(requestFor({ kind: "status", payload: {} })).toMatchObject({ url: "/api/portal/status", method: "POST" });
    expect(requestFor({ kind: "diary-upsert", payload: { id: "a" } })).toMatchObject({ url: "/api/portal/diary", method: "POST" });
    const d = requestFor({ kind: "diary-delete", payload: { id: "a b" } });
    expect(d).toEqual({ url: "/api/portal/diary?id=a%20b", method: "DELETE" });
  });
});
