"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  Client,
  ContainerType,
  ContainerDelivery,
  ContainerDeliveryItem,
  LogContainerDeliveryItem,
} from "@/lib/supabase/types";
import { invalidateContainerDeliveries } from "@/lib/actions/revalidate";
import { calculateClientBalance } from "@/lib/calculations/containers";
import { toLocalISODate } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface ContainerLine {
  container_type_id: string;
  containerName: string;
  quantity_sent: number;
  quantity_returned: number;
  /** Containers the client should hand back now: outstanding balance + last delivery's sent. */
  expected_return: number;
  /** Outstanding balance from deliveries before the last one. */
  outstanding: number;
}

interface DeliveryFormProps {
  clientId: string;
  mealPlanId: string;
  expectedContainers: { container_type_id: string; quantity: number }[];
  onClose: () => void;
}

type DeliveryRow = ContainerDelivery & {
  items: (ContainerDeliveryItem & { container_type: ContainerType })[];
};

export default function DeliveryForm({
  clientId,
  mealPlanId,
  expectedContainers,
  onClose,
}: DeliveryFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<ContainerLine[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(() => toLocalISODate(new Date()));
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      setLoading(true);
      const deliveriesQuery = supabase
        .from("container_deliveries")
        .select("*, items:container_delivery_items(*, container_type:container_types(*))")
        .eq("client_id", clientId)
        .order("delivery_date", { ascending: false });

      const [typesRes, deliveriesRes, clientRes] = await Promise.all([
        supabase.from("container_types").select("*").order("name"),
        deliveriesQuery,
        supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
      ]);
      if (cancelled) return;

      const loadError = typesRes.error ?? deliveriesRes.error ?? clientRes.error;
      if (loadError) {
        setError(loadError.message);
        toast.error(`Could not load containers: ${loadError.message}`);
        setLoading(false);
        return;
      }

      const types = (typesRes.data ?? []) as ContainerType[];
      const deliveries = (deliveriesRes.data ?? []) as unknown as DeliveryRow[];
      const client = clientRes.data as Client | null;

      // Most recent delivery (list is ordered newest first). Its sent containers
      // are the ones the client should return with this delivery.
      const lastDelivery = deliveries[0] ?? null;

      const lastSent = new Map<string, number>();
      for (const item of lastDelivery?.items ?? []) {
        if (item.quantity_sent > 0) {
          lastSent.set(item.container_type_id, item.quantity_sent);
        }
      }

      // Outstanding balance before this delivery, using the same rules as the
      // containers page.
      const outstanding = new Map<string, number>();
      if (client) {
        const balance = calculateClientBalance(client, deliveries, types);
        for (const b of balance.balances) {
          outstanding.set(b.containerType.id, b.outstanding);
        }
      }

      const sentMap = new Map<string, number>();
      for (const ec of expectedContainers) {
        sentMap.set(ec.container_type_id, (sentMap.get(ec.container_type_id) ?? 0) + ec.quantity);
      }

      const allTypeIds = new Set([
        ...sentMap.keys(),
        ...lastSent.keys(),
        ...outstanding.keys(),
      ]);

      const newLines: ContainerLine[] = [];
      for (const typeId of allTypeIds) {
        const ct = types.find((t) => t.id === typeId);
        if (!ct) continue;
        const out = outstanding.get(typeId) ?? 0;
        newLines.push({
          container_type_id: typeId,
          containerName: ct.name,
          quantity_sent: sentMap.get(typeId) ?? 0,
          quantity_returned: 0,
          expected_return: out + (lastSent.get(typeId) ?? 0),
          outstanding: out,
        });
      }

      setLines(newLines);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // expectedContainers is intentionally not a dependency: the parent passes a
    // new array on every render, and re-running would wipe the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, toast]);

  function updateLine(idx: number, field: "quantity_sent" | "quantity_returned", value: number) {
    setTouched(true);
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  }

  function markAllReturned() {
    setTouched(true);
    setLines((prev) =>
      prev.map((l) => ({ ...l, quantity_returned: l.expected_return }))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    const supabase = createClient();
    const items: LogContainerDeliveryItem[] = lines
      .filter((l) => l.quantity_sent > 0 || l.quantity_returned > 0)
      .map((l) => ({
        container_type_id: l.container_type_id,
        quantity_sent: l.quantity_sent,
        quantity_returned: l.quantity_returned,
      }));

    const { error: rpcError } = await supabase.rpc("log_container_delivery", {
      p_client_id: clientId,
      p_meal_plan_id: mealPlanId,
      p_delivery_date: deliveryDate,
      p_notes: notes.trim() || null,
      p_items: items,
    });

    if (rpcError) {
      setError(rpcError.message);
      toast.error(`Could not log delivery: ${rpcError.message}`);
      setSaving(false);
      return;
    }

    toast.success("Delivery logged");
    await invalidateContainerDeliveries();
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Log delivery"
      size="lg"
      dirty={touched}
      initialFocusRef={dateRef}
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="delivery-form"
            disabled={saving || loading}
            className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : "Log Delivery"}
          </button>
        </div>
      }
    >
      <form id="delivery-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="delivery-date" className="block text-sm font-medium text-gray-700 mb-1">
            Delivery Date
          </label>
          <input
            id="delivery-date"
            ref={dateRef}
            type="date"
            value={deliveryDate}
            onChange={(e) => {
              setTouched(true);
              setDeliveryDate(e.target.value);
            }}
            className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
          />
        </div>

        {loading && (
          <p className="text-sm text-gray-400 text-center py-4">Loading containers...</p>
        )}

        {!loading && lines.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Containers</h3>
              <button
                type="button"
                onClick={markAllReturned}
                disabled={saving}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
              >
                Mark all returned
              </button>
            </div>
            <div className="space-y-3">
              {lines.map((line, idx) => {
                const missing = line.expected_return - line.quantity_returned;
                return (
                  <div key={line.container_type_id} className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-gray-900">{line.containerName}</p>
                      <p className="text-xs text-gray-500">
                        Outstanding: {line.outstanding}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`sent-${line.container_type_id}`}
                          className="block text-xs text-gray-500 mb-0.5"
                        >
                          Sending out
                        </label>
                        <input
                          id={`sent-${line.container_type_id}`}
                          type="number"
                          min={0}
                          value={line.quantity_sent}
                          onChange={(e) =>
                            updateLine(idx, "quantity_sent", parseInt(e.target.value) || 0)
                          }
                          className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`returned-${line.container_type_id}`}
                          className="block text-xs text-gray-500 mb-0.5"
                        >
                          Returned{line.expected_return > 0 ? ` (expected: ${line.expected_return})` : ""}
                        </label>
                        <input
                          id={`returned-${line.container_type_id}`}
                          type="number"
                          min={0}
                          value={line.quantity_returned}
                          onChange={(e) =>
                            updateLine(idx, "quantity_returned", parseInt(e.target.value) || 0)
                          }
                          className="w-full px-2 py-1.5 border rounded text-sm text-gray-900 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                      </div>
                    </div>
                    {line.expected_return > 0 && missing > 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        Missing: {missing} container{missing !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && lines.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            No containers assigned to recipes in this plan. Assign container types to recipes first.
          </p>
        )}

        <div>
          <label htmlFor="delivery-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="delivery-notes"
            value={notes}
            onChange={(e) => {
              setTouched(true);
              setNotes(e.target.value);
            }}
            rows={2}
            className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm resize-none"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
