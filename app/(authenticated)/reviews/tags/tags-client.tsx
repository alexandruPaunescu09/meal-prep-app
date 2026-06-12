"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ReviewSentiment, ReviewTag } from "@/lib/supabase/types";
import { invalidateReviewTags } from "@/lib/actions/revalidate";
import { Plus, Eye, EyeOff, Pencil, X } from "lucide-react";
import Link from "next/link";

export default function TagsClient({ initialTags }: { initialTags: ReviewTag[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [editTag, setEditTag] = useState<Partial<ReviewTag> | null>(null);

  async function toggleActive(tag: ReviewTag) {
    await supabase
      .from("review_tags")
      .update({ active: !tag.active })
      .eq("id", tag.id);
    await invalidateReviewTags();
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review tags</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Quick-tag chips shown to customers when they leave a review.{" "}
            <Link href="/reviews" className="text-emerald-700 hover:underline">Back to inbox</Link>
          </p>
        </div>
        <button
          onClick={() => setEditTag({ label: "", sentiment: "positive", sort_order: 0, active: true })}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          New tag
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Label</th>
              <th className="text-left px-4 py-2 font-medium">Sentiment</th>
              <th className="text-left px-4 py-2 font-medium">Sort</th>
              <th className="text-left px-4 py-2 font-medium">Active</th>
              <th className="px-4 py-2 w-1" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {initialTags.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2 font-medium text-gray-900">{t.label}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    t.sentiment === "positive"
                      ? "bg-emerald-50 text-emerald-700"
                      : t.sentiment === "negative"
                      ? "bg-red-50 text-red-700"
                      : "bg-gray-100 text-gray-700"
                  }`}>
                    {t.sentiment}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-700">{t.sort_order}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleActive(t)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                      t.active ? "text-emerald-700 hover:bg-emerald-50" : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {t.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {t.active ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => setEditTag(t)}
                    className="p-1.5 rounded hover:bg-gray-100"
                  >
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTag && <TagForm tag={editTag} onClose={() => setEditTag(null)} />}
    </div>
  );
}

function TagForm({
  tag,
  onClose,
}: {
  tag: Partial<ReviewTag>;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    label: tag.label ?? "",
    sentiment: (tag.sentiment ?? "positive") as ReviewSentiment,
    sort_order: tag.sort_order ?? 0,
    active: tag.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      label: form.label.trim(),
      sentiment: form.sentiment,
      sort_order: form.sort_order,
      active: form.active,
    };
    const { error } = tag.id
      ? await supabase.from("review_tags").update(payload).eq("id", tag.id)
      : await supabase.from("review_tags").insert(payload);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    await invalidateReviewTags();
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {tag.id ? "Edit tag" : "New tag"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label *</label>
            <input
              type="text"
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sentiment</label>
            <select
              value={form.sentiment}
              onChange={(e) => setForm({ ...form, sentiment: e.target.value as ReviewSentiment })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm"
            >
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || "0") })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm"
              />
            </div>
            <label className="flex items-end pb-2 gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />
              Active
            </label>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
            >
              {saving ? "Saving..." : tag.id ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
