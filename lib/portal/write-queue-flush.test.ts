import { describe, expect, it, vi } from "vitest";
import {
  dropSuperseded,
  enqueue,
  isVisibleTo,
  runFlush,
  type OwnedItem,
  type SendOutcome,
} from "./write-queue-logic";

type Item = OwnedItem;
const status = (entry: string) => ({ kind: "status" as const, payload: { meal_plan_entry_id: entry } });
const st = (id: string, entry: string, owner?: string): Item => ({
  ...status(entry),
  id,
  ...(owner ? { owner } : {}),
});

describe("enqueue", () => {
  it("tags the new write with the owner, and omits the tag when no owner is known", () => {
    expect(enqueue<Item>([], status("e1"), "1", "A")).toEqual([st("1", "e1", "A")]);
    expect(enqueue<Item>([], status("e1"), "1", undefined)).toEqual([st("1", "e1")]);
  });

  it("supersedes the owner's own and legacy writes but never another user's kept items", () => {
    const items = [st("1", "e1", "A"), st("2", "e1", "B"), st("3", "e1")];
    expect(enqueue<Item>(items, status("e1"), "4", "A").map((i) => i.id)).toEqual(["2", "4"]);
  });
});

describe("isVisibleTo / dropSuperseded", () => {
  it("shows own and legacy (ownerless) items only", () => {
    expect(isVisibleTo({ owner: "A" }, "A")).toBe(true);
    expect(isVisibleTo({}, "A")).toBe(true);
    expect(isVisibleTo({ owner: "B" }, "A")).toBe(false);
    expect(isVisibleTo({ owner: "A" }, undefined)).toBe(false);
  });

  it("dropSuperseded leaves other users' items alone", () => {
    const items = [st("1", "e1", "A"), st("2", "e1", "B")];
    expect(dropSuperseded(items, status("e1"), "A").map((i) => i.id)).toEqual(["2"]);
  });
});

/** In-memory fake of the persisted queue; read() returns fresh copies like JSON.parse would. */
function fakeStore(initial: Item[]) {
  const store = { items: [...initial], writes: 0 };
  return {
    store,
    read: () => store.items.map((i) => ({ ...i })),
    write: (items: Item[]) => {
      store.items = items;
      store.writes += 1;
    },
  };
}

describe("runFlush", () => {
  it("skips the flush (no sends, no writes) when no owner is known", async () => {
    const f = fakeStore([st("1", "e1", "A")]);
    const send = vi.fn(async (): Promise<SendOutcome> => "ok");
    const r = await runFlush<Item>({ ...f, getUserId: async () => undefined, send });
    expect(r).toEqual({ flushed: 0, remaining: 0 }); // A's item is not visible without an owner
    expect(send).not.toHaveBeenCalled();
    expect(f.store.writes).toBe(0);
    expect(f.store.items).toHaveLength(1);
  });

  it("a write queued during the session await survives and is flushed (no stale snapshot write)", async () => {
    const f = fakeStore([st("1", "e1", "A")]);
    const sent: string[] = [];
    const r = await runFlush<Item>({
      ...f,
      getUserId: async () => {
        f.store.items.push(st("2", "e2", "A")); // queueWrite during the await
        return "A";
      },
      send: async (i) => {
        sent.push(i.id);
        return "keep"; // offline: nothing is removed
      },
    });
    expect(sent).toEqual(["1", "2"]);
    expect(f.store.items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(r.remaining).toBe(2);
  });

  it("does not resurrect an item dropped during the await", async () => {
    const f = fakeStore([st("1", "e1", "A"), st("2", "e2", "A")]);
    const sent: string[] = [];
    await runFlush<Item>({
      ...f,
      getUserId: async () => {
        f.store.items = f.store.items.filter((i) => i.id !== "1"); // dropQueued during the await
        return "A";
      },
      send: async (i) => {
        sent.push(i.id);
        return "keep";
      },
    });
    expect(sent).toEqual(["2"]);
    expect(f.store.items.map((i) => i.id)).toEqual(["2"]);
  });

  it("does not send an item superseded while an earlier item was in flight", async () => {
    const f = fakeStore([st("1", "e1", "A"), st("2", "e2", "A")]);
    const sent: string[] = [];
    await runFlush<Item>({
      ...f,
      getUserId: async () => "A",
      send: async (i) => {
        sent.push(i.id);
        f.store.items = f.store.items.filter((x) => x.id !== "2");
        return "ok";
      },
    });
    expect(sent).toEqual(["1"]);
  });

  it("removes only finished items, by id, from CURRENT storage (writes queued mid-send survive)", async () => {
    const f = fakeStore([st("1", "e1", "A")]);
    const r = await runFlush<Item>({
      ...f,
      getUserId: async () => "A",
      send: async () => {
        f.store.items.push(st("9", "e9", "A")); // queued while the request is in flight
        return "ok";
      },
    });
    expect(r).toEqual({ flushed: 1, remaining: 1 });
    expect(f.store.items.map((i) => i.id)).toEqual(["9"]);
  });

  it("keeps another user's items in storage but never sends them", async () => {
    const f = fakeStore([st("1", "e1", "B"), st("2", "e2", "A"), st("3", "e3")]);
    const sent: string[] = [];
    const r = await runFlush<Item>({
      ...f,
      getUserId: async () => "A",
      send: async (i) => {
        sent.push(i.id);
        return "ok";
      },
    });
    expect(sent).toEqual(["2", "3"]);
    expect(f.store.items.map((i) => i.id)).toEqual(["1"]);
    expect(r).toEqual({ flushed: 2, remaining: 0 }); // B's leftover is not counted for A
  });

  it("makes no write when nothing finished", async () => {
    const f = fakeStore([st("1", "e1", "A")]);
    await runFlush<Item>({ ...f, getUserId: async () => "A", send: async () => "keep" });
    expect(f.store.writes).toBe(0);
  });
});
