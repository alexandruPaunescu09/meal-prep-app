"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ReviewSentiment, ReviewTag } from "@/lib/supabase/types";
import { invalidateReviewTags } from "@/lib/actions/revalidate";
import { Plus, Eye, EyeOff, Pencil } from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { useToast } from "@/components/ui/toast";
import { SentimentBadge } from "../tag-chip";

export default function TagsClient({ initialTags }: { initialTags: ReviewTag[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [editTag, setEditTag] = useState<Partial<ReviewTag> | null>(null);

  async function toggleActive(tag: ReviewTag) {
    const { error } = await supabase
      .from("review_tags")
      .update({ active: !tag.active })
      .eq("id", tag.id);
    if (error) {
      toast.error(`Could not update "${tag.label}"`, {
        action: { label: "Retry", onClick: () => void toggleActive(tag) },
      });
      return;
    }
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
          type="button"
          onClick={() => setEditTag({ label: "", sentiment: "positive", sort_order: 0, active: true })}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New tag
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th scope="col" className="text-left px-4 py-2 font-medium">Label</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Sentiment</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Sort</th>
              <th scope="col" className="text-left px-4 py-2 font-medium">Active</th>
              <th scope="col" className="px-4 py-2 w-1">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {initialTags.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2 font-medium text-gray-900">{t.label}</td>
                <td className="px-4 py-2">
                  <SentimentBadge sentiment={t.sentiment} />
                </td>
                <td className="px-4 py-2 text-gray-700">{t.sort_order}</td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => toggleActive(t)}
                    aria-label={`${t.active ? "Disable" : "Enable"} tag ${t.label}`}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                      t.active ? "text-emerald-700 hover:bg-emerald-50" : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {t.active ? <Eye className="w-3 h-3" aria-hidden="true" /> : <EyeOff className="w-3 h-3" aria-hidden="true" />}
                    {t.active ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-2">
                  <IconButton label={`Edit tag ${t.label}`} onClick={() => setEditTag(t)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </IconButton>
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
  const toast = useToast();
  const [form, setForm] = useState({
    label: tag.label ?? "",
    sentiment: (tag.sentiment ?? "positive") as ReviewSentiment,
    sort_order: tag.sort_order ?? 0,
    active: tag.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    form.label !== (tag.label ?? "") ||
    form.sentiment !== (tag.sentiment ?? "positive") ||
    form.sort_order !== (tag.sort_order ?? 0) ||
    form.active !== (tag.active ?? true);

  async function save(e: FormEvent) {
    e.preventDefault();
    const label = form.label.trim();
    if (!label) {
      setError("Label is required.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      label,
      sentiment: form.sentiment,
      sort_order: form.sort_order,
      active: form.active,
    };
    const { error: writeError } = tag.id
      ? await supabase.from("review_tags").update(payload).eq("id", tag.id)
      : await supabase.from("review_tags").insert(payload);
    if (writeError) {
      setError(writeError.message);
      setSaving(false);
      toast.error("Could not save tag");
      return;
    }
    await invalidateReviewTags();
    router.refresh();
    toast.success(tag.id ? "Tag updated" : "Tag created");
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      size="sm"
      title={tag.id ? "Edit tag" : "New tag"}
      footer={
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="review-tag-form"
            disabled={saving}
            className="flex-1 py-2 px-4 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : tag.id ? "Update" : "Create"}
          </button>
        </div>
      }
    >
      <form id="review-tag-form" onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="review-tag-label" className="block text-sm font-medium text-gray-700 mb-1">
            Label <span aria-hidden="true">*</span>
          </label>
          <input
            id="review-tag-label"
            type="text"
            required
            aria-invalid={!!error || undefined}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
          />
        </div>
        <div>
          <label htmlFor="review-tag-sentiment" className="block text-sm font-medium text-gray-700 mb-1">
            Sentiment
          </label>
          <select
            id="review-tag-sentiment"
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
            <label htmlFor="review-tag-sort" className="block text-sm font-medium text-gray-700 mb-1">
              Sort order
            </label>
            <input
              id="review-tag-sort"
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value || "0", 10) })}
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
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
