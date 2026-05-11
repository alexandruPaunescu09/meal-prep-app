"use client";

import { useState } from "react";
import { NutritionSearchResult } from "@/lib/supabase/types";
import { Search, X, Loader2 } from "lucide-react";

interface NutritionSearchProps {
  onSelect: (result: NutritionSearchResult) => void;
  onClose: () => void;
}

function confidenceBadge(score: number) {
  if (score >= 0.95) return { bg: "bg-green-100", text: "text-green-700" };
  if (score >= 0.85) return { bg: "bg-yellow-100", text: "text-yellow-700" };
  return { bg: "bg-orange-100", text: "text-orange-700" };
}

export default function NutritionSearch({
  onSelect,
  onClose,
}: NutritionSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NutritionSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) return;

    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(
        `/api/nutrition/search?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Search Nutrition Data
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="px-6 py-4 border-b">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ingredient (e.g. 'chicken breast', 'lapte zuzu')..."
                className="w-full pl-10 pr-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || query.trim().length < 2}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Search"
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            USDA (raw ingredients) + Open Food Facts (Romanian products)
          </p>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <span className="ml-2 text-sm text-gray-500">Searching...</span>
            </div>
          )}

          {!loading && searched && results.length === 0 && (
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
                      <div className="flex gap-1 shrink-0">
                        {result.dataType && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                            {result.dataType}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            result.source === "openfoodfacts"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {result.source === "openfoodfacts" ? "OFF" : "USDA"}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.bg} ${badge.text}`}
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
      </div>
    </div>
  );
}
