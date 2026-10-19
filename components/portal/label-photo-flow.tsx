"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, ImagePlus, Loader2, RotateCcw, WifiOff } from "lucide-react";
import type { CatalogItem } from "@/lib/supabase/types";
import type { LabelDraft } from "@/lib/portal/label-map";
import { createClient } from "@/lib/supabase/client";
import { compressImage, validatePhotoFile } from "@/lib/portal/storage";
import { getNutrient } from "@/lib/nutrition/nutrients";

const NUM = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2, useGrouping: false });
const formatNumber = (n: number) => NUM.format(n);

const BUCKET = "food-label-photos";
const PARSE_TIMEOUT_MS = 70000;

type Phase =
  | { kind: "capture"; error?: string }
  | { kind: "working"; step: "upload" | "read" }
  | { kind: "review"; draft: LabelDraft; issuedAt: number; signature: string; error?: string }
  | { kind: "confirming"; draft: LabelDraft; issuedAt: number; signature: string };

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

interface Picked {
  file: File;
  url: string;
}

const MACRO_ROWS: { key: keyof LabelDraft; label: string; unit: string }[] = [
  { key: "calories", label: "Energy", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbohydrate", unit: "g" },
  { key: "fat", label: "Fat", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "sugar", label: "Sugars", unit: "g" },
  { key: "sat_fat", label: "Saturated fat", unit: "g" },
  { key: "salt", label: "Salt", unit: "g" },
];

/**
 * Add a product from a nutrition-label photo (FD-5). The customer photographs the label (required) and
 * the front (optional); the server reads it with Claude and returns a signed, read-only draft. Nothing
 * shown here can be edited, and the confirm call only accepts the signed draft. On confirm the new
 * pending food is handed to `onPick` so the normal amount picker logs it.
 */
export default function LabelPhotoFlow({
  barcode,
  onPick,
  onCancel,
}: {
  barcode: string | null;
  onPick: (item: CatalogItem) => void;
  onCancel: () => void;
}) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [phase, setPhase] = useState<Phase>({ kind: "capture" });
  const [label, setLabel] = useState<Picked | null>(null);
  const [front, setFront] = useState<Picked | null>(null);
  // One food id for the whole flow: retakes overwrite the same storage keys.
  const foodId = useRef("");
  const paths = useRef<{ label: string; front: string | null } | null>(null);
  const alive = useRef(true);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    foodId.current = crypto.randomUUID();
    alive.current = true;
    return () => {
      alive.current = false;
      ctrl.current?.abort();
    };
  }, []);

  // Release object URLs when a photo is replaced or the flow closes.
  useEffect(() => () => void (label && URL.revokeObjectURL(label.url)), [label]);
  useEffect(() => () => void (front && URL.revokeObjectURL(front.url)), [front]);

  function pick(kind: "label" | "front", file: File | undefined) {
    if (!file) return;
    const problem = validatePhotoFile(file);
    if (problem) {
      setPhase({ kind: "capture", error: problem });
      return;
    }
    const picked = { file, url: URL.createObjectURL(file) };
    if (kind === "label") setLabel(picked);
    else setFront(picked);
    setPhase({ kind: "capture" });
  }

  async function readLabel() {
    if (!label) return;
    setPhase({ kind: "working", step: "upload" });
    const c = new AbortController();
    ctrl.current = c;
    const timer = setTimeout(() => c.abort(), PARSE_TIMEOUT_MS);
    const fail = (error: string) => {
      if (alive.current) setPhase({ kind: "capture", error });
    };
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = userData.user
        ? await supabase.from("profiles").select("client_id").eq("id", userData.user.id).maybeSingle()
        : { data: null };
      const clientId = profile?.client_id as string | undefined;
      if (!clientId) return fail("Please sign in again to add a product.");

      const base = `${clientId}/${foodId.current}`;
      const next = { label: `${base}/label.jpg`, front: front ? `${base}/front.jpg` : null };
      try {
        const up = async (path: string, file: File) => {
          const blob = await compressImage(file);
          const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: "image/jpeg" });
          if (error) throw error;
        };
        await Promise.all([up(next.label, label.file), next.front && front ? up(next.front, front.file) : Promise.resolve()]);
      } catch (e) {
        if (e instanceof Error && /can't be read/.test(e.message)) return fail(e.message);
        return fail("Couldn't upload the photos. Check your connection and try again.");
      }
      if (!alive.current) return;
      paths.current = next;

      setPhase({ kind: "working", step: "read" });
      const r = await fetch("/api/portal/foods/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ food_id: foodId.current, barcode, label_photo_path: next.label, front_photo_path: next.front }),
        signal: c.signal,
      });
      const j = (await r.json().catch(() => ({}))) as {
        draft?: LabelDraft;
        issued_at?: number;
        signature?: string;
        message?: string;
      };
      if (!alive.current) return;
      if (r.ok && j.draft && j.signature && j.issued_at) {
        setPhase({ kind: "review", draft: j.draft, issuedAt: j.issued_at, signature: j.signature });
      } else {
        fail(j.message ?? "We couldn't read this label. Try again.");
      }
    } catch {
      fail(
        c.signal.aborted
          ? "Reading the label is taking too long. Try again."
          : "Couldn't reach the server. Check your connection and try again."
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function confirm() {
    if (phase.kind !== "review" || !paths.current) return;
    const { draft, issuedAt, signature } = phase;
    setPhase({ kind: "confirming", draft, issuedAt, signature });
    const back = (error: string) => {
      if (alive.current) setPhase({ kind: "review", draft, issuedAt, signature, error });
    };
    try {
      const r = await fetch("/api/portal/foods/label/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          food_id: foodId.current,
          barcode,
          label_photo_path: paths.current.label,
          front_photo_path: paths.current.front,
          draft,
          issued_at: issuedAt,
          signature,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { item?: CatalogItem; message?: string };
      if (!alive.current) return;
      if (r.ok && j.item) onPick(j.item);
      else if (r.status === 410 || r.status === 400) {
        // Expired or rejected signature: the draft is unusable, start over with the photos still selected.
        setPhase({ kind: "capture", error: j.message ?? "Please read the label again." });
      } else back(j.message ?? "Couldn't save this product. Try again.");
    } catch {
      back("Couldn't reach the server. Check your connection and try again.");
    }
  }

  const cameraInput = (kind: "label" | "front") => (
    <input
      type="file"
      accept="image/*"
      capture="environment"
      className="sr-only"
      data-testid={`label-photo-${kind}-input`}
      id={`label-photo-${kind}`}
      onChange={(e) => {
        pick(kind, e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  if (phase.kind === "working") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-gray-700 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        {phase.step === "upload" ? "Uploading photos…" : "Reading the label… this can take a few seconds."}
      </p>
    );
  }

  if (phase.kind === "review" || phase.kind === "confirming") {
    const d = phase.draft;
    const busy = phase.kind === "confirming";
    const micros = Object.entries(d.micronutrients);
    return (
      <div className="space-y-3" data-testid="label-review">
        <div className="flex gap-3">
          {label && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={label.url} alt="Your label photo" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
          )}
          <div className="min-w-0">
            <p className="font-medium text-gray-900 break-words">{d.name}</p>
            {d.brand && <p className="text-sm text-gray-500">{d.brand}</p>}
            <p className="text-xs text-gray-500 mt-1">
              Per 100 {d.unit}
              {d.serving_size ? ` · serving ${formatNumber(d.serving_size)} ${d.unit}` : ""}
              {d.package_size ? ` · pack ${formatNumber(d.package_size)} ${d.unit}` : ""}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm rounded-lg bg-gray-50 p-3">
          {MACRO_ROWS.map((row) => {
            const v = d[row.key] as number | null;
            return (
              <div key={row.key} className="flex justify-between gap-2">
                <dt className="text-gray-600">{row.label}</dt>
                <dd className="text-gray-900 tabular-nums">{v === null ? "—" : `${formatNumber(v)} ${row.unit}`}</dd>
              </div>
            );
          })}
          {micros.map(([k, v]) => {
            const n = getNutrient(k);
            return (
              <div key={k} className="flex justify-between gap-2">
                <dt className="text-gray-600">{n.label}</dt>
                <dd className="text-gray-900 tabular-nums">{`${formatNumber(v)} ${n.unit}`}</dd>
              </div>
            );
          })}
        </dl>
        <p className="text-xs text-gray-500">
          Read from your photo. If anything looks wrong, retake it. This product is visible only to you until it is checked.
        </p>
        {phase.kind === "review" && phase.error && (
          <p role="alert" className="text-sm text-red-700">
            {phase.error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhase({ kind: "capture" })}
            disabled={busy}
            className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Retake
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || !online}
            data-testid="label-confirm"
            className="min-h-[44px] flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!online && (
        <p className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          Reading a label needs a connection. You can still use Quick add offline.
        </p>
      )}
      <p className="text-sm text-gray-600">
        {barcode ? `No nutrition found for ${barcode}. ` : ""}
        Photograph the nutrition table on the pack, flat and in good light. The front of the pack is optional.
      </p>

      <div className="grid grid-cols-2 gap-2">
        {(["label", "front"] as const).map((kind) => {
          const picked = kind === "label" ? label : front;
          return (
            <div key={kind}>
              {cameraInput(kind)}
              <label
                htmlFor={`label-photo-${kind}`}
                className="flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-gray-300 bg-white text-center text-sm text-gray-700 has-[:focus-visible]:ring-2"
              >
                {picked ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={picked.url} alt={`${kind} photo`} className="h-28 w-full object-cover" />
                ) : kind === "label" ? (
                  <Camera className="w-6 h-6 text-gray-500" />
                ) : (
                  <ImagePlus className="w-6 h-6 text-gray-500" />
                )}
                <span className="px-2 pb-1 font-medium">
                  {kind === "label" ? (picked ? "Retake label" : "Label photo") : picked ? "Retake front" : "Front (optional)"}
                </span>
              </label>
            </div>
          );
        })}
      </div>

      {phase.error && (
        <p role="alert" className="text-sm text-red-700" data-testid="label-error">
          {phase.error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] flex-1 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void readLabel()}
          disabled={!label || !online}
          data-testid="label-read"
          className="min-h-[44px] flex-1 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Read label
        </button>
      </div>
    </div>
  );
}
