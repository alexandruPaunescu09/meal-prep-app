"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { invalidateClients, invalidateProfiles } from "@/lib/actions/revalidate";

const ITEM_CLASS =
  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white w-full transition-colors";

/**
 * Admin sidebar item "My diary". Linked: opens the customer portal for the admin's own client
 * record. Not linked: asks which client record is the admin, links it, then opens the portal.
 */
export default function MyDiaryLink({
  linked,
  onNavigate,
}: {
  linked: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string }[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    (async () => {
      setLoadError(false);
      const { data, error } = await createClient().from("clients").select("id, name").order("name");
      if (stale) return;
      if (error) {
        setLoadError(true);
        return;
      }
      setClients(data ?? []);
    })();
    return () => {
      stale = true;
    };
  }, [open]);

  async function link() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/self-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selected }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(typeof j.error === "string" ? j.error : "Could not link your diary");
        return;
      }
      await invalidateClients();
      await invalidateProfiles();
      setOpen(false);
      onNavigate?.();
      router.push("/portal");
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (linked) {
    return (
      <Link href="/portal" onClick={onNavigate} className={`${ITEM_CLASS} mb-1`}>
        <BookOpen className="w-5 h-5" aria-hidden="true" />
        My diary
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${ITEM_CLASS} mb-1`}>
        <BookOpen className="w-5 h-5" aria-hidden="true" />
        My diary
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Which client record is you?"
        description="Your own food and weight log lives on that client record."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 min-h-[44px] text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void link()}
              disabled={!selected || saving}
              className="px-4 py-2 min-h-[44px] text-sm font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Link
            </button>
          </>
        }
      >
        {loadError ? (
          <p className="text-sm text-red-600">Could not load clients. Close and try again.</p>
        ) : clients === null ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <>
            <label htmlFor="self-client-select" className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <select
              id="self-client-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[44px] text-base md:text-sm text-gray-900"
            >
              <option value="">Select a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        )}
      </Modal>
    </>
  );
}
