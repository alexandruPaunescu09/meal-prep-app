"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

// Shows while the browser reports no connection. Starts hidden so server and
// first client render match; the real state is read after mount.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>You&apos;re offline — showing saved data.</span>
    </div>
  );
}
