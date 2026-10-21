"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { FoodLogEntry } from "@/lib/supabase/types";
import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { useToast } from "@/components/ui/toast";
import { mergeLogEntries, visiblePending } from "@/lib/portal/diary-merge";
import { optimisticEntry, type SnapshotLike } from "@/lib/portal/diary-draft";
import { useOwnerId } from "@/lib/portal/owner";
import { deleteDiaryEntry, saveDiaryEntry } from "@/lib/portal/save-diary";
import {
  beginInflight,
  endInflight,
  isUnsynced,
  markQueued,
  pruneSettled,
  putPending,
  removePending,
  settleFlushed,
  settlePending,
  usePendingDiary,
} from "@/lib/portal/pending-diary";

/**
 * The day's diary entries with the customer's own unsynced changes applied on top of the server
 * data, plus optimistic save/remove. Failed writes roll back with a toast; offline writes stay
 * visible (and flagged) until the queue flushes.
 */
export function useDiaryLog(logEntries: FoodLogEntry[], selectedDate: string) {
  const router = useRouter();
  const toast = useToast();
  const owner = useOwnerId();
  const allPending = usePendingDiary();
  // Another user's leftover records stay in storage but are never shown.
  const pending = useMemo(() => visiblePending(allPending, owner), [allPending, owner]);

  const entries = useMemo(
    () => mergeLogEntries(logEntries, pending, selectedDate),
    [logEntries, pending, selectedDate]
  );

  // Fresh server data is on screen: settled records have done their job.
  useEffect(() => {
    pruneSettled();
  }, [logEntries]);

  // Settle writes that flushed (here or in another tab / before a reload).
  useEffect(() => {
    settleFlushed();
    const onFlushed = () => settleFlushed();
    window.addEventListener("portal:queue-flushed", onFlushed);
    return () => window.removeEventListener("portal:queue-flushed", onFlushed);
  }, []);

  const save = useCallback(
    async (input: DiaryEntryInput, snapshot: SnapshotLike): Promise<boolean> => {
      putPending({
        op: "upsert",
        entry: optimisticEntry(input, snapshot, "local"),
        settled: false,
      });
      beginInflight(input.id);
      try {
        if ((await saveDiaryEntry(input)) === "saved") {
          settlePending(input.id);
          router.refresh();
        } else {
          markQueued(input.id);
        }
        return true;
      } catch (e) {
        removePending(input.id);
        toast.error(e instanceof Error ? e.message : "Could not save entry");
        return false;
      } finally {
        endInflight(input.id);
      }
    },
    [router, toast]
  );

  const remove = useCallback(
    async (entry: FoodLogEntry): Promise<boolean> => {
      putPending({ op: "delete", id: entry.id, settled: false });
      beginInflight(entry.id);
      try {
        if ((await deleteDiaryEntry(entry.id)) === "saved") {
          settlePending(entry.id);
          router.refresh();
        } else {
          markQueued(entry.id);
        }
        return true;
      } catch (e) {
        removePending(entry.id);
        toast.error(e instanceof Error ? e.message : "Could not delete entry");
        return false;
      } finally {
        endInflight(entry.id);
      }
    },
    [router, toast]
  );

  const unsynced = useCallback((id: string) => isUnsynced(pending, id), [pending]);

  return { entries, save, remove, unsynced };
}
