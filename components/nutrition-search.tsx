"use client";

import { useEffect, useRef, useState } from "react";
import { NutritionSearchResult } from "@/lib/supabase/types";
import { Search, Loader2, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";

interface NutritionSearchProps {
  onSelect: (result: NutritionSearchResult) => void;
  onClose: () => void;
  /** Prefill the search box and run the search immediately. */
  initialQuery?: string;
}

function confidenceBadge(score: number) {
  if (score >= 0.95) return { bg: "bg-green-100", text: "text-green-700" };
  if (score >= 0.85) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-orange-100", text: "text-orange-700" };
}

export default function NutritionSearch({
  onSelect,
  onClose,
  initialQuery,
}: NutritionSearchProps) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [results, setResults] = useState<NutritionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sources, setSources] = useState<{ usda?: string; off?: string }>({});
  const autoRan = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function runSearch(q: string) {
    if (q.trim().length < 2) return;
    // A newer search supersedes the older one: abort it so its response can never overwrite ours.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setSearched(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/nutrition/search?q=${encodeURIComponent(q.trim())}`,
        { signal: controller.signal }
      );
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      if (controller.signal.aborted) return;
      setResults(data.results ?? []);
      setSources(data.sources ?? {});
    } catch {
      if (controller.signal.aborted) return;
      setResults([]);
      setSources({});
      setFailed(true);
    } finally {
      if (controllerRef.current === controller) setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery && !autoRan.current) {
      autoRan.current = true;
      void runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  return (
    <Modal open onClose={onClose} title="Search nutrition data" size="lg">
      <form onSubmit={handleSearch} className="border-b pb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ingredient (e.g. 'chicken breast', 'lapte zuzu')..."
              aria-label="Search ingredient"
              className="w-full pl-10 pr-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          USDA (raw ingredients) + Open Food Facts (Romanian products)
        </p>
      </form>

      <div className="pt-3 min-h-[8rem]">
        <div aria-live="polite">
          {!loading && searched && !failed && sources.off === "error" && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Open Food Facts didn&apos;t respond. Results may be incomplete.
              </span>
              <button
                type="button"
                onClick={() => void runSearch(query)}
                className="px-2.5 py-1 text-xs font-medium border border-amber-300 rounded-md bg-white hover:bg-amber-100"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && searched && !failed && sources.usda === "error" && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                USDA didn&apos;t respond. Results may be incomplete.
              </span>
              {sources.off !== "error" && (
                <button
                  type="button"
                  onClick={() => void runSearch(query)}
                  className="px-2.5 py-1 text-xs font-medium border border-amber-300 rounded-md bg-white hover:bg-amber-100"
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {!loading && searched && !failed && sources.usda === "disabled" && (
            <p className="mb-3 text-xs text-gray-500">USDA disabled (no API key)</p>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="ml-2 text-sm text-gray-500">Searching...</span>
          </div>
        )}

        {!loading && failed && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <p className="text-sm text-red-700">
              The search failed. Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => void runSearch(query)}
              className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !failed && searched && results.length === 0 && (
          <p className="text-center text-gray-500 py-8 text-sm">
            No results found. Try a different search term.
          </p>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-2">
            {results.map((result, idx) => {
              const badge = confidenceBadge(result.confidenceScore);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelect(result)}
                  className="w-full text-left p-3 rounded-lg border hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {result.name}
                      </p>
                      {result.brand && (
                        <p className="text-xs text-gray-500">{result.brand}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1 shrink-0">
                      {result.dataType && (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-600">
                          {result.dataType}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          result.source === "openfoodfacts"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {result.source === "openfoodfacts" ? "OFF" : "USDA"}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}
                        title="Confidence score"
                      >
                        {Math.round(result.confidenceScore * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    {result.nutrition.calories !== null && (
                      <span>{Math.round(result.nutrition.calories)} kcal</span>
                    )}
                    {result.nutrition.protein !== null && (
                      <span>P: {result.nutrition.protein.toFixed(1)}g</span>
                    )}
                    {result.nutrition.carbs !== null && (
                      <span>C: {result.nutrition.carbs.toFixed(1)}g</span>
                    )}
                    {result.nutrition.fat !== null && (
                      <span>F: {result.nutrition.fat.toFixed(1)}g</span>
                    )}
                    {result.category && result.category !== "primary" && (
                      <span className="text-gray-400 italic">
                        {result.category === "composite" ? "composite" : "processed"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
