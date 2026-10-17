"use client";

import { useEffect } from "react";

export default function PortalTodayError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="bg-white rounded-2xl border p-6 text-center space-y-3"
      role="alert"
    >
      <p className="text-gray-900 font-medium">
        We couldn&apos;t load your meals.
      </p>
      <p className="text-sm text-gray-600">
        Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="inline-flex items-center px-4 py-2 min-h-[44px] bg-emerald-600 text-white rounded-lg text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
