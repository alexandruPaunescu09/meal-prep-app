import { createServer } from "@/lib/supabase/server";
import { Client, ClientWithPortalStatus } from "@/lib/supabase/types";
import { deriveClientPortalStatuses } from "@/lib/portal/status";
import ClientsClient from "./clients-client";

export default async function ClientsPage() {
  const supabase = await createServer();
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  const enriched = await deriveClientPortalStatuses(
    supabase,
    (clients as Client[]) ?? []
  );

  return <ClientsClient clients={enriched as ClientWithPortalStatus[]} />;
}
