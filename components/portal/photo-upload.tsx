"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { getSignedReviewPhotoUrl, validatePhotoFile } from "@/lib/portal/storage";

export default function PhotoUpload({
  existingPath,
  pendingFile,
  onPick,
  onRemove,
  onError,
  disabled,
}: {
  existingPath: string | null;
  pendingFile: File | null;
  onPick: (file: File | null) => void;
  onRemove: () => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const pendingUrl = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
    [pendingFile]
  );

  useEffect(() => {
    return () => {
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    };
  }, [pendingUrl]);

  useEffect(() => {
    if (!existingPath) return;
    let cancelled = false;
    getSignedReviewPhotoUrl(existingPath).then((url) => {
      if (!cancelled) setExistingUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [existingPath]);

  const previewUrl = pendingUrl ?? (existingPath ? existingUrl : null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow re-picking the same file
    if (!f) return;
    const problem = validatePhotoFile(f);
    if (problem) {
      onError?.(problem);
      return;
    }
    onPick(f);
  }

  return (
    <div>
      {previewUrl ? (
        <div className="flex items-end gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Meal photo"
            className="w-32 h-32 object-cover rounded-xl border"
          />
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            Remove photo
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex items-center gap-2 px-4 py-3 min-h-[44px] bg-white border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
        >
          <Camera className="w-5 h-5" />
          Add photo
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
