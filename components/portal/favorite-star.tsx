"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { CatalogItem } from "@/lib/supabase/types";
import { useToast } from "@/components/ui/toast";
import { refKey } from "@/lib/portal/recents";

/** Star toggle. Sits inside rows and the amount picker header; never submits a form. */
export default function FavoriteStar({
  on,
  name,
  disabled,
  onToggle,
}: {
  on: boolean;
  name: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favorites` : `Add ${name} to favorites`}
      title={disabled ? "Favorites need a connection" : on ? "Remove from favorites" : "Add to favorites"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="shrink-0 inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-full text-gray-400 hover:text-amber-500 disabled:opacity-40"
      data-testid="favorite-star"
    >
      <Star className={`w-5 h-5 ${on ? "fill-amber-400 text-amber-500" : ""}`} aria-hidden />
    </button>
  );
}

type Status = "loading" | "ready" | "error" | "offline";

/**
 * The customer's favorites, loaded once per add-food sheet. `toggle` is optimistic: the star flips
 * at once and rolls back with a toast when the request fails. Needs a connection (no offline queue).
 */
export function useFavorites(online: boolean) {
  const toast = useToast();
  const [status, setStatus] = useState<Status>(online ? "loading" : "offline");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [retry, setRetry] = useState(0);
  const busy = useRef(new Set<string>());

  useEffect(() => {
    if (!online) return;
    const ctrl = new AbortController();
    (async () => {
      setStatus("loading");
      try {
        const r = await fetch("/api/portal/foods/favorites", { signal: ctrl.signal });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { results: CatalogItem[]; keys: string[] };
        setItems(j.results);
        setKeys(new Set(j.keys));
        setStatus("ready");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    })();
    return () => ctrl.abort();
  }, [online, retry]);

  const toggle = useCallback(
    async (item: CatalogItem) => {
      const key = refKey(item);
      if (busy.current.has(key)) return;
      busy.current.add(key);
      const wasOn = keys.has(key);
      const apply = (on: boolean) => {
        setKeys((prev) => {
          const next = new Set(prev);
          if (on) next.add(key);
          else next.delete(key);
          return next;
        });
        setItems((prev) =>
          on
            ? prev.some((i) => refKey(i) === key)
              ? prev
              : [item, ...prev]
            : prev.filter((i) => refKey(i) !== key)
        );
      };
      apply(!wasOn);
      try {
        const r = wasOn
          ? await fetch(
              `/api/portal/foods/favorites?kind=${item.kind}&id=${encodeURIComponent(item.id)}`,
              { method: "DELETE" }
            )
          : await fetch("/api/portal/foods/favorites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: item.kind, id: item.id }),
            });
        if (!r.ok) throw new Error(String(r.status));
      } catch {
        apply(wasOn);
        toast.error(wasOn ? "Could not remove the favorite" : "Could not save the favorite");
      } finally {
        busy.current.delete(key);
      }
    },
    [keys, toast]
  );

  return useMemo(
    () => ({
      status: online ? status : ("offline" as Status),
      items,
      isFavorite: (item: CatalogItem) => keys.has(refKey(item)),
      toggle,
      reload: () => setRetry((n) => n + 1),
    }),
    [online, status, items, keys, toggle]
  );
}
