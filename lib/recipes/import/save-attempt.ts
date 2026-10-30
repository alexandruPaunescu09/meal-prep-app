/**
 * A tab's save gate. Reads the latest validated state at invocation, rejects concurrent
 * calls synchronously, and stays closed after a committed save (including stale toast retries).
 */
export function createSaveAttempt<T>() {
  let busy = false;
  let committed = false;
  return {
    async run(latest: () => T | null, write: (value: T) => Promise<void>): Promise<boolean> {
      if (busy || committed) return false;
      busy = true;
      try {
        const value = latest();
        if (value === null) return false;
        await write(value);
        committed = true;
        return true;
      } finally {
        busy = false;
      }
    },
  };
}
