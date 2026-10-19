"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { invalidateFoods } from "@/lib/actions/revalidate";
import type { AdminFood } from "@/lib/data/foods";
import type { MergeFoodsResult } from "@/lib/supabase/types";

/** Pick the food that survives, then merge `from` (the duplicate) into it. */
export default function FoodMergeModal({
  from,
  candidates,
  onClose,
  onMerged,
}: {
  from: AdminFood;
  candidates: AdminFood[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<AdminFood | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return candidates
      .filter((c) => c.id !== from.id)
      .filter((c) => !s || `${c.name} ${c.brand ?? ""} ${c.barcode ?? ""}`.toLowerCase().includes(s))
      .slice(0, 30);
  }, [candidates, from.id, q]);

  async function merge() {
    if (!target) return;
    const ok = await confirm({
      title: `Merge into "${target.name}"?`,
      message: (
        <>
          <strong>{from.name}</strong> will be deleted. Its {from.usage_count} diary{" "}
          {from.usage_count === 1 ? "entry" : "entries"} and its customers&apos; favorites move to{" "}
          <strong>{target.name}</strong>. Logged nutrition snapshots stay as they are.
          {!target.barcode && from.barcode && " The barcode moves to the surviving food."}
        </>
      ),
      confirmLabel: "Merge",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("merge_foods", { p_from: from.id, p_into: target.id });
    setBusy(false);
    if (error) {
      toast.error(`Could not merge: ${error.message}`);
      return;
    }
    await invalidateFoods();
    const r = data as MergeFoodsResult;
    toast.success(`Merged: ${r.entries} diary entries and ${r.favorites_moved} favorites moved`);
    onMerged();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Merge duplicate"
      description={`Choose the food to keep. "${from.name}" is the duplicate that will be removed.`}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!target || busy}
            onClick={() => void merge()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Merge into selected
          </button>
        </div>
      }
    >
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search foods to keep"
          placeholder="Search by name, brand or barcode"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
        />
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">No other foods match.</p>
      ) : (
        <ul role="radiogroup" aria-label="Food to keep" className="divide-y border rounded-lg max-h-72 overflow-y-auto">
          {matches.map((c) => (
            <li key={c.id}>
              <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="merge-target"
                  className="mt-1"
                  checked={target?.id === c.id}
                  onChange={() => setTarget(c)}
                />
                <span className="text-sm">
                  <span className="font-medium text-gray-900">{c.name}</span>
                  {c.brand && <span className="text-gray-500"> · {c.brand}</span>}
                  <span className="block text-xs text-gray-500">
                    {c.status} · {c.barcode ?? "no barcode"} · {c.calories ?? "?"} kcal/100{c.unit} ·{" "}
                    {c.usage_count} logged
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
