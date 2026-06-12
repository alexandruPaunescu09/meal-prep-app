"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ContainerType } from "@/lib/supabase/types";
import { invalidateContainerDeliveries } from "@/lib/actions/revalidate";
import { X } from "lucide-react";

interface ContainerLine {
  container_type_id: string;
  containerName: string;
  quantity_sent: number;
  quantity_returned: number;
  expected_return: number;
}

interface DeliveryFormProps {
  clientId: string;
  mealPlanId: string;
  expectedContainers: { container_type_id: string; quantity: number }[];
  onClose: () => void;
}

export default function DeliveryForm({
  clientId,
  mealPlanId,
  expectedContainers,
  onClose,
}: DeliveryFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [lines, setLines] = useState<ContainerLine[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");

  useEffect(() => {
    async function load() {
      const { data: types } = await supabase
        .from("container_types")
        .select("*")
        .order("name");

      if (!types) return;
      setContainerTypes(types as ContainerType[]);

      const { data: lastDelivery } = await supabase
        .from("container_deliveries")
        .select("*, items:container_delivery_items(*, container_type:container_types(*))")
        .eq("client_id", clientId)
        .order("delivery_date", { ascending: false })
        .limit(1)
        .single();

      const expectedReturns = new Map<string, number>();
      if (lastDelivery?.items) {
        for (const item of lastDelivery.items as any[]) {
          if (item.quantity_sent > 0) {
            expectedReturns.set(item.container_type_id, item.quantity_sent);
          }
        }
      }

      const sentMap = new Map<string, number>();
      for (const ec of expectedContainers) {
        sentMap.set(ec.container_type_id, (sentMap.get(ec.container_type_id) ?? 0) + ec.quantity);
      }

      const allTypeIds = new Set([
        ...sentMap.keys(),
        ...expectedReturns.keys(),
      ]);

      const newLines: ContainerLine[] = [];
      for (const typeId of allTypeIds) {
        const ct = (types as ContainerType[]).find((t) => t.id === typeId);
        if (!ct) continue;
        newLines.push({
          container_type_id: typeId,
          containerName: ct.name,
          quantity_sent: sentMap.get(typeId) ?? 0,
          quantity_returned: 0,
          expected_return: expectedReturns.get(typeId) ?? 0,
        });
      }

      setLines(newLines);
    }
    load();
  }, [clientId]);

  function updateLine(idx: number, field: "quantity_sent" | "quantity_returned", value: number) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { data: delivery, error: deliveryErr } = await supabase
      .from("container_deliveries")
      .insert({
        client_id: clientId,
        meal_plan_id: mealPlanId,
        delivery_date: deliveryDate,
        notes: notes || null,
      })
      .select("id")
      .single();

    if (deliveryErr || !delivery) {
      setError(deliveryErr?.message ?? "Failed to create delivery");
      setSaving(false);
      return;
    }

    const items = lines
      .filter((l) => l.quantity_sent > 0 || l.quantity_returned > 0)
      .map((l) => ({
        delivery_id: delivery.id,
        container_type_id: l.container_type_id,
        quantity_sent: l.quantity_sent,
        quantity_returned: l.quantity_returned,
      }));

    if (items.length > 0) {
      const { error: itemsErr } = await supabase
        .from("container_delivery_items")
        .insert(items);

      if (itemsErr) {
        setError(itemsErr.message);
        setSaving(false);
        return;
      }
    }

    await invalidateContainerDeliveries();
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b z-10">
          <h2 className="text-lg font-semibold text-gray-900">Log Delivery</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Date
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>

          {lines.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Containers
              </h3>
              <div className="space-y-3">
                {lines.map((line, idx) => (
                  <div
                    key={line.container_type_id}
                    className="bg-gray-50 rounded-lg p-3"
                  >
                    <p className="text-sm font-medium text-gray-900 mb-2">
                      {line.containerName}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-0.5">
                          Sending out
                        </label>
                        <input
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
                        <label className="block text-xs text-gray-500 mb-0.5">
                          Returned{line.expected_return > 0 ? ` (expected: ${line.expected_return})` : ""}
                        </label>
                        <input
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
                    {line.expected_return > 0 && line.quantity_returned < line.expected_return && (
                      <p className="text-xs text-amber-600 mt-1">
                        Missing: {line.expected_return - line.quantity_returned} container{line.expected_return - line.quantity_returned !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lines.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              No containers assigned to recipes in this plan. Assign container types to recipes first.
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
            >
              {saving ? "Saving..." : "Log Delivery"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
