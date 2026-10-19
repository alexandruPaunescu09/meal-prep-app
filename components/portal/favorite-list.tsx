"use client";

import { Loader2, Star, WifiOff } from "lucide-react";
import type { CatalogItem } from "@/lib/supabase/types";
import { PickList, type RowFavorite } from "@/components/portal/food-search";
import type { useFavorites } from "@/components/portal/favorite-star";

/** Favorites tab of the add-food sheet. Needs a connection, like Search. */
export default function FavoriteList({
  favorites,
  onPick,
  rowFavorite,
}: {
  favorites: ReturnType<typeof useFavorites>;
  onPick: (item: CatalogItem) => void;
  rowFavorite: (item: CatalogItem) => RowFavorite;
}) {
  if (favorites.status === "offline") {
    return (
      <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
        <WifiOff className="w-4 h-4 shrink-0" />
        Favorites need a connection. You can still use Quick add offline.
      </p>
    );
  }
  if (favorites.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading favorites…
      </p>
    );
  }
  if (favorites.status === "error") {
    return (
      <p className="text-sm text-red-700">
        Could not load favorites.{" "}
        <button type="button" onClick={favorites.reload} className="underline">
          Try again
        </button>
      </p>
    );
  }
  if (favorites.items.length === 0) {
    return (
      <p className="text-sm text-gray-600">
        No favorites yet. Tap the <Star className="inline w-4 h-4 -mt-0.5" aria-hidden /> on a food to keep it
        here.
      </p>
    );
  }
  return (
    <PickList
      label="Favorites"
      rows={favorites.items.map((item) => ({ item }))}
      onPick={(item) => onPick(item)}
      favorite={rowFavorite}
    />
  );
}
