"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Client } from "@/lib/supabase/types";
import { Plus, Pencil, Trash2, X } from "lucide-react";

export default function ClientsClient({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState<Client | undefined>();

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await supabase.from("clients").delete().eq("id", id);
    router.refresh();
  }

  function openEdit(client: Client) {
    setEditClient(client);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditClient(undefined);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">
            {clients.length} client{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No clients yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Add your first client
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <div
              key={client.id}
              className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{client.name}</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(client)}
                    className="p-1.5 rounded hover:bg-gray-100"
                  >
                    <Pencil className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button
                    onClick={() => handleDelete(client.id, client.name)}
                    className="p-1.5 rounded hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                  </button>
                </div>
              </div>
              {client.calorie_target && (
                <p className="text-sm text-gray-600">
                  Target: {client.calorie_target} kcal/day
                </p>
              )}
              {(client.email || client.phone) && (
                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                  {client.email && <p>{client.email}</p>}
                  {client.phone && <p>{client.phone}</p>}
                </div>
              )}
              {client.restrictions && (
                <p className="text-xs text-gray-500 mt-1">
                  Restrictions: {client.restrictions}
                </p>
              )}
              {client.allergies && (
                <p className="text-xs text-gray-500 mt-1">
                  Allergies: {client.allergies}
                </p>
              )}
              {client.preferences && (
                <p className="text-xs text-gray-500 mt-1">
                  Preferences: {client.preferences}
                </p>
              )}
              {client.notes && (
                <p className="text-xs text-gray-400 mt-2 italic">
                  {client.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ClientForm client={editClient} onClose={closeForm} />
      )}
    </div>
  );
}

function ClientForm({
  client,
  onClose,
}: {
  client?: Client;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: client?.name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    calorie_target: client?.calorie_target ?? (null as number | null),
    restrictions: client?.restrictions ?? "",
    allergies: client?.allergies ?? "",
    preferences: client?.preferences ?? "",
    notes: client?.notes ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      calorie_target: form.calorie_target,
      restrictions: form.restrictions || null,
      allergies: form.allergies || null,
      preferences: form.preferences || null,
      notes: form.notes || null,
    };

    let result;
    if (client) {
      result = await supabase
        .from("clients")
        .update(payload)
        .eq("id", client.id);
    } else {
      result = await supabase.from("clients").insert(payload);
    }

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
    } else {
      router.refresh();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {client ? "Edit Client" : "Add Client"}
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
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="client@example.com"
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+40 7XX XXX XXX"
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Calorie Target (kcal/day)
            </label>
            <input
              type="number"
              value={form.calorie_target ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  calorie_target: e.target.value
                    ? parseInt(e.target.value)
                    : null,
                })
              }
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Restrictions
            </label>
            <input
              type="text"
              value={form.restrictions}
              onChange={(e) =>
                setForm({ ...form, restrictions: e.target.value })
              }
              placeholder="e.g. no gluten, low sodium"
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Allergies
            </label>
            <input
              type="text"
              value={form.allergies}
              onChange={(e) => setForm({ ...form, allergies: e.target.value })}
              placeholder="e.g. peanuts, shellfish"
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Preferences
            </label>
            <input
              type="text"
              value={form.preferences}
              onChange={(e) =>
                setForm({ ...form, preferences: e.target.value })
              }
              placeholder="e.g. high protein, no spicy food"
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
              {saving ? "Saving..." : client ? "Update" : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
