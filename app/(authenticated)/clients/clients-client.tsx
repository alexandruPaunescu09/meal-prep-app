"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Client, ClientWithPortalStatus, PortalStatus } from "@/lib/supabase/types";
import { portalStatusColor, portalStatusLabel } from "@/lib/portal/status";
import {
  invalidateClients,
  invalidateContainerDeliveries,
  invalidateMealPlans,
  invalidateProfiles,
} from "@/lib/actions/revalidate";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  Plus,
  Pencil,
  Trash2,
  Mail,
  RefreshCw,
  Ban,
  Search,
  AlertTriangle,
  ClipboardList,
  CalendarPlus,
  Package,
} from "lucide-react";

const STATUS_OPTIONS: PortalStatus[] = ["not_invited", "invited", "active"];

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function ClientsClient({
  clients,
  openNew = false,
}: {
  clients: ClientWithPortalStatus[];
  openNew?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const confirm = useConfirm();
  // /clients?new=1 opens the New Client form on mount.
  const [showForm, setShowForm] = useState(openNew);
  const [editClient, setEditClient] = useState<Client | undefined>();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PortalStatus>("all");

  // Drop the ?new=1 param so a refresh does not reopen the form.
  useEffect(() => {
    if (openNew) {
      router.replace("/clients", { scroll: false });
    }
  }, [openNew, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter(
      (c) =>
        (statusFilter === "all" || c.portal_status === statusFilter) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q))
    );
  }, [clients, query, statusFilter]);

  async function handleDelete(client: Client) {
    const [plans, deliveries] = await Promise.all([
      supabase
        .from("meal_plans")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id),
      supabase
        .from("container_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id),
    ]);
    const loadError = plans.error ?? deliveries.error;
    if (loadError) {
      toast.error(`Could not check ${client.name}'s data: ${loadError.message}`);
      return;
    }

    const planCount = plans.count ?? 0;
    const deliveryCount = deliveries.count ?? 0;
    const impact: string[] = [];
    if (deliveryCount > 0) {
      impact.push(
        `${plural(deliveryCount, "container delivery", "container deliveries")} will be deleted`
      );
    }
    if (planCount > 0) {
      impact.push(
        `${plural(planCount, "meal plan", "meal plans")} will be kept but unlinked from this client`
      );
    }
    const message = impact.length
      ? `${impact.join(". ")}. This cannot be undone.`
      : "This cannot be undone.";

    const ok = await confirm({
      title: `Delete ${client.name}?`,
      message,
      confirmLabel: "Delete client",
      tone: "danger",
    });
    if (!ok) return;

    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      toast.error(`Could not delete ${client.name}: ${error.message}`);
      return;
    }
    await invalidateClients();
    await invalidateMealPlans();
    await invalidateContainerDeliveries();
    toast.success(`Deleted ${client.name}`);
    router.refresh();
  }

  async function invite(client: ClientWithPortalStatus, action: "invite" | "resend" | "revoke") {
    if (!client.email) {
      toast.error("Add an email first");
      return;
    }
    if (action === "revoke") {
      const ok = await confirm({
        title: `Revoke portal access for ${client.name}?`,
        message: "They will no longer be able to open the customer portal.",
        confirmLabel: "Revoke access",
        tone: "danger",
      });
      if (!ok) return;
    }

    setBusyId(client.id);
    try {
      const r = await fetch("/api/portal/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: client.id, action }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(typeof j.error === "string" ? j.error : "Action failed", {
          duration: 8000,
        });
        return;
      }
      // Invite/revoke flips portal_status by writing to profiles.
      await invalidateProfiles();
      await invalidateClients();
      router.refresh();
      toast.success(
        action === "revoke"
          ? `Portal access revoked for ${client.name}`
          : action === "resend"
            ? `Invite resent to ${client.email}`
            : `Invite sent to ${client.email}`
      );
    } catch (err) {
      toast.error(
        `Could not reach the server: ${err instanceof Error ? err.message : "unknown error"}`,
        { duration: 8000 }
      );
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(client: Client) {
    setEditClient(client);
    setShowForm(true);
  }

  function openCreate() {
    setEditClient(undefined);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditClient(undefined);
  }

  const filtersActive = query.trim() !== "" || statusFilter !== "all";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtersActive
              ? `${filtered.length} of ${plural(clients.length, "client", "clients")}`
              : plural(clients.length, "client", "clients")}
          </p>
        </div>
        <button
          onClick={() => openCreate()}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      {clients.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <label className="relative flex-1">
            <span className="sr-only">Search clients by name or email</span>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              className="w-full pl-9 pr-3 py-2 border rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </label>
          <label className="sm:w-56">
            <span className="sr-only">Filter by portal status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | PortalStatus)}
              className="w-full px-3 py-2 border rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            >
              <option value="all">All portal statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {portalStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No clients yet.</p>
          <button
            onClick={() => openCreate()}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Add your first client
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No clients match your search.</p>
          <button
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
            }}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <div
              key={client.id}
              id={`client-${client.id}`}
              className="scroll-mt-20 bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow [&:target]:ring-2 [&:target]:ring-emerald-500"
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <h3 className="font-semibold text-gray-900 min-w-0 break-words">{client.name}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton label={`Edit ${client.name}`} tone="primary" onClick={() => openEdit(client)}>
                    <Pencil size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Delete ${client.name}`} tone="danger" onClick={() => handleDelete(client)}>
                    <Trash2 size={16} aria-hidden="true" />
                  </IconButton>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${portalStatusColor(client.portal_status)}`}>
                  Portal: {portalStatusLabel(client.portal_status)}
                </span>
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
                <div className="mt-2 flex items-start gap-1.5 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-800 ring-1 ring-inset ring-rose-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-rose-600" aria-hidden="true" />
                  <p>
                    <span className="font-semibold">Allergies:</span> {client.allergies}
                  </p>
                </div>
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

              <div className="mt-3 pt-3 border-t flex flex-wrap gap-2">
                <Link
                  href={`/meal-plans?client=${client.id}`}
                  className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
                >
                  <ClipboardList className="w-3 h-3" aria-hidden="true" />
                  Plans
                </Link>
                <Link
                  href={`/meal-plans?new=1&client=${client.id}`}
                  className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
                >
                  <CalendarPlus className="w-3 h-3" aria-hidden="true" />
                  New plan
                </Link>
                <Link
                  href={`/containers#client-${client.id}`}
                  className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
                >
                  <Package className="w-3 h-3" aria-hidden="true" />
                  Containers
                </Link>
              </div>

              <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-2">
                {client.portal_status === "not_invited" && (
                  <>
                    <button
                      disabled={!client.email || busyId === client.id}
                      onClick={() => invite(client, "invite")}
                      className="text-xs px-2.5 py-1 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" aria-hidden="true" />
                      Invite to portal
                    </button>
                    {!client.email && (
                      <span className="text-xs text-gray-500">Add an email first</span>
                    )}
                  </>
                )}
                {client.portal_status === "invited" && (
                  <button
                    disabled={busyId === client.id}
                    onClick={() => invite(client, "resend")}
                    className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" aria-hidden="true" />
                    Resend invite
                  </button>
                )}
                {(client.portal_status === "active" || client.portal_status === "invited") && (
                  <button
                    disabled={busyId === client.id}
                    onClick={() => invite(client, "revoke")}
                    className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 flex items-center gap-1"
                  >
                    <Ban className="w-3 h-3" aria-hidden="true" />
                    Revoke access
                  </button>
                )}
              </div>
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

interface ClientFormState {
  name: string;
  email: string;
  phone: string;
  calorie_target: number | null;
  weight_kg: number | null;
  restrictions: string;
  allergies: string;
  preferences: string;
  notes: string;
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
  const toast = useToast();
  const confirm = useConfirm();
  const nameRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const initialForm: ClientFormState = {
    name: client?.name ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    calorie_target: client?.calorie_target ?? null,
    weight_kg: client?.weight_kg ?? null,
    restrictions: client?.restrictions ?? "",
    allergies: client?.allergies ?? "",
    preferences: client?.preferences ?? "",
    notes: client?.notes ?? "",
  };
  const [form, setForm] = useState<ClientFormState>(initialForm);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  async function handleCancel() {
    if (isDirty) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        message: "Your edits to this client will be lost.",
        confirmLabel: "Discard",
        tone: "danger",
      });
      if (!ok) return;
    }
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      email: form.email || null,
      phone: form.phone || null,
      calorie_target: form.calorie_target,
      weight_kg: form.weight_kg,
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
      toast.error(`Could not save client: ${result.error.message}`);
      setSaving(false);
      return;
    }
    await invalidateClients();
    toast.success("Client saved");
    router.refresh();
    onClose();
  }

  const inputClass =
    "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <Modal
      open
      onClose={onClose}
      title={client ? "Edit client" : "Add client"}
      size="lg"
      dirty={isDirty}
      initialFocusRef={nameRef}
      footer={
        <>
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 sm:flex-none py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="client-form"
            disabled={saving}
            className="flex-1 sm:flex-none py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : client ? "Save changes" : "Add client"}
          </button>
        </>
      }
    >
      <form id="client-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          Weight and calorie target feed the macro targets on this client&apos;s
          meal plans. Protein and fat targets are set per kg on each plan and
          multiplied by the weight entered here.
        </p>

        <div>
          <label htmlFor="client-name" className={labelClass}>
            Name *
          </label>
          <input
            id="client-name"
            ref={nameRef}
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            required
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="client-email" className={labelClass}>
              Email
            </label>
            <input
              id="client-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="client@example.com"
              className={inputClass}
            />
            <p className="text-xs text-gray-500 mt-1">Needed to invite the client to the portal.</p>
          </div>
          <div>
            <label htmlFor="client-phone" className={labelClass}>
              Phone
            </label>
            <input
              id="client-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+40 7XX XXX XXX"
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="client-calories" className={labelClass}>
              Calorie Target (kcal/day)
            </label>
            <input
              id="client-calories"
              type="number"
              min={1}
              value={form.calorie_target ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  calorie_target: e.target.value ? parseInt(e.target.value) : null,
                })
              }
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="client-weight" className={labelClass}>
              Weight (kg)
            </label>
            <input
              id="client-weight"
              type="number"
              step="0.1"
              min={0}
              value={form.weight_kg ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  weight_kg: e.target.value ? parseFloat(e.target.value) : null,
                })
              }
              placeholder="e.g. 70"
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor="client-restrictions" className={labelClass}>
            Restrictions
          </label>
          <input
            id="client-restrictions"
            type="text"
            value={form.restrictions}
            onChange={(e) => setForm({ ...form, restrictions: e.target.value })}
            placeholder="e.g. no gluten, low sodium"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="client-allergies" className="flex items-center gap-1.5 text-sm font-medium text-rose-700 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
            Allergies
          </label>
          <input
            id="client-allergies"
            type="text"
            value={form.allergies}
            onChange={(e) => setForm({ ...form, allergies: e.target.value })}
            placeholder="e.g. peanuts, shellfish"
            className={`${inputClass} border-rose-300 focus:ring-rose-500`}
          />
          <p className="text-xs text-gray-500 mt-1">Shown in red on the client card.</p>
        </div>
        <div>
          <label htmlFor="client-preferences" className={labelClass}>
            Preferences
          </label>
          <input
            id="client-preferences"
            type="text"
            value={form.preferences}
            onChange={(e) => setForm({ ...form, preferences: e.target.value })}
            placeholder="e.g. high protein, no spicy food"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="client-notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="client-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className={`${inputClass} resize-none`}
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
