"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, RefreshCw, Check } from "lucide-react";
import { queueSize, subscribeQueue } from "@/lib/portal/write-queue";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export default function SyncStatus() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const waiting = useSyncExternalStore(subscribeQueue, queueSize, () => 0);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const onFlushed = () => {
      setSynced(true);
      clearTimeout(t);
      t = setTimeout(() => setSynced(false), 3000);
    };
    window.addEventListener("portal:queue-flushed", onFlushed);
    return () => {
      window.removeEventListener("portal:queue-flushed", onFlushed);
      clearTimeout(t);
    };
  }, []);

  const base = "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full";
  let chip: React.ReactNode = null;
  if (!online) {
    chip = (
      <span className={`${base} bg-amber-50 text-amber-800`}>
        <CloudOff className="w-3.5 h-3.5" />
        {waiting > 0 ? `Offline · ${waiting} waiting` : "Offline"}
      </span>
    );
  } else if (waiting > 0) {
    chip = (
      <span className={`${base} bg-amber-50 text-amber-800`}>
        <RefreshCw className="w-3.5 h-3.5" />
        {waiting} waiting to sync
      </span>
    );
  } else if (synced) {
    chip = (
      <span className={`${base} bg-emerald-50 text-emerald-700`}>
        <Check className="w-3.5 h-3.5" />
        Synced
      </span>
    );
  }

  return (
    <div role="status" aria-live="polite" className="shrink-0">
      {chip}
    </div>
  );
}
