"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CookingPot,
  ExternalLink,
  FileText,
  Globe,
  ImageIcon,
  Loader2,
  Plus,
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import IngredientForm from "@/components/ingredient-form";
import IngredientPicker from "@/components/ingredient-picker";
import RecipeStepsEditor, { type StepEntry } from "@/components/recipe-steps-editor";
import ScaleRecipeModal from "@/components/scale-recipe-modal";
import { canScale, type ScaleLineInput } from "@/lib/recipes/scale";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { invalidateIngredients, invalidateRecipes } from "@/lib/actions/revalidate";
import { calculateRecipe } from "@/lib/calculations/recipe";
import { missingPieceWeight } from "@/lib/calculations/piece-weight";
import { formatCost, formatNumber } from "@/lib/format";
import { MAX_PARTS, MAX_TOTAL_BYTES, prepareFile, type Prepared } from "@/lib/images/slice";
import {
  blockingCount,
  buildSavePayload,
  canApprove,
  includedLines,
  initReviewLines,
  lineProblem,
  lineQuantity,
  mergeNote,
  qtyToText,
  siteCalories,
  type ReviewLine,
} from "@/lib/recipes/import/draft";
import type { RecipeImportDraft, RecipeImportResponse } from "@/lib/recipes/import/types";
import { validateSourceUrl, validateSteps } from "@/lib/recipes/steps";
import type { Category, ContainerType, Ingredient } from "@/lib/supabase/types";

type Tab = "url" | "text" | "images";

const INPUT =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-base md:text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none";
const MIN_TEXT = 20;
const MAX_TEXT = 30_000;

function capitalize(s: string) {
  const t = s.trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

interface UploadItem {
  file: File;
  parts: Prepared[];
}

export default function RecipeImportClient({
  ingredients: initialIngredients,
  categories,
  containerTypes,
  initialUrl,
}: {
  ingredients: Ingredient[];
  categories: Category[];
  containerTypes: ContainerType[];
  initialUrl: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const confirmRef = useRef(confirm);
  useEffect(() => {
    confirmRef.current = confirm;
  }, [confirm]);
  const skipGuard = useRef(false);
  const startedRef = useRef(false);

  const [ingredients, setIngredients] = useState(initialIngredients);
  const [createdCount, setCreatedCount] = useState(0);
  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  // ---- input stage
  const [tab, setTab] = useState<Tab>("url");
  const [urlInput, setUrlInput] = useState(initialUrl ?? "");
  const [textInput, setTextInput] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<{ message: string; canPaste: boolean } | null>(null);

  // ---- review stage
  const [draft, setDraft] = useState<RecipeImportDraft | null>(null);
  const [model, setModel] = useState("");
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [name, setName] = useState("");
  const [portionsStr, setPortionsStr] = useState("1");
  const [containerTypeId, setContainerTypeId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [steps, setSteps] = useState<StepEntry[]>([]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [createFor, setCreateFor] = useState<number | null>(null);

  const parts = uploads.flatMap((u) => u.parts);
  const totalBytes = parts.reduce((s, p) => s + p.blob.size, 0);
  const tooBig = totalBytes > MAX_TOTAL_BYTES;
  const tooManyParts = parts.length > MAX_PARTS;
  const reviewing = draft !== null;

  // ------------------------------------------------------------ navigation guard (unsaved draft)
  useEffect(() => {
    if (!reviewing) return;
    const h = (e: BeforeUnloadEvent) => {
      if (skipGuard.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    const onClick = (e: MouseEvent) => {
      if (skipGuard.current || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmRef
        .current({
          title: "Leave this page?",
          message: "The imported recipe hasn't been saved. If you leave, you'll have to read it again.",
          confirmLabel: "Leave",
          cancelLabel: "Stay",
          tone: "danger",
        })
        .then((ok) => {
          if (!ok) return;
          skipGuard.current = true;
          router.push(url.pathname + url.search + url.hash);
        });
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", h);
      document.removeEventListener("click", onClick, true);
    };
  }, [reviewing, router]);

  // ------------------------------------------------------------ parsing
  async function parse(body: { url: string } | { text: string } | { files: Prepared[] }) {
    setParsing(true);
    setError(null);
    // A stale ?url= must not reload into a different input kind.
    if (!("url" in body) && new URLSearchParams(window.location.search).has("url")) {
      router.replace("/recipes/import", { scroll: false });
    }
    try {
      let res: Response;
      if ("files" in body) {
        const fd = new FormData();
        for (const p of body.files) fd.append("files", new File([p.blob], p.name, { type: p.blob.type }));
        res = await fetch("/api/recipes/import/parse", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/recipes/import/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = (data as { error?: string }).error ?? `Request failed (${res.status})`;
        setError({ message, canPaste: "url" in body && /paste the recipe/i.test(message) });
        return;
      }
      const r = data as RecipeImportResponse;
      const d = r.draft;
      setDraft(d);
      setModel(r.model);
      setLines(initReviewLines(d.lines));
      setName(d.recipe.name);
      setPortionsStr(String(d.recipe.portions && d.recipe.portions > 0 ? Math.round(d.recipe.portions) : 1));
      setContainerTypeId(null);
      setSourceUrl(d.source.kind === "url" ? (d.source.url ?? "") : "");
      setSteps(d.recipe.steps.map((text) => ({ id: crypto.randomUUID(), text })));
      setDescription("");
      setCreatedCount(0);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Failed to read the recipe", canPaste: false });
    } finally {
      setParsing(false);
    }
  }

  function startUrlParse(raw: string) {
    const url = raw.trim();
    if (!url) return;
    router.replace(`/recipes/import?url=${encodeURIComponent(url)}`, { scroll: false });
    void parse({ url });
  }

  // Deep link: ?url= fills the field and starts parsing once.
  useEffect(() => {
    if (!initialUrl || startedRef.current) return;
    startedRef.current = true;
    void parse({ url: initialUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (incoming.length === 0) return;
    setError(null);
    setPreparing(true);
    try {
      const added: UploadItem[] = [];
      for (const f of incoming) added.push({ file: f, parts: await prepareFile(f) });
      setUploads((prev) => [...prev, ...added]);
    } catch {
      setError({ message: "Could not read one of the images.", canPaste: false });
    } finally {
      setPreparing(false);
    }
  }

  function backToInput() {
    setDraft(null);
    setLines([]);
    setError(null);
    router.replace("/recipes/import", { scroll: false });
  }

  async function discard() {
    const ok = await confirm({
      title: "Discard this import?",
      message: "The recipe hasn't been saved. Nothing has been written.",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      tone: "danger",
    });
    if (ok) backToInput();
  }

  // ------------------------------------------------------------ review state
  function patch(uid: number, p: Partial<ReviewLine>) {
    setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...p } : l)));
  }

  const portions = Math.max(1, parseInt(portionsStr, 10) || 1);
  const portionsValid = /^\d+$/.test(portionsStr) && parseInt(portionsStr, 10) >= 1;
  const inc = includedLines(lines);
  const blocking = blockingCount(lines);
  const unmatchedCount = lines.filter((l) => !l.base.is_section_header && !l.ingredient_id).length;
  const unmatchedIncluded = inc.filter((l) => !l.ingredient_id).length;
  const sourceUrlError = validateSourceUrl(sourceUrl);
  const stepsError = validateSteps(steps.map((s) => s.text));
  const approvable =
    canApprove(lines, name) && portionsValid && !sourceUrlError && !stepsError && !saving;

  const calc = useMemo(() => {
    const entries = lines
      .filter((l) => !l.base.is_section_header && l.include && l.ingredient_id)
      .flatMap((l) => {
        const ingredient = byId.get(l.ingredient_id!);
        const quantity = lineQuantity(l);
        return ingredient && quantity != null ? [{ ingredient, quantity }] : [];
      });
    return { calc: calculateRecipe(entries, portions), used: entries.map((e) => e.ingredient) };
  }, [lines, byId, portions]);
  const [scaleOpen, setScaleOpen] = useState(false);
  const scaleLines = useMemo<ScaleLineInput[]>(
    () =>
      lines.flatMap((l) => {
        const ingredient = l.ingredient_id ? byId.get(l.ingredient_id) : undefined;
        const quantity = lineQuantity(l);
        if (l.base.is_section_header || !ingredient || quantity == null) return [];
        return [{ key: String(l.uid), ingredient, quantity, counts: l.include }];
      }),
    [lines, byId],
  );
  const scalable = canScale(scaleLines);
  function applyScale(quantities: Map<string, number>) {
    setLines((ls) => ls.map((l) => (quantities.has(String(l.uid)) ? { ...l, qty: qtyToText(quantities.get(String(l.uid))!) } : l)));
  }
  const missingPieces = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of calc.used) if (missingPieceWeight(i)) seen.set(i.id, i.name);
    return [...seen.values()];
  }, [calc.used]);

  const payload = useMemo(
    () =>
      buildSavePayload(
        { name, portions, containerTypeId, sourceUrl, steps: steps.map((s) => s.text), customerDescription: description },
        lines,
        ingredients,
      ),
    [name, portions, containerTypeId, sourceUrl, steps, description, lines, ingredients],
  );
  const merged = mergeNote(payload.mergedIngredientIds, ingredients);
  const siteKcal = siteCalories(draft?.recipe.nutrition);

  async function approve() {
    if (!approvable) return;
    const estimates = inc.filter((l) => l.base.is_estimate).length;
    const ok = await confirm({
      title: "Save this recipe?",
      message:
        `"${payload.recipe.name}" will be created with ${payload.ingredients.length} ingredient${
          payload.ingredients.length === 1 ? "" : "s"
        }` +
        (estimates ? ` (${estimates} estimated amount${estimates === 1 ? "" : "s"})` : "") +
        (payload.aliases.length ? ` and ${payload.aliases.length} remembered name${payload.aliases.length === 1 ? "" : "s"}` : "") +
        ".",
      confirmLabel: "Save recipe",
      cancelLabel: "Keep editing",
    });
    if (!ok) return;
    await save();
  }

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const { data, error: rpcErr } = await supabase.rpc("save_imported_recipe", {
      p_recipe: payload.recipe,
      p_ingredients: payload.ingredients,
      p_aliases: payload.aliases,
    });
    if (rpcErr || !data) {
      setSaving(false);
      toast.error(`Could not save recipe: ${rpcErr?.message ?? "no id returned"}`, {
        action: { label: "Retry", onClick: () => void save() },
      });
      return;
    }
    await invalidateRecipes();
    if (createdCount > 0) await invalidateIngredients();
    skipGuard.current = true;
    toast.success("Recipe imported");
    router.push(`/recipes?edit=${data as string}`);
  }

  const createLine = createFor != null ? lines.find((l) => l.uid === createFor) : undefined;

  // ------------------------------------------------------------ pieces of a line
  const matchCell = (l: ReviewLine) => {
    const ing = l.ingredient_id ? byId.get(l.ingredient_id) : undefined;
    return (
      <div className="space-y-1">
        <IngredientPicker
          ingredients={ingredients}
          value={l.ingredient_id}
          onChange={(id) => patch(l.uid, { ingredient_id: id })}
        />
        {!l.ingredient_id && (
          <button
            type="button"
            onClick={() => setCreateFor(l.uid)}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
            aria-label={`Create ingredient for ${l.base.raw_name}`}
          >
            <Plus className="w-3 h-3" /> Create ingredient
          </button>
        )}
        {ing && l.base.match_confidence && l.ingredient_id === l.base.ingredient_id && l.base.match_confidence !== "high" && (
          <p className="text-xs text-amber-700">{l.base.match_confidence === "low" ? "Low-confidence match" : "Probable match"}: check it</p>
        )}
      </div>
    );
  };

  const qtyCell = (l: ReviewLine, mobile: boolean) => {
    const ing = l.ingredient_id ? byId.get(l.ingredient_id) : undefined;
    const unit = ing?.unit ?? l.qtyUnit;
    const id = `qty-${mobile ? "m" : "d"}-${l.uid}`;
    const problem = lineProblem(l);
    return (
      <div>
        <label htmlFor={id} className={mobile ? "block text-xs text-gray-500 mb-0.5" : "sr-only"}>
          Amount ({unit})
        </label>
        <div className="flex items-center gap-1">
          <input
            id={id}
            inputMode="decimal"
            value={l.qty}
            disabled={!l.include}
            aria-invalid={problem && l.ingredient_id ? true : undefined}
            onChange={(e) => patch(l.uid, { qty: e.target.value, qtyUnit: ing ? ing.unit : l.qtyUnit })}
            className="w-24 px-2 py-1 border border-gray-300 rounded text-base md:text-sm disabled:bg-gray-50 disabled:text-gray-400"
          />
          <span className="text-xs text-gray-500 w-8">{unit}</span>
        </div>
        {ing && ing.unit !== l.qtyUnit && (
          <p className="text-xs text-amber-700 mt-0.5">
            Amount is in {l.qtyUnit}, ingredient uses {ing.unit}: check it
          </p>
        )}
        {l.include && problem && l.ingredient_id && <p className="text-xs text-red-600 mt-0.5">{problem}</p>}
      </div>
    );
  };

  const originalCell = (l: ReviewLine) => (
    <div className="space-y-0.5">
      <p className="text-sm text-gray-900 break-words">{l.base.raw_text}</p>
      {l.base.conversion_note && <p className="text-xs text-gray-500">{l.base.conversion_note}</p>}
      <div className="flex flex-wrap gap-1">
        {l.base.is_estimate && (
          <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-amber-100 text-amber-800">Estimate</span>
        )}
        {l.base.optional && (
          <span className="px-1.5 py-0.5 text-[11px] font-medium rounded bg-gray-100 text-gray-600">Optional</span>
        )}
      </div>
      {l.base.note && <p className="text-xs text-amber-700">{l.base.note}</p>}
    </div>
  );

  const includeToggle = (l: ReviewLine, mobile: boolean) => (
    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={l.include}
        onChange={(e) => patch(l.uid, { include: e.target.checked })}
        aria-label={`${l.include ? "Skip" : "Include"} ${l.base.raw_text}`}
        className="w-4 h-4 accent-emerald-600"
      />
      {mobile && <span>{l.include ? "Included" : "Skipped"}</span>}
    </label>
  );

  // ============================================================ RENDER: input stage
  if (!draft) {
    const canParse =
      !parsing &&
      !preparing &&
      ((tab === "url" && urlInput.trim() !== "") ||
        (tab === "text" && textInput.trim().length >= MIN_TEXT && textInput.length <= MAX_TEXT) ||
        (tab === "images" && parts.length > 0 && !tooBig && !tooManyParts));
    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
      { id: "url", label: "URL", icon: <Globe className="w-4 h-4" /> },
      { id: "text", label: "Paste text", icon: <FileText className="w-4 h-4" /> },
      { id: "images", label: "Screenshots", icon: <ImageIcon className="w-4 h-4" /> },
    ];
    return (
      <div className="max-w-3xl mx-auto">
        <Link href="/recipes" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Recipes
        </Link>
        <div className="flex items-center gap-2 mb-1">
          <CookingPot className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-gray-900">Import recipe</h1>
        </div>
        <p className="text-sm text-gray-500 mb-5">
          Read a recipe from a web page, pasted text or screenshots. You review everything before anything is saved.
        </p>

        <div role="tablist" aria-label="Recipe source" className="flex gap-1 border-b mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium -mb-px border-b-2 ${
                tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === "url" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canParse) startUrlParse(urlInput);
            }}
            className="space-y-2"
          >
            <label htmlFor="ri-url" className="block text-sm font-medium text-gray-700">
              Recipe link
            </label>
            <input
              id="ri-url"
              type="url"
              inputMode="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://…"
              className={INPUT}
            />
            <p className="text-xs text-gray-500">The link is saved on the recipe as its source.</p>
          </form>
        )}

        {tab === "text" && (
          <div className="space-y-2">
            <label htmlFor="ri-text" className="block text-sm font-medium text-gray-700">
              Recipe text
            </label>
            <textarea
              id="ri-text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={12}
              placeholder="Paste the ingredients and the steps…"
              className={`${INPUT} resize-y`}
            />
            <p className="text-xs text-gray-500">
              {textInput.trim().length < MIN_TEXT
                ? `At least ${MIN_TEXT} characters.`
                : textInput.length > MAX_TEXT
                  ? `Too long (${formatNumber(textInput.length, 0)} / ${formatNumber(MAX_TEXT, 0)} characters).`
                  : `${formatNumber(textInput.length, 0)} characters.`}
            </p>
          </div>
        )}

        {tab === "images" && (
          <div className="space-y-3">
            <div
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
              className={`border-2 border-dashed rounded-xl p-6 text-center ${
                dragOver ? "border-emerald-500 bg-emerald-50" : "border-gray-300"
              }`}
            >
              <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
              <label className="inline-block cursor-pointer text-sm font-medium text-emerald-700 hover:underline">
                Choose screenshots or photos
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) void addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <p className="text-xs text-gray-500 mt-1">or drop them here. Images, up to 4 MB in total.</p>
            </div>
            {preparing && (
              <p className="text-sm text-gray-500 inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Preparing images…
              </p>
            )}
            {uploads.length > 0 && (
              <ul className="divide-y border rounded-lg">
                {uploads.map((u, i) => (
                  <li key={`${u.file.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="truncate">
                      {u.file.name}
                      {u.parts.length > 1 && <span className="text-gray-500"> · {u.parts.length} parts</span>}
                    </span>
                    <IconButton
                      label={`Remove ${u.file.name}`}
                      onClick={() => setUploads((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="w-4 h-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            {(tooBig || tooManyParts) && (
              <p className="text-sm text-red-600">
                {tooBig
                  ? `Too much to upload (${(totalBytes / 1024 / 1024).toFixed(1)} MB, limit 4 MB). Remove some images.`
                  : `Too many parts (${parts.length}, limit ${MAX_PARTS}). Remove some images.`}
              </p>
            )}
          </div>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <p>{error.message}</p>
            {error.canPaste && tab !== "text" && (
              <button
                type="button"
                onClick={() => {
                  setTab("text");
                  setError(null);
                }}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-white border border-red-200 rounded-lg hover:bg-red-100"
              >
                <FileText className="w-4 h-4" /> Switch to Paste text
              </button>
            )}
          </div>
        )}

        <div className="mt-5">
          <button
            type="button"
            disabled={!canParse}
            onClick={() => {
              if (tab === "url") startUrlParse(urlInput);
              else if (tab === "text") void parse({ text: textInput.trim() });
              else void parse({ files: parts });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50"
          >
            {parsing && <Loader2 className="w-4 h-4 animate-spin" />}
            {parsing ? "Reading recipe…" : "Read recipe"}
          </button>
          {parsing && (
            <p className="text-xs text-gray-500 mt-2" aria-live="polite">
              This takes up to a minute. Nothing is saved yet.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ============================================================ RENDER: review stage
  const dup = draft.duplicateOf;
  const costPending = calc.calc.unpricedCount;
  return (
    <div className="max-w-6xl mx-auto pb-24">
      <button
        type="button"
        onClick={() => void discard()}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Discard and start over
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Review imported recipe</h1>
      <p className="text-sm text-gray-500 mb-4">
        Check the matches and amounts, then approve. Nothing is saved until you do.
        {model && <span className="text-gray-400"> Read with {model}.</span>}
      </p>

      {dup && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            You already have a recipe like this:{" "}
            <Link href={`/recipes?edit=${dup.id}`} className="font-medium underline">
              {dup.name}
            </Link>
            . Saving will create another one.
          </span>
        </div>
      )}

      {/* Recipe panel */}
      <section className="bg-white border rounded-xl p-4 mb-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div className="sm:col-span-4">
            <label htmlFor="ri-name" className="block text-sm font-medium text-gray-700 mb-1">
              Recipe name
            </label>
            <input id="ri-name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
          </div>
          <div className="sm:col-span-1">
            <label htmlFor="ri-portions" className="block text-sm font-medium text-gray-700 mb-1">
              Portions
            </label>
            <input
              id="ri-portions"
              inputMode="numeric"
              value={portionsStr}
              onChange={(e) => setPortionsStr(e.target.value)}
              aria-invalid={portionsValid ? undefined : true}
              className={INPUT}
            />
          </div>
          {containerTypes.length > 0 && (
            <div className="sm:col-span-1">
              <label htmlFor="ri-container" className="block text-sm font-medium text-gray-700 mb-1">
                Container
              </label>
              <select
                id="ri-container"
                value={containerTypeId ?? ""}
                onChange={(e) => setContainerTypeId(e.target.value || null)}
                className={INPUT}
              >
                <option value="">None</option>
                {containerTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {!portionsValid && <p className="text-xs text-red-600">Portions must be a whole number, 1 or more.</p>}
        <div>
          <label htmlFor="ri-source" className="block text-sm font-medium text-gray-700 mb-1">
            Source link
          </label>
          <input
            id="ri-source"
            type="url"
            inputMode="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            aria-invalid={sourceUrlError ? true : undefined}
            className={INPUT}
          />
          {sourceUrlError && <p className="text-xs text-red-600 mt-1">{sourceUrlError}</p>}
          {!sourceUrlError && sourceUrl.trim() && (
            <a
              href={sourceUrl.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline"
            >
              <ExternalLink size={12} /> Open source
            </a>
          )}
        </div>
      </section>

      {/* Lines */}
      <section className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Ingredients{" "}
            <span className="text-sm font-normal text-gray-500">
              {inc.length} included
              {unmatchedIncluded > 0 && ` · ${unmatchedIncluded} unmatched`}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!scalable}
              title={scalable ? "Scale quantities to a calorie target" : "Needs matched ingredients with nutrition"}
              onClick={() => setScaleOpen(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Scale
            </button>
            <button
              type="button"
              disabled={unmatchedCount === 0}
              onClick={() =>
                setLines((ls) => ls.map((l) => (!l.base.is_section_header && !l.ingredient_id ? { ...l, include: false } : l)))
              }
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              Skip all unmatched
            </button>
          </div>
        </div>

        {merged && (
          <p role="status" className="mb-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            {merged}
          </p>
        )}

        {/* Table (md+) */}
        <div className="hidden md:block bg-white border rounded-xl">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-gray-500 border-b">
                <th className="px-3 py-2 w-16 font-medium">Use</th>
                <th className="px-3 py-2 font-medium">From the recipe</th>
                <th className="px-3 py-2 w-72 font-medium">Ingredient</th>
                <th className="px-3 py-2 w-44 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) =>
                l.base.is_section_header ? (
                  <tr key={l.uid} className="bg-gray-50">
                    <td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {l.base.raw_text}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={l.uid}
                    className={`align-top ${l.base.is_estimate && l.include ? "bg-amber-50/60" : ""} ${l.include ? "" : "opacity-60"}`}
                  >
                    <td className="px-3 py-2">{includeToggle(l, false)}</td>
                    <td className="px-3 py-2">{originalCell(l)}</td>
                    <td className="px-3 py-2">{matchCell(l)}</td>
                    <td className="px-3 py-2">{qtyCell(l, false)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        {/* Cards (below md) */}
        <ul className="md:hidden space-y-2">
          {lines.map((l) =>
            l.base.is_section_header ? (
              <li key={l.uid} className="px-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {l.base.raw_text}
              </li>
            ) : (
              <li
                key={l.uid}
                className={`bg-white border rounded-xl p-3 space-y-2 ${
                  l.base.is_estimate && l.include ? "border-amber-300 bg-amber-50/50" : ""
                } ${l.include ? "" : "opacity-60"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">{originalCell(l)}</div>
                  {includeToggle(l, true)}
                </div>
                {matchCell(l)}
                {qtyCell(l, true)}
              </li>
            ),
          )}
        </ul>
      </section>

      <ScaleRecipeModal
        open={scaleOpen}
        onClose={() => setScaleOpen(false)}
        lines={scaleLines}
        portions={portions}
        onApply={applyScale}
      />

      {/* Totals */}
      <section className="bg-white border rounded-xl p-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Per portion (live)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="bg-emerald-50 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Cost</p>
            <p className={`font-bold text-emerald-700 ${costPending > 0 ? "text-xs leading-tight" : "text-sm"}`}>
              {formatCost(calc.calc.costPerPortion, costPending)}
            </p>
          </div>
          {[
            ["Calories", Math.round(calc.calc.perPortion.calories), "kcal"],
            ["Protein", Math.round(calc.calc.perPortion.protein * 10) / 10, "g"],
            ["Carbs", Math.round(calc.calc.perPortion.carbs * 10) / 10, "g"],
            ["Fat", Math.round(calc.calc.perPortion.fat * 10) / 10, "g"],
          ].map(([label, value, unit]) => (
            <div key={label as string} className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-sm font-bold text-gray-900">
                {value} <span className="text-xs font-normal text-gray-500">{unit}</span>
              </p>
            </div>
          ))}
        </div>
        {costPending > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Without a price: {calc.calc.unpricedNames.join(", ")}. The cost is a lower bound until prices are filled in
            (the next receipt import does it).
          </p>
        )}
        {missingPieces.length > 0 && (
          <p className="text-xs text-amber-700 mt-1">
            Counts as grams until you set a weight per piece: {missingPieces.join(", ")}.
          </p>
        )}
        {siteKcal != null && (
          <p className="text-xs text-gray-600 mt-1">
            Site says {formatNumber(siteKcal, 0)} kcal per portion · calculated {Math.round(calc.calc.perPortion.calories)}
          </p>
        )}
      </section>

      {/* Steps + description */}
      <section className="bg-white border rounded-xl p-4 mb-5 space-y-4">
        <RecipeStepsEditor steps={steps} setSteps={setSteps} error={stepsError ?? undefined} />
        <div>
          <label htmlFor="ri-desc" className="block text-sm font-medium text-gray-700 mb-1">
            Customer description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="ri-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${INPUT} resize-y`}
          />
        </div>
      </section>

      {/* Footer */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t bg-white/95 backdrop-blur px-4 py-3 lg:pl-64">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-gray-600" aria-live="polite">
            {blocking > 0 ? (
              <span className="text-red-600">
                {blocking} included line{blocking === 1 ? "" : "s"} still need an ingredient or an amount
              </span>
            ) : approvable ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-4 h-4" /> Ready to save
              </span>
            ) : (
              "Add a name and at least one ingredient"
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void discard()}
              disabled={saving}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void approve()}
              disabled={!approvable}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Approve
            </button>
          </div>
        </div>
      </div>

      {createLine && (
        <IngredientForm
          categories={categories}
          defaults={{
            name: capitalize(createLine.base.raw_name),
            quantity_purchased: createLine.base.suggested_unit === "buc" ? 1 : 1000,
            unit: createLine.base.suggested_unit,
            category: createLine.base.suggested_category ?? undefined,
            package_price: null,
          }}
          initialNutritionQuery={createLine.base.search_term || createLine.base.raw_name}
          onClose={() => setCreateFor(null)}
          onSaved={(ing) => {
            setIngredients((prev) => [...prev, ing].sort((a, b) => a.name.localeCompare(b.name)));
            setCreatedCount((n) => n + 1);
            patch(createLine.uid, { ingredient_id: ing.id, include: true, qtyUnit: createLine.qtyUnit });
          }}
        />
      )}
    </div>
  );
}
