import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import type {
  Client,
  ClientWithPortalStatus,
  LatestWeight,
  PortalStatus,
} from "@/lib/supabase/types";

const REVALIDATE = 300;

export const getClientCount = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true });
    return count ?? 0;
  },
  ["clients-count"],
  { tags: [CACHE_TAGS.clients], revalidate: REVALIDATE }
);

export const getClients = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("name");
    return (data as Client[]) ?? [];
  },
  ["clients-list"],
  { tags: [CACHE_TAGS.clients], revalidate: REVALIDATE }
);

/**
 * Slim client list (id, name) for review filtering.
 */
export const getClientsSlim = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .order("name");
    return (data as Pick<Client, "id" | "name">[]) ?? [];
  },
  ["clients-slim"],
  { tags: [CACHE_TAGS.clients], revalidate: REVALIDATE }
);

/**
 * Clients enriched with portal status (not_invited / invited / active).
 * Tagged on both clients and profiles so revoking/inviting a customer
 * refreshes the status without waiting for the 5-minute revalidate.
 */
export const getClientsWithPortalStatus = unstable_cache(
  async (): Promise<ClientWithPortalStatus[]> => {
    const supabase = createServiceClient();
    const { data: clients } = await supabase
      .from("clients")
      .select("*")
      .order("name");

    const list = (clients as Client[]) ?? [];
    if (list.length === 0) return [];

    const ids = list.map((c) => c.id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, role, client_id")
      .in("client_id", ids);

    const linked = new Set<string>(
      ((profiles as { role: string; client_id: string }[]) ?? [])
        .filter((p) => p.role === "customer")
        .map((p) => p.client_id)
    );

    // Latest logged weight per client (FD-9). Newest first, so the first row per client wins.
    // One tiny query per client: a global "newest first" scan would hit the API row cap as logs grow.
    const latest = new Map<string, LatestWeight>();
    await Promise.all(
      ids.map(async (id) => {
        const { data } = await supabase
          .from("weight_logs")
          .select("log_date, weight_kg")
          .eq("client_id", id)
          .order("log_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) latest.set(id, { log_date: data.log_date, weight_kg: Number(data.weight_kg) });
      })
    );

    return list.map((c) => {
      let portal_status: PortalStatus = "not_invited";
      if (linked.has(c.id)) portal_status = "active";
      else if (c.invited_at) portal_status = "invited";
      return { ...c, portal_status, latest_weight: latest.get(c.id) ?? null };
    });
  },
  ["clients-with-portal-status"],
  { tags: [CACHE_TAGS.clients, CACHE_TAGS.profiles], revalidate: REVALIDATE }
);
