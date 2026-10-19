"use client";

import { useEffect, useState } from "react";
import { Loader2, WifiOff } from "lucide-react";
import type { CatalogItem } from "@/lib/supabase/types";
import { PickList, type RowFavorite } from "@/components/portal/food-search";
import { formatEntryAmount } from "@/lib/portal/format-amount";
import type { RecentItem } from "@/lib/portal/recents";

type Status = "loading" | "ready" | "error" | "offline";

/**
 * Recent items (last 30 days, newest first). Loaded once per add-food sheet so the sheet can open
 * on this tab only when there is something to show. Needs a connection.
 */
export function useRecents(online: boolean) {
  const [status, setStatus] = useState<Status>(online ? "loading" : "offline");
  const [items, setItems] = useState<RecentItem[]>([]);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!online) return;
    const ctrl = new AbortController();
    (async () => {
      setStatus("loading");
      try {
        const r = await fetch("/api/portal/foods/recent", { signal: ctrl.signal });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { results: RecentItem[] };
        setItems(j.results);
        setStatus("ready");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    })();
    return () => ctrl.abort();
  }, [online, retry]);

  return { status: online ? status : ("offline" as Status), items, reload: () => setRetry((n) => n + 1) };
}

/** Recent tab of the add-food sheet. Picking a row opens the amount picker on the last amount. */
export default function RecentList({
  recents,
  onPick,
  rowFavorite,
}: {
  recents: ReturnType<typeof useRecents>;
  onPick: (recent: RecentItem) => void;
  rowFavorite: (item: CatalogItem) => RowFavorite;
}) {
  if (recents.status === "offline") {
    return (
      <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
        <WifiOff className="w-4 h-4 shrink-0" />
        Recent foods need a connection. You can still use Quick add offline.
      </p>
    );
  }
  if (recents.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading recent foods…
      </p>
    );
  }
  if (recents.status === "error") {
    return (
      <p className="text-sm text-red-700">
        Could not load recent foods.{" "}
        <button type="button" onClick={recents.reload} className="underline">
          Try again
        </button>
      </p>
    );
  }
  if (recents.items.length === 0) {
    return <p className="text-sm text-gray-600">Foods you log will show up here for 30 days.</p>;
  }
  return (
    <PickList
      label="Recent foods"
      rows={recents.items.map((r) => ({
        item: r.item,
        detail: `Last: ${formatEntryAmount(r.quantity, r.unit)}`,
      }))}
      onPick={(_item, i) => onPick(recents.items[i])}
      favorite={rowFavorite}
    />
  );
}
