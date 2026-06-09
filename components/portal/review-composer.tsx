"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { MealReview, ReviewTag } from "@/lib/supabase/types";
import StarRating from "./star-rating";
import TagChips from "./tag-chips";
import PhotoUpload from "./photo-upload";
import { uploadReviewPhoto } from "@/lib/portal/storage";
import { queueWrite } from "@/lib/portal/write-queue";

export default function ReviewComposer({
  entryId,
  existingReview,
  onSaved,
}: {
  entryId: string;
  existingReview: MealReview | null;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 0);
  const [comment, setComment] = useState<string>(existingReview?.comment ?? "");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("review_tags")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (!cancelled) setTags((data as ReviewTag[]) ?? []);

      if (existingReview?.id) {
        const { data: links } = await supabase
          .from("meal_review_tags")
          .select("tag_id")
          .eq("review_id", existingReview.id);
        if (!cancelled && links) {
          setSelectedTags(new Set(links.map((l: { tag_id: string }) => l.tag_id)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, existingReview]);

  function toggleTag(id: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (rating < 1) {
      setError("Pick a star rating first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        meal_plan_entry_id: entryId,
        rating,
        comment: comment.trim() || null,
        tag_ids: Array.from(selectedTags),
      };

      const r = await fetch("/api/portal/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        // queue if offline-ish
        if (!navigator.onLine) {
          queueWrite({ kind: "review", payload });
          onSaved();
          return;
        }
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Save failed");
        setSaving(false);
        return;
      }

      const result = (await r.json()) as { id: string; client_id: string };

      if (pendingFile) {
        try {
          const path = await uploadReviewPhoto({
            clientId: result.client_id,
            reviewId: result.id,
            file: pendingFile,
          });
          await fetch("/api/portal/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, photo_path: path }),
          });
        } catch (e) {
          console.error("photo upload failed", e);
        }
      } else if (photoCleared && existingReview?.photo_path) {
        await fetch("/api/portal/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, photo_path: null }),
        });
      }

      router.refresh();
      onSaved();
    } catch (e: any) {
      if (!navigator.onLine) {
        queueWrite({
          kind: "review",
          payload: {
            meal_plan_entry_id: entryId,
            rating,
            comment: comment.trim() || null,
            tag_ids: Array.from(selectedTags),
          },
        });
        onSaved();
      } else {
        setError(e?.message ?? "Save failed");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-900 mb-2">Your rating</p>
        <StarRating value={rating} onChange={setRating} />
      </div>

      {tags.length > 0 && (
        <div>
          <TagChips tags={tags} selected={selectedTags} onToggle={toggleTag} />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-1.5">
          Comment <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="What stood out?"
          className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none resize-none"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-gray-900 mb-2">Photo (optional)</p>
        <PhotoUpload
          existingPath={photoCleared ? null : existingReview?.photo_path ?? null}
          pendingFile={pendingFile}
          onPick={(f) => {
            setPendingFile(f);
            if (f) setPhotoCleared(false);
          }}
          onRemove={() => {
            setPendingFile(null);
            setPhotoCleared(true);
          }}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
      )}

      {existingReview && (
        <p className="text-xs text-gray-500">
          Submitted {new Date(existingReview.created_at).toLocaleDateString()}
          {existingReview.updated_at !== existingReview.created_at && " · edited"}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 min-h-[48px]"
      >
        {saving ? "Saving..." : existingReview ? "Update review" : "Submit review"}
      </button>
    </div>
  );
}
