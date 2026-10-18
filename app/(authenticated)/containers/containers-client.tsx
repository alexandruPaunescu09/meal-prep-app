"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ContainerType, ClientContainerBalance } from "@/lib/supabase/types";
import { invalidateContainerTypes } from "@/lib/actions/revalidate";
import { Plus, Pencil, Trash2, Package, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatLei, formatDate } from "@/lib/format";

export interface DeliverySummary {
  id: string;
  delivery_date: string;
  sent: number;
  returned: number;
}

export default function ContainersClient({
  containers,
  balances,
  deliveriesByClient,
}: {
  containers: ContainerType[];
  balances: ClientContainerBalance[];
  deliveriesByClient: Record<string, DeliverySummary[]>;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editContainer, setEditContainer] = useState<ContainerType | undefined>();

  // Flagged clients first, then by outstanding count, then by name.
  const sortedBalances = [...balances].sort(
    (a, b) =>
      Number(b.flagged) - Number(a.flagged) ||
      b.totalOutstanding - a.totalOutstanding ||
      a.client.name.localeCompare(b.client.name)
  );

  async function handleDelete(container: ContainerType) {
    const supabase = createClient();

    // Deliveries reference container types with RESTRICT; recipes are unassigned.
    const [deliveryRes, recipeRes] = await Promise.all([
      supabase
        .from("container_delivery_items")
        .select("id", { count: "exact", head: true })
        .eq("container_type_id", container.id),
      supabase
        .from("recipes")
        .select("id", { count: "exact", head: true })
        .eq("container_type_id", container.id),
    ]);
    const countError = deliveryRes.error ?? recipeRes.error;
    if (countError) {
      toast.error(`Could not check usage: ${countError.message}`);
      return;
    }
    const deliveryCount = deliveryRes.count ?? 0;
    const recipeCount = recipeRes.count ?? 0;

    if (deliveryCount > 0) {
      toast.error(
        `"${container.name}" is in use by ${deliveryCount} delivery ${deliveryCount === 1 ? "entry" : "entries"} and cannot be deleted.`
      );
      return;
    }

    const ok = await confirm({
      title: `Delete "${container.name}"?`,
      message:
        recipeCount > 0
          ? `${recipeCount} ${recipeCount === 1 ? "recipe" : "recipes"} will lose this container assignment. This cannot be undone.`
          : "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    const { error } = await supabase.from("container_types").delete().eq("id", container.id);
    if (error) {
      toast.error(`Could not delete "${container.name}": ${error.message}`);
      return;
    }
    toast.success(`Deleted "${container.name}"`);
    await invalidateContainerTypes();
    router.refresh();
  }

  function openEdit(container: ContainerType) {
    setEditContainer(container);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditContainer(undefined);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Containers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {containers.length} container type{containers.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Container
        </button>
      </div>

      {/* Client Container Balances */}
      {sortedBalances.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Client Balances</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedBalances.map((balance) => {
              const tolerance = balance.client.container_tolerance;
              const over = balance.totalOutstanding - tolerance;
              const history = deliveriesByClient[balance.client.id] ?? [];
              return (
                <div
                  key={balance.client.id}
                  id={`client-${balance.client.id}`}
                  className={`bg-white rounded-xl border p-4 scroll-mt-20 target:ring-2 target:ring-emerald-500 ${
                    balance.flagged ? "border-amber-300 bg-amber-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Link
                      href={`/clients#client-${balance.client.id}`}
                      className="font-semibold text-gray-900 hover:text-emerald-700 hover:underline"
                    >
                      {balance.client.name}
                    </Link>
                    {balance.flagged && (
                      <AlertTriangle className="w-4 h-4 text-amber-600" aria-label="Flagged" />
                    )}
                  </div>
                  <div className="space-y-1">
                    {balance.balances.length === 0 && (
                      <p className="text-sm text-gray-500">No containers out.</p>
                    )}
                    {balance.balances.map((b) => (
                      <div
                        key={b.containerType.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-600">{b.containerType.name}</span>
                        <span className="font-medium text-gray-900">{b.outstanding} out</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-600">
                      {balance.totalOutstanding} out · tolerance {tolerance}
                      {balance.flagged && ` · ${over} over`}
                    </span>
                    {balance.flagged && (
                      <span className="text-xs font-medium text-amber-700">Flagged</span>
                    )}
                  </div>
                  {history.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium text-emerald-700 hover:text-emerald-800">
                        Recent deliveries ({history.length})
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {history.map((d) => (
                          <li
                            key={d.id}
                            className="flex items-center justify-between text-xs text-gray-600"
                          >
                            <span>{formatDate(d.delivery_date)}</span>
                            <span>
                              Sent {d.sent} · Returned {d.returned}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Container type catalog */}
      {containers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No container types yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Add your first container type
          </button>
        </div>
      ) : (
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-4">Container Types</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {containers.map((container) => (
              <div
                key={container.id}
                className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-semibold text-gray-900">{container.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton label={`Edit ${container.name}`} onClick={() => openEdit(container)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </IconButton>
                    <IconButton
                      label={`Delete ${container.name}`}
                      tone="danger"
                      onClick={() => handleDelete(container)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                </div>
                {container.volume_ml != null && (
                  <p className="text-sm text-gray-600">{container.volume_ml} ml</p>
                )}
                <p className="text-sm text-gray-600 mt-1">
                  Cost: {formatLei(container.cost)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {showForm && (
        <ContainerForm container={editContainer} onClose={closeForm} />
      )}
    </div>
  );
}

function ContainerForm({
  container,
  onClose,
}: {
  container?: ContainerType;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [initial] = useState({
    name: container?.name ?? "",
    volume_ml: container?.volume_ml ?? (null as number | null),
    cost: container?.cost ?? 0,
  });
  const [form, setForm] = useState<{
    name: string;
    volume_ml: number | null;
    cost: number | null;
  }>(initial);

  const dirty =
    form.name !== initial.name ||
    form.volume_ml !== initial.volume_ml ||
    form.cost !== initial.cost;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      volume_ml: form.volume_ml,
      cost: form.cost ?? 0,
    };

    let result;
    if (container) {
      result = await supabase
        .from("container_types")
        .update(payload)
        .eq("id", container.id);
    } else {
      result = await supabase.from("container_types").insert(payload);
    }

    if (result.error) {
      setError(result.error.message);
      toast.error(`Could not save container: ${result.error.message}`);
      setSaving(false);
    } else {
      toast.success(container ? `Saved "${payload.name}"` : `Added "${payload.name}"`);
      await invalidateContainerTypes();
      router.refresh();
      onClose();
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={container ? "Edit Container" : "Add Container"}
      size="md"
      dirty={dirty}
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
            form="container-form"
            disabled={saving}
            className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : container ? "Update" : "Add Container"}
          </button>
        </div>
      }
    >
      <form id="container-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="container-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name *
          </label>
          <input
            id="container-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder='e.g. "500ml round", "1L rectangular"'
            className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            required
          />
        </div>
        <div>
          <label htmlFor="container-volume" className="block text-sm font-medium text-gray-700 mb-1">
            Volume (ml)
          </label>
          <input
            id="container-volume"
            type="number"
            value={form.volume_ml ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                volume_ml: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
          />
        </div>
        <div>
          <label htmlFor="container-cost" className="block text-sm font-medium text-gray-700 mb-1">
            Replacement Cost (lei) *
          </label>
          <input
            id="container-cost"
            type="number"
            step="0.01"
            min={0}
            value={form.cost ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                cost: e.target.value === "" ? null : parseFloat(e.target.value),
              })
            }
            className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            required
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
