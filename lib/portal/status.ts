import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, ClientWithPortalStatus, PortalStatus } from "@/lib/supabase/types";

/**
 * Derive portal status for a list of clients.
 * - not_invited: no invited_at, no profile
 * - invited:     invited_at present, profile not yet created
 * - active:      profile exists with role='customer'
 * - disabled:    profile exists but auth user is banned (banned_until in future)
 *
 * The banned check requires service-role admin API, so callers using the
 * regular SSR client get 'active' even for banned users; the dashboard
 * displays 'disabled' only if the optional admin-side enrichment ran.
 */
export async function deriveClientPortalStatuses<C extends Client>(
  supabase: SupabaseClient,
  clients: C[]
): Promise<(C & { portal_status: PortalStatus })[]> {
  if (clients.length === 0) return [];

  const ids = clients.map((c) => c.id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, role, client_id")
    .in("client_id", ids);

  const linked = new Set<string>(
    (profiles ?? [])
      .filter((p: { role: string }) => p.role === "customer")
      .map((p: { client_id: string }) => p.client_id)
  );

  return clients.map((c) => {
    let portal_status: PortalStatus = "not_invited";
    if (linked.has(c.id)) portal_status = "active";
    else if (c.invited_at) portal_status = "invited";
    return { ...c, portal_status };
  });
}

export function portalStatusLabel(s: PortalStatus): string {
  switch (s) {
    case "not_invited": return "Not invited";
    case "invited":     return "Invited";
    case "active":      return "Active";
    case "disabled":    return "Disabled";
  }
}

export function portalStatusColor(s: PortalStatus): string {
  switch (s) {
    case "not_invited": return "bg-gray-100 text-gray-600";
    case "invited":     return "bg-amber-50 text-amber-700";
    case "active":      return "bg-emerald-50 text-emerald-700";
    case "disabled":    return "bg-red-50 text-red-700";
  }
}
