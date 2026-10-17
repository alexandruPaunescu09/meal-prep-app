"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReceiptText,
  Upload,
  Loader2,
  AlertTriangle,
  Plus,
  ChevronDown,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import IngredientForm from "@/components/ingredient-form";
import { invalidateIngredients } from "@/lib/actions/revalidate";
import type { Category, Ingredient, ParsedInvoiceLine } from "@/lib/supabase/types";

const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const CHUNK_H = 1560;
const OVERLAP = 120;
const MAX_W = 1600;
const MAX_PARTS = 10; // server limit on /api/invoices/parse

type ParseResponse = {
  store: string;
  invoice_date: string | null;
  total: number | null;
  model: string;
  raw: unknown;
  lines: ParsedInvoiceLine[];
  duplicateOf: { id: string; created_at: string } | null;
};

type ReviewLine = {
  uid: number;
  base: ParsedInvoiceLine;
  include: boolean;
  ingredient_id: string | null;
  package_quantity: string;
  package_price: string;
};

type Prepared = { name: string; blob: Blob };

function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/(])(\p{L})/gu, (_, p, c: string) => p + c.toUpperCase())
    .trim();
}

function fmt(n: number | null | undefined, d = 2) {
  return n == null || !isFinite(n) ? "-" : n.toFixed(d);
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.85),
  );
}

/** Slice tall images into <=1560px JPEG chunks with overlap; PDFs and small images pass through. */
async function prepareFile(file: File): Promise<Prepared[]> {
  if (file.type === "application/pdf") return [{ name: file.name, blob: file }];
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_W / bmp.width);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const passthrough =
    scale === 1 &&
    h <= CHUNK_H &&
    file.size < 1.5 * 1024 * 1024 &&
    ["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (passthrough) {
    bmp.close();
    return [{ name: file.name, blob: file }];
  }
  const out: Prepared[] = [];
  const step = CHUNK_H - OVERLAP;
  let y = 0;
  let i = 1;
  while (y < h) {
    const ch = Math.min(CHUNK_H, h - y);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, ch);
    ctx.drawImage(bmp, 0, y / scale, bmp.width, ch / scale, 0, 0, w, ch);
    out.push({ name: `${file.name.replace(/\.[^.]+$/, "")}-part${i}.jpg`, blob: await canvasToJpeg(canvas) });
    if (y + ch >= h) break;
    y += step;
    i++;
  }
  bmp.close();
  return out;
}

function IngredientPicker({
  ingredients,
  value,
  onChange,
}: {
  ingredients: Ingredient[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = ingredients.find((i) => i.id === value);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = t
      ? ingredients.filter((i) => `${i.name} ${i.brand ?? ""}`.toLowerCase().includes(t))
      : ingredients;
    return f.slice(0, 50);
  }, [ingredients, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-left bg-white hover:bg-gray-50"
      >
        <span className={`truncate ${selected ? "text-gray-900" : "text-gray-400"}`}>
          {selected ? `${selected.name}${selected.brand ? ` (${selected.brand})` : ""}` : "Select ingredient…"}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-72 max-w-[85vw] bg-white border rounded-lg shadow-lg">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="w-full px-3 py-2 text-sm border-b outline-none rounded-t-lg"
          />
          <ul className="max-h-60 overflow-y-auto">
            {value && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                >
                  Clear selection
                </button>
              </li>
            )}
            {list.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(i.id);
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-emerald-50"
                >
                  {i.name}
                  {i.brand && <span className="text-gray-400"> ({i.brand})</span>}
                  <span className="text-gray-400 text-xs"> · {i.unit}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ImportClient({
  ingredients: initialIngredients,
  categories,
}: {
  ingredients: Ingredient[];
  categories: Category[];
}) {
  const router = useRouter();
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [step, setStep] = useState<"upload" | "review" | "done">("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [prepared, setPrepared] = useState<{ name: string; blob: Blob }[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [store, setStore] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [applying, setApplying] = useState(false);
  const [summary, setSummary] = useState<{ updated: number; unchanged: number; skipped: number } | null>(null);
  const [createFor, setCreateFor] = useState<number | null>(null);
  // In-page confirmation: native confirm() is suppressed in some embedded
  // browsers (it returns false without showing), which silently blocked
  // Discard/Approve.
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
    run: () => void;
  } | null>(null);

  const totalBytes = prepared.reduce((s, p) => s + p.blob.size, 0);
  const tooBig = totalBytes > MAX_TOTAL_BYTES;
  const tooManyParts = prepared.length > MAX_PARTS;
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  useEffect(() => {
    if (step !== "review") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [step]);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter(
      (f) => f.type.startsWith("image/") || f.type === "application/pdf",
    );
    if (incoming.length === 0) return;
    setError("");
    setPreparing(true);
    try {
      const nextFiles = [...files, ...incoming];
      const nextPrepared = [...prepared];
      for (const f of incoming) nextPrepared.push(...(await prepareFile(f)));
      setFiles(nextFiles);
      setPrepared(nextPrepared);
    } catch {
      setError("Could not read one of the images.");
    } finally {
      setPreparing(false);
    }
  }

  function resetAll() {
    setFiles([]);
    setPrepared([]);
    setResult(null);
    setLines([]);
    setError("");
    setSummary(null);
    setStep("upload");
  }

  async function submitParse() {
    setParsing(true);
    setError("");
    try {
      const fd = new FormData();
      for (const p of prepared) fd.append("files", new File([p.blob], p.name, { type: p.blob.type }));
      const res = await fetch("/api/invoices/parse", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const r = data as ParseResponse;
      setResult(r);
      setStore(r.store);
      setInvoiceDate(r.invoice_date ?? "");
      setLines(
        r.lines.map((l, i) => ({
          uid: i,
          base: l,
          include: l.is_food && !!l.ingredient_id && l.match_confidence !== "low",
          ingredient_id: l.ingredient_id,
          package_quantity: l.package_quantity != null ? String(l.package_quantity) : "",
          package_price: l.package_price != null ? String(l.package_price) : "",
        })),
      );
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read the receipt");
    } finally {
      setParsing(false);
    }
  }

  function patch(uid: number, p: Partial<ReviewLine>) {
    setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...p } : l)));
  }

  function derive(l: ReviewLine) {
    const ing = l.ingredient_id ? byId.get(l.ingredient_id) : undefined;
    const qty = parseFloat(l.package_quantity.replace(",", "."));
    const price = Math.round(parseFloat(l.package_price.replace(",", ".")) * 100) / 100;
    const valid = !!ing && qty > 0 && price > 0;
    const newPpu = valid ? price / qty : null;
    const oldPpu = ing && ing.price_per_unit > 0 ? ing.price_per_unit : null;
    const pct = newPpu != null && oldPpu != null ? ((newPpu - oldPpu) / oldPpu) * 100 : null;
    return { ing, qty, price, valid, newPpu, oldPpu, pct };
  }

  const included = lines.filter((l) => l.include);
  const applicable = included.filter((l) => derive(l).valid);
  const invalidIncluded = included.length - applicable.length;
  const storeOk = store.trim().length > 0;
  // Lines (1-based) per ingredient among INCLUDED lines, to flag duplicates.
  const linesByIngredient = new Map<string, number[]>();
  lines.forEach((l, idx) => {
    if (l.include && l.ingredient_id) {
      const arr = linesByIngredient.get(l.ingredient_id) ?? [];
      arr.push(idx + 1);
      linesByIngredient.set(l.ingredient_id, arr);
    }
  });

  function approve() {
    if (!result || applicable.length === 0 || !storeOk) return;
    const date = invoiceDate || "unknown date";
    setPendingConfirm({
      title: `Update ${applicable.length} prices?`,
      body: `From ${store.trim()}, ${date}. Old prices are kept in each ingredient's price history.`,
      confirmLabel: "Update prices",
      run: () => void applyPrices(),
    });
  }

  async function applyPrices() {
    if (!result || applicable.length === 0 || !storeOk) return;
    setApplying(true);
    setError("");
    try {
      const res = await fetch("/api/invoices/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice: {
            store: store.trim(),
            invoice_date: invoiceDate || null,
            total: result.total,
            file_names: files.map((f) => f.name),
            model: result.model,
            parsed: result.raw,
          },
          lines: applicable.map((l) => {
            const d = derive(l);
            return {
              ingredient_id: l.ingredient_id!,
              package_price: d.price,
              quantity_purchased: d.qty,
              raw_name: l.base.raw_name,
            };
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setSummary({
        updated: data.updated ?? 0,
        unchanged: data.unchanged ?? 0,
        skipped: lines.length - applicable.length,
      });
      setStep("done");
      await invalidateIngredients();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply prices");
    } finally {
      setApplying(false);
    }
  }

  function discard() {
    setPendingConfirm({
      title: "Discard this import?",
      body: "Nothing has been saved. The parsed lines will be cleared.",
      confirmLabel: "Discard",
      danger: true,
      run: resetAll,
    });
  }

  const createLine = createFor != null ? lines.find((l) => l.uid === createFor) : undefined;

  /* ---------------- render ---------------- */

  const header = (
    <div className="mb-6">
      <Link
        href="/ingredients"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
      >
        <ArrowLeft className="w-4 h-4" /> Ingredients
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <ReceiptText className="w-6 h-6 text-emerald-600" /> Import receipt
      </h1>
    </div>
  );

  if (step === "done" && summary) {
    return (
      <div>
        {header}
        <div className="bg-white rounded-xl border p-6 max-w-md">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-3">
            <CheckCircle2 className="w-5 h-5" /> Prices updated
          </div>
          <ul className="text-sm text-gray-700 space-y-1 mb-4">
            <li>{summary.updated} updated</li>
            <li>{summary.unchanged} unchanged</li>
            <li>{summary.skipped} skipped</li>
          </ul>
          <div className="flex gap-2">
            <Link
              href="/ingredients"
              className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
            >
              Back to Ingredients
            </Link>
            <button
              onClick={resetAll}
              className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
            >
              Import another
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "upload" || !result) {
    return (
      <div>
        {header}
        <div className="max-w-xl space-y-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-xl cursor-pointer text-center ${
              dragOver ? "border-emerald-500 bg-emerald-50" : "border-gray-300 bg-white hover:bg-gray-50"
            }`}
          >
            <Upload className="w-6 h-6 text-gray-400" />
            <span className="text-sm text-gray-700">
              Choose receipt screenshots or PDF invoices
              <span className="hidden md:inline"> (or drop them here)</span>
            </span>
            <span className="text-xs text-gray-400">Lidl Plus screenshots, Freshful PDFs</span>
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {preparing && (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Preparing images…
            </p>
          )}

          {files.length > 0 && (
            <div className="bg-white border rounded-xl p-4 text-sm">
              <ul className="space-y-1 mb-2">
                {files.map((f, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{f.name}</span>
                    <span className="text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  </li>
                ))}
              </ul>
              <p className={tooBig ? "text-red-600 font-medium" : "text-gray-500"}>
                Upload size: {(totalBytes / 1024 / 1024).toFixed(2)} MB / 4 MB ({prepared.length} part
                {prepared.length === 1 ? "" : "s"})
              </p>
              {tooBig && <p className="text-red-600">Too large. Remove files or use fewer screenshots.</p>}
              {tooManyParts && (
                <p className="text-red-600">
                  Too many parts ({prepared.length}, max {MAX_PARTS}). Remove some files or use fewer screenshots.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={submitParse}
              disabled={parsing || preparing || prepared.length === 0 || tooBig || tooManyParts}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
              {parsing ? "Reading receipt…" : "Read receipt"}
            </button>
            {files.length > 0 && !parsing && (
              <button
                onClick={resetAll}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* review */
  const confCls = (l: ReviewLine) =>
    l.base.match_confidence === "low" && l.ingredient_id ? "bg-amber-50" : "";

  const pctBadge = (pct: number | null) =>
    pct == null ? (
      <span className="text-gray-400">-</span>
    ) : (
      <span className={Math.abs(pct) > 30 ? "text-red-600 font-semibold" : pct > 0 ? "text-amber-600" : "text-emerald-600"}>
        {pct > 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
    );

  const priceCell = (l: ReviewLine) => {
    const d = derive(l);
    const unit = d.ing?.unit ?? l.base.package_unit ?? "";
    return (
      <div className="text-xs text-gray-600">
        {d.ing ? (
          <>
            {fmt(d.oldPpu, 4)} → <span className="font-medium text-gray-900">{fmt(d.newPpu, 4)}</span> lei/{unit}{" "}
            {pctBadge(d.pct)}
          </>
        ) : (
          "-"
        )}
      </div>
    );
  };

  const lineWarnings = (l: ReviewLine) => {
    const ingUnit = l.ingredient_id ? byId.get(l.ingredient_id)?.unit : undefined;
    const recUnit = l.base.package_unit;
    const dupes = l.include && l.ingredient_id ? (linesByIngredient.get(l.ingredient_id) ?? []) : [];
    const myNo = l.uid + 1;
    const others = dupes.filter((n) => n !== myNo);
    return (
      <>
        {ingUnit && recUnit && ingUnit !== recUnit && (
          <div className="text-xs text-amber-700">
            Receipt unit is {recUnit}, ingredient uses {ingUnit} — check the quantity
          </div>
        )}
        {others.length > 0 && (
          <div className="text-xs text-amber-700">
            Also on line {others.join(", ")} — only the last one will stick
          </div>
        )}
      </>
    );
  };

  const qtyInputs = (l: ReviewLine) => {
    const unit = l.ingredient_id ? byId.get(l.ingredient_id)?.unit : l.base.package_unit;
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <input
          inputMode="decimal"
          value={l.package_quantity}
          onChange={(e) => patch(l.uid, { package_quantity: e.target.value })}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
          aria-label="Package quantity"
        />
        <span className="text-xs text-gray-500 w-7">{unit ?? ""}</span>
        <span className="text-gray-400 text-xs">×</span>
        <input
          inputMode="decimal"
          value={l.package_price}
          onChange={(e) => patch(l.uid, { package_price: e.target.value })}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
          aria-label="Package price"
        />
        <span className="text-xs text-gray-500">lei</span>
        <div className="basis-full">{lineWarnings(l)}</div>
      </div>
    );
  };

  const createBtn = (l: ReviewLine) =>
    l.base.is_food && !l.ingredient_id ? (
      <button
        type="button"
        onClick={() => setCreateFor(l.uid)}
        className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-800 font-medium"
      >
        <Plus className="w-3 h-3" /> Create ingredient
      </button>
    ) : null;

  return (
    <div>
      {header}

      <div className="bg-white rounded-xl border p-4 mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-gray-500">Store:</span>
          <input
            value={store}
            onChange={(e) => setStore(e.target.value)}
            required
            aria-label="Store"
            className={`w-32 px-2 py-1 border rounded text-sm font-medium ${
              storeOk ? "border-gray-300" : "border-red-400 bg-red-50"
            }`}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-gray-500">Date:</span>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            aria-label="Invoice date"
            className="px-2 py-1 border border-gray-300 rounded text-sm"
          />
        </label>
        <span>
          <span className="text-gray-500">Total:</span> <b>{result.total != null ? `${fmt(result.total)} lei` : "-"}</b>
        </span>
        <span>
          <span className="text-gray-500">Model:</span> {result.model}
        </span>
      </div>

      {result.duplicateOf && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm mb-4">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            An invoice with the same store, date and total was already imported on{" "}
            {new Date(result.duplicateOf.created_at).toLocaleDateString()}. Approving again will record it twice.
          </span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="p-3 w-8"></th>
              <th className="p-3">Receipt line</th>
              <th className="p-3 w-72">Ingredient</th>
              <th className="p-3">Package</th>
              <th className="p-3">Price per unit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.uid} className={`border-b last:border-0 align-top ${confCls(l)} ${!l.base.is_food ? "opacity-70" : ""}`}>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={l.include}
                    onChange={(e) => patch(l.uid, { include: e.target.checked })}
                    aria-label="Include line"
                  />
                </td>
                <td className="p-3">
                  <div className="font-medium text-gray-900">
                    <span className="text-gray-400 font-normal">#{l.uid + 1}</span> {l.base.raw_name}
                  </div>
                  <div className="text-xs text-gray-400">{l.base.raw_text}</div>
                  {!l.base.is_food && <div className="text-xs text-gray-500">Non-food</div>}
                  {l.base.match_confidence === "low" && l.ingredient_id && (
                    <div className="text-xs text-amber-700">Low confidence match</div>
                  )}
                  {l.base.note && <div className="text-xs text-amber-700">{l.base.note}</div>}
                </td>
                <td className="p-3 space-y-1">
                  <IngredientPicker
                    ingredients={ingredients}
                    value={l.ingredient_id}
                    onChange={(id) => patch(l.uid, { ingredient_id: id, include: id ? l.include : false })}
                  />
                  {createBtn(l)}
                </td>
                <td className="p-3">{qtyInputs(l)}</td>
                <td className="p-3">{priceCell(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2 mb-4">
        {lines.map((l) => (
          <div key={l.uid} className={`bg-white rounded-xl border p-3 space-y-2 ${confCls(l)} ${!l.base.is_food ? "opacity-70" : ""}`}>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={l.include}
                onChange={(e) => patch(l.uid, { include: e.target.checked })}
                aria-label="Include line"
              />
              <div className="min-w-0">
                <div className="font-medium text-gray-900 text-sm">
                  <span className="text-gray-400 font-normal">#{l.uid + 1}</span> {l.base.raw_name}
                </div>
                <div className="text-xs text-gray-400 break-words">{l.base.raw_text}</div>
                {!l.base.is_food && <div className="text-xs text-gray-500">Non-food</div>}
                {l.base.match_confidence === "low" && l.ingredient_id && (
                  <div className="text-xs text-amber-700">Low confidence match</div>
                )}
                {l.base.note && <div className="text-xs text-amber-700">{l.base.note}</div>}
              </div>
            </div>
            <IngredientPicker
              ingredients={ingredients}
              value={l.ingredient_id}
              onChange={(id) => patch(l.uid, { ingredient_id: id, include: id ? l.include : false })}
            />
            {createBtn(l)}
            {qtyInputs(l)}
            {priceCell(l)}
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 bg-gray-50/95 backdrop-blur border-t -mx-4 px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600 mr-auto">
          {applicable.length} of {lines.length} lines will be applied
          {invalidIncluded > 0 && (
            <span className="text-amber-700"> ({invalidIncluded} selected without ingredient/valid numbers)</span>
          )}
        </span>
        <button
          onClick={discard}
          disabled={applying}
          className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
        >
          Discard
        </button>
        <button
          onClick={approve}
          disabled={applying || applicable.length === 0 || !storeOk}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50"
        >
          {applying && <Loader2 className="w-4 h-4 animate-spin" />}
          Approve
        </button>
      </div>

      {createLine && (
        <IngredientForm
          categories={categories}
          defaults={{
            name: titleCase(createLine.base.raw_name),
            quantity_purchased: createLine.base.package_quantity ?? 0,
            unit: createLine.base.package_unit ?? "g",
            package_price: createLine.base.package_price ?? 0,
          }}
          onClose={() => setCreateFor(null)}
          onSaved={(ing) => {
            setIngredients((prev) => [...prev, ing].sort((a, b) => a.name.localeCompare(b.name)));
            patch(createLine.uid, { ingredient_id: ing.id, include: true });
          }}
        />
      )}

      {pendingConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-gray-900">{pendingConfirm.title}</h2>
            <p className="text-sm text-gray-600 mt-1">{pendingConfirm.body}</p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setPendingConfirm(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => {
                  const { run } = pendingConfirm;
                  setPendingConfirm(null);
                  run();
                }}
                className={`px-4 py-2 text-white font-medium rounded-lg text-sm ${
                  pendingConfirm.danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {pendingConfirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
