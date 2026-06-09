"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { getSignedReviewPhotoUrl } from "@/lib/portal/storage";

export default function PhotoUpload({
  existingPath,
  pendingFile,
  onPick,
  onRemove,
}: {
  existingPath: string | null;
  pendingFile: File | null;
  onPick: (file: File | null) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile);
      setPreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    if (existingPath) {
      getSignedReviewPhotoUrl(existingPath).then((url) => {
        if (!cancelled) setPreviewUrl(url);
      });
    } else {
      setPreviewUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [pendingFile, existingPath]);

  return (
    <div>
      {previewUrl ? (
        <div className="relative inline-block">
          <img
            src={previewUrl}
            alt="Meal photo"
            className="w-32 h-32 object-cover rounded-xl border"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute -top-2 -right-2 bg-white border rounded-full p-1 shadow-sm"
          >
            <X className="w-4 h-4 text-gray-700" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-3 bg-white border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-600 hover:border-emerald-400 hover:text-emerald-700"
        >
          <Camera className="w-5 h-5" />
          Add photo
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
