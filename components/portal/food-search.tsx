"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Search, WifiOff } from "lucide-react";
import type { CatalogItem } from "@/lib/supabase/types";
import { formatNumber } from "@/lib/format";
import { useListboxNav } from "@/lib/hooks/use-listbox-nav";
import FavoriteStar from "@/components/portal/favorite-star";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Live navigator.onLine (true during SSR). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
}

/** "120 kcal / 100 g", "95 kcal / serving (30 g)", "320 kcal / portion". */
export function describeKcal(item: CatalogItem): string {
  if (item.kind === "recipe") {
    return `${formatNumber(Math.round(item.perPortion?.calories ?? 0), 0)} kcal / portion`;
  }
  const per100 = item.per100?.calories ?? 0;
  if (item.servingSize && item.servingSize > 0) {
    const perServing = (per100 * item.servingSize) / 100;
    return `${formatNumber(Math.round(perServing), 0)} kcal / serving (${formatNumber(item.servingSize, 0)} ${item.unit})`;
  }
  return `${formatNumber(Math.round(per100), 0)} kcal / 100 ${item.unit}`;
}

/** Star state for a row: absent = no star shown. */
export interface RowFavorite {
  on: boolean;
  disabled?: boolean;
  onToggle: (item: CatalogItem) => void;
}

/** One catalog row. Shared by search results and the recents / favorites lists. */
export function FoodRow({
  item,
  index,
  optionProps,
  active,
  onPick,
  detail,
  favorite,
}: {
  item: CatalogItem;
  index: number;
  optionProps: Record<string, unknown>;
  active: boolean;
  onPick: (item: CatalogItem) => void;
  /** Extra subtitle part, e.g. the last-used amount. */
  detail?: string;
  favorite?: RowFavorite;
}) {
  return (
    <li
      {...optionProps}
      role="option"
      aria-selected={active}
      onClick={() => onPick(item)}
      className={`flex items-center gap-3 px-4 py-3 min-h-[56px] cursor-pointer ${
        active ? "bg-emerald-50" : "hover:bg-gray-50"
      }`}
      data-testid={`food-row-${index}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-gray-900 truncate">
          {item.name}
          {item.kind === "recipe" && (
            <span className="ml-2 text-[11px] font-normal text-gray-500">Recipe</span>
          )}
        </span>
        <span className="block text-xs text-gray-500 truncate">
          {[item.brand, detail, describeKcal(item)].filter(Boolean).join(" · ")}
        </span>
      </span>
      {!item.verified && (
        <span className="shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800">
          Unverified
        </span>
      )}
      {favorite && (
        <FavoriteStar
          on={favorite.on}
          disabled={favorite.disabled}
          name={item.name}
          onToggle={() => favorite.onToggle(item)}
        />
      )}
    </li>
  );
}

/** Debounced catalog search with keyboard navigation. Calls `onPick` with the chosen item. */
export default function FoodSearch({
  onPick,
  favorite,
}: {
  onPick: (item: CatalogItem) => void;
  /** Star toggle for each result; receives the row's item. */
  favorite?: (item: CatalogItem) => RowFavorite;
}) {
  const online = useOnline();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [retry, setRetry] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const q = query.trim();
  const ready = q.length >= MIN_CHARS;

  useEffect(() => {
    if (!ready || !online) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const r = await fetch(`/api/portal/foods/search?q=${encodeURIComponent(q)}&limit=20`, {
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { results: CatalogItem[] };
        setResults(j.results);
        setStatus("done");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, ready, online, retry]);

  const shown = ready && status === "done" ? results : [];
  const nav = useListboxNav({
    count: shown.length,
    onSelect: (i) => onPick(shown[i]),
    idPrefix: listId,
    listRef,
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          aria-hidden
          className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          aria-activedescendant={nav.activeId}
          aria-label="Search foods"
          autoComplete="off"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={nav.onKeyDown}
          placeholder="Search foods, ingredients, your meals"
          className="w-full min-h-[44px] pl-9 pr-3 rounded-lg border border-gray-300 bg-white text-base md:text-sm text-gray-900"
        />
      </div>

      {!online ? (
        <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          Search needs a connection. You can still use Quick add offline.
        </p>
      ) : !ready ? (
        <p className="text-sm text-gray-500">Type at least {MIN_CHARS} letters to search.</p>
      ) : status === "error" ? (
        <p className="text-sm text-red-700">
          Search failed.{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="underline">
            Try again
          </button>
        </p>
      ) : status === "loading" || status === "idle" ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Searching…
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-600">
          Nothing found for “{q}”. Try another word, or use Quick add.
        </p>
      ) : (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Search results"
          className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white max-h-[45vh] overflow-y-auto overscroll-contain"
        >
          {shown.map((item, i) => (
            <FoodRow
              key={`${item.kind}:${item.id}`}
              item={item}
              index={i}
              optionProps={nav.getOptionProps(i)}
              active={i === nav.activeIndex}
              onPick={onPick}
              favorite={favorite?.(item)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A keyboard-navigable list of catalog rows (recents, favorites). Arrow keys move, Enter picks;
 * rows can carry a detail text and a star.
 */
export function PickList({
  label,
  rows,
  onPick,
  favorite,
}: {
  label: string;
  rows: { item: CatalogItem; detail?: string }[];
  onPick: (item: CatalogItem, index: number) => void;
  favorite?: (item: CatalogItem) => RowFavorite;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const nav = useListboxNav({
    count: rows.length,
    onSelect: (i) => onPick(rows[i].item, i),
    idPrefix: listId,
    listRef,
  });
  return (
    <ul
      id={listId}
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={nav.activeId}
      onKeyDown={nav.onKeyDown}
      className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white max-h-[45vh] overflow-y-auto overscroll-contain"
    >
      {rows.map((r, i) => (
        <FoodRow
          key={`${r.item.kind}:${r.item.id}`}
          item={r.item}
          index={i}
          detail={r.detail}
          optionProps={nav.getOptionProps(i)}
          active={i === nav.activeIndex}
          onPick={(it) => onPick(it, i)}
          favorite={favorite?.(r.item)}
        />
      ))}
    </ul>
  );
}
