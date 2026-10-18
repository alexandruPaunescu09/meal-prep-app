"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Loader2, ScanBarcode, WifiOff } from "lucide-react";
import type { CatalogItem } from "@/lib/supabase/types";
import BarcodeScanner from "@/components/barcode-scanner";

const LOOKUP_TIMEOUT_MS = 12000;

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; code: string }
  | { kind: "failed"; code: string; reason: string; message: string };

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * Scan tab of the add-food sheet: opens the camera scanner (manual entry fallback), looks the code up
 * and hands the catalog item to `onPick` so the normal amount picker logs it. When nothing usable is
 * found it offers the label-photo path (built in FD-5, disabled until then).
 */
export default function BarcodeLookup({ onPick }: { onPick: (item: CatalogItem) => void }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const latest = useRef(0);
  const ctrl = useRef<AbortController | null>(null);

  // Leaving the Scan tab (or closing the sheet) unmounts this: cancel the request and ignore any answer.
  useEffect(
    () => () => {
      latest.current++;
      ctrl.current?.abort();
    },
    []
  );

  async function lookup(code: string) {
    const id = ++latest.current;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const timer = setTimeout(() => c.abort(), LOOKUP_TIMEOUT_MS);
    setScanning(false);
    setPhase({ kind: "loading", code });
    try {
      const r = await fetch(`/api/portal/foods/barcode?code=${encodeURIComponent(code)}`, { signal: c.signal });
      const j = (await r.json().catch(() => ({}))) as {
        item?: CatalogItem;
        error?: string;
        message?: string;
      };
      if (id !== latest.current) return;
      if (r.ok && j.item) {
        setPhase({ kind: "idle" });
        onPick(j.item);
        return;
      }
      setPhase({
        kind: "failed",
        code,
        reason: j.error ?? "lookup_failed",
        message: j.message ?? "Couldn't look up this barcode. Try again.",
      });
    } catch {
      if (id !== latest.current) return;
      setPhase({
        kind: "failed",
        code,
        reason: "lookup_failed",
        message: c.signal.aborted
          ? "This is taking too long. Try again."
          : "Couldn't reach the server. Check your connection and try again.",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  const noProduct = phase.kind === "failed" && (phase.reason === "not_found" || phase.reason === "incomplete_data");

  return (
    <div className="space-y-3">
      {!online && (
        <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          Scanning needs a connection. You can still use Quick add offline.
        </p>
      )}

      <button
        type="button"
        onClick={() => setScanning(true)}
        disabled={!online || phase.kind === "loading"}
        className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        <ScanBarcode className="w-5 h-5" />
        {phase.kind === "failed" ? "Scan again" : "Scan a barcode"}
      </button>

      {phase.kind === "idle" && (
        <p className="text-sm text-gray-500">
          Scan the barcode on a packaged product, or type its number, to find its nutrition.
        </p>
      )}

      {phase.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          Looking up {phase.code}…
        </p>
      )}

      {phase.kind === "failed" && (
        <div role="alert" className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm text-gray-800" data-testid="barcode-error">
            {phase.message}
            {phase.reason !== "rate_limited" && phase.reason !== "lookup_failed" && (
              <span className="text-gray-500"> ({phase.code})</span>
            )}
          </p>
          {phase.reason === "lookup_failed" && (
            <button type="button" onClick={() => void lookup(phase.code)} className="text-sm font-medium underline">
              Try again
            </button>
          )}
          {noProduct && (
            <div>
              <button
                type="button"
                disabled
                aria-describedby="label-photo-hint"
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 disabled:opacity-60"
              >
                <Camera className="w-4 h-4" />
                Photograph the label
              </button>
              <p id="label-photo-hint" className="mt-1 text-xs text-gray-500">
                Coming soon. For now, use Quick add to log this product.
              </p>
            </div>
          )}
        </div>
      )}

      {scanning && <BarcodeScanner onDetected={(code) => void lookup(code)} onClose={() => setScanning(false)} />}
    </div>
  );
}
