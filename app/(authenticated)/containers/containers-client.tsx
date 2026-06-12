"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ContainerType, ClientContainerBalance } from "@/lib/supabase/types";
import { invalidateContainerTypes } from "@/lib/actions/revalidate";
import { Plus, Pencil, Trash2, X, Package, AlertTriangle } from "lucide-react";

export default function ContainersClient({
  containers,
  balances,
}: {
  containers: ContainerType[];
  balances: ClientContainerBalance[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showForm, setShowForm] = useState(false);
  const [editContainer, setEditContainer] = useState<ContainerType | undefined>();

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await supabase.from("container_types").delete().eq("id", id);
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
                  <button
                    onClick={() => openEdit(container)}
                    className="p-1.5 rounded hover:bg-gray-100"
                  >
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDelete(container.id, container.name)}
                    className="p-1.5 rounded hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              {container.volume_ml && (
                <p className="text-sm text-gray-600">{container.volume_ml} ml</p>
              )}
              <p className="text-sm text-gray-600 mt-1">
                Cost: {container.cost.toFixed(2)} lei
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Client Container Balances */}
      {balances.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Client Balances</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {balances.map((balance) => (
              <div
                key={balance.client.id}
                className={`bg-white rounded-xl border p-4 ${
                  balance.flagged ? "border-amber-300 bg-amber-50" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">
                    {balance.client.name}
                  </h3>
                  {balance.flagged && (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                </div>
                <div className="space-y-1">
                  {balance.balances.map((b) => (
                    <div
                      key={b.containerType.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-600">{b.containerType.name}</span>
                      <span className="font-medium text-gray-900">
                        {b.outstanding} out
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-2 border-t flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Total: {balance.totalOutstanding} / tolerance: {balance.client.container_tolerance}
                  </span>
                  {balance.flagged && (
                    <span className="text-xs font-medium text-amber-700">
                      Flagged
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
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
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: container?.name ?? "",
    volume_ml: container?.volume_ml ?? (null as number | null),
    cost: container?.cost ?? 0,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      volume_ml: form.volume_ml,
      cost: form.cost,
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
      setSaving(false);
    } else {
      await invalidateContainerTypes();
      router.refresh();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {container ? "Edit Container" : "Add Container"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder='e.g. "500ml round", "1L rectangular"'
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Volume (ml)
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Replacement Cost (lei) *
            </label>
            <input
              type="number"
              step="0.01"
              value={form.cost || ""}
              onChange={(e) =>
                setForm({ ...form, cost: parseFloat(e.target.value) || 0 })
              }
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
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
              {saving ? "Saving..." : container ? "Update" : "Add Container"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
