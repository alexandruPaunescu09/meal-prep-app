import { describe, expect, it, vi } from "vitest";
import { createSaveAttempt } from "./save-attempt";

describe("save attempt", () => {
  it("retry reads edited state and refuses newly invalid drafts", async () => {
    const gate = createSaveAttempt<{ qty: number }>();
    let current: { qty: number } | null = { qty: 100 };
    const latest = () => current;
    const write = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const retry = () => gate.run(latest, write);
    await expect(retry()).rejects.toThrow("offline");
    current = null;
    expect(await retry()).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    current = { qty: 2 };
    expect(await retry()).toBe(true);
    expect(write).toHaveBeenLastCalledWith({ qty: 2 });
  });

  it("synchronously excludes Approve/Retry overlap and stale retries after success", async () => {
    const gate = createSaveAttempt<number>();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const write = vi.fn(() => pending);
    const first = gate.run(() => 1, write);
    expect(await gate.run(() => 2, write)).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe(true);
    expect(await gate.run(() => 3, write)).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("unlocks after validation throws or a network write fails", async () => {
    const gate = createSaveAttempt<number>();
    const write = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
    await expect(gate.run(() => { throw new Error("invalid"); }, write)).rejects.toThrow("invalid");
    await expect(gate.run(() => 1, write)).rejects.toThrow("failed");
    expect(await gate.run(() => 2, write)).toBe(true);
  });
});
