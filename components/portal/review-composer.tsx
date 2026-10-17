"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { MealReview, ReviewTag } from "@/lib/supabase/types";
import StarRating from "./star-rating";
import TagChips from "./tag-chips";
import PhotoUpload from "./photo-upload";
import { uploadReviewPhoto } from "@/lib/portal/storage";
import { queueWrite } from "@/lib/portal/write-queue";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/format";

// Active tags almost never change: fetch once per page load. The cache is
// dropped on failure so the next open retries.
let activeTagsPromise: Promise<ReviewTag[]> | null = null;

function loadActiveTags(supabase: ReturnType<typeof createClient>): Promise<ReviewTag[]> {
  if (!activeTagsPromise) {
    activeTagsPromise = (async () => {
      const { data, error } = await supabase
        .from("review_tags")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as ReviewTag[]) ?? [];
    })().catch((e) => {
      activeTagsPromise = null;
      throw e;
    });
  }
  return activeTagsPromise;
}

type PhotoRetry ={ reviewId: string; clientId: string; message: string };

export default function ReviewComposer({
  entryId,
  existingReview,
  onSaved,
  onDirtyChange,
}: {
  entryId: string;
  existingReview: MealReview | null;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [rating, setRating] = useState<number>(existingReview?.rating ?? 0);
  const [comment, setComment] = useState<string>(existingReview?.comment ?? "");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [photoRetry, setPhotoRetry] = useState<PhotoRetry | null>(null);
  const [touched, setTouched] = useState(false);

  const existingReviewId = existingReview?.id ?? null;

  useEffect(() => {
    onDirtyChange?.(touched && !photoRetry);
  }, [touched, photoRetry, onDirtyChange]);

  // Depend on the review id (not the object) so router.refresh() does not refetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const activeTags = await loadActiveTags(supabase);
        if (!cancelled) setTags(activeTags);

        if (existingReviewId) {
          const { data: links } = await supabase
            .from("meal_review_tags")
            .select("tag_id")
            .eq("review_id", existingReviewId);
          if (!cancelled && links) {
            setSelectedTags(new Set(links.map((l: { tag_id: string }) => l.tag_id)));
          }
        }
      } catch (e) {
        console.warn("Could not load review tags", e);
      } finally {
        if (!cancelled) setTagsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, existingReviewId]);

  function toggleTag(id: string) {
    setTouched(true);
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function finish(message: string) {
    toast.success(message);
    router.refresh();
    onSaved();
  }

  async function attachPhoto(clientId: string, reviewId: string, file: File, payload: object) {
    setUploading(true);
    setError("");
    try {
      const path = await uploadReviewPhoto({ clientId, reviewId, file });
      const r = await fetch("/api/portal/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, photo_path: path }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not attach the photo");
      }
      setPhotoRetry(null);
      finish("Review sent — thanks!");
    } catch (e) {
      console.error("photo upload failed", e);
      const message = e instanceof Error && e.message ? e.message : "Photo upload failed";
      setPhotoRetry({ reviewId, clientId, message });
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  function buildPayload() {
    return {
      meal_plan_entry_id: entryId,
      rating,
      comment: comment.trim() || null,
      tag_ids: Array.from(selectedTags),
      // The API replaces photo_path on every upsert, so always send the intended value.
      photo_path: photoCleared ? null : existingReview?.photo_path ?? null,
    };
  }

  async function handleSubmit() {
    if (rating < 1) {
      setError("Pick a star rating first.");
      return;
    }
    setSaving(true);
    setError("");
    const payload = buildPayload();
    try {
      let r: Response | null = null;
      if (typeof navigator !== "undefined" && navigator.onLine) {
        try {
          r = await fetch("/api/portal/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } catch {
          r = null; // network-level failure
        }
      }

      if (!r) {
        queueWrite({ kind: "review", payload });
        toast.info(
          pendingFile
            ? "Saved offline — will sync when you're back online. Add the photo again after it syncs."
            : "Saved offline — will sync when you're back online"
        );
        onSaved();
        return;
      }

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Save failed. Please try again.");
        return;
      }

      const result = (await r.json()) as { id: string; client_id: string };

      if (pendingFile) {
        setSaving(false);
        await attachPhoto(result.client_id, result.id, pendingFile, payload);
        return;
      }
      finish("Review sent — thanks!");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingReview) return;
    const ok = await confirm({
      title: "Delete your review?",
      message: "This removes your rating, comment and photo for this meal.",
      confirmLabel: "Delete review",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    setError("");
    try {
      const r = await fetch(`/api/portal/reviews?id=${encodeURIComponent(existingReview.id)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not delete the review");
      }
      finish("Review deleted");
    } catch (e) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setError(
        offline
          ? "You're offline. Deleting a review needs a connection."
          : e instanceof Error && e.message
          ? e.message
          : "Could not delete the review"
      );
    } finally {
      setDeleting(false);
    }
  }

  const busy = saving || uploading || deleting;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-900 mb-1">Your rating</p>
        <StarRating
          value={rating}
          onChange={(v) => {
            setRating(v);
            setTouched(true);
            setError("");
          }}
          label="Your rating"
        />
      </div>

      {tagsLoading ? (
        <div className="flex flex-wrap gap-2" aria-busy="true" aria-label="Loading tags">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-20 rounded-full bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        tags.length > 0 && (
          <div>
            <TagChips tags={tags} selected={selectedTags} onToggle={toggleTag} />
          </div>
        )
      )}

      <div>
        <label htmlFor="review-comment" className="block text-sm font-medium text-gray-900 mb-1.5">
          Comment <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setTouched(true);
          }}
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
          disabled={busy}
          onError={(m) => setError(m)}
          onPick={(f) => {
            setPendingFile(f);
            setTouched(true);
            setError("");
            if (f) setPhotoCleared(false);
          }}
          onRemove={() => {
            setPendingFile(null);
            setPhotoCleared(true);
            setTouched(true);
          }}
        />
        {photoCleared && existingReview?.photo_path && (
          <p className="text-xs text-gray-500 mt-1.5">The photo will be removed when you update.</p>
        )}
        {uploading && (
          <p className="flex items-center gap-2 text-sm text-gray-600 mt-2" role="status">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading photo…
          </p>
        )}
      </div>

      {photoRetry && !uploading && (
        <div role="alert" className="text-sm bg-amber-50 text-amber-900 px-3 py-3 rounded-lg space-y-2">
          <p>
            Your review was saved, but the photo didn&apos;t upload: {photoRetry.message}
          </p>
          <div className="flex gap-2">
            {pendingFile && (
              <button
                type="button"
                onClick={() =>
                  attachPhoto(photoRetry.clientId, photoRetry.reviewId, pendingFile, buildPayload())
                }
                className="min-h-[44px] px-4 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700"
              >
                Retry photo
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPhotoRetry(null);
                finish("Review sent — thanks!");
              }}
              className="min-h-[44px] px-4 rounded-lg border border-amber-300 bg-white text-amber-900 font-medium hover:bg-amber-100"
            >
              Done without photo
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
          {error}
        </p>
      )}

      {existingReview && (
        <p className="text-xs text-gray-500">
          Submitted {formatDate(new Date(existingReview.created_at))}
          {existingReview.updated_at !== existingReview.created_at && " · edited"}
        </p>
      )}

      {!photoRetry && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 min-h-[48px]"
        >
          {saving
            ? "Saving..."
            : uploading
            ? "Uploading photo…"
            : existingReview
            ? "Update review"
            : "Submit review"}
        </button>
      )}

      {existingReview && !photoRetry && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {deleting ? "Deleting…" : "Delete review"}
        </button>
      )}
    </div>
  );
}
