import { getClientsWithPortalStatus } from "@/lib/data/clients";
import { createServer } from "@/lib/supabase/server";
import ClientsClient from "./clients-client";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const sp = await searchParams;
  const clients = await getClientsWithPortalStatus();
  // The current admin's own link is read per request, never from the shared cache.
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let myClientId: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("client_id")
      .eq("id", user.id)
      .maybeSingle();
    myClientId = (profile?.client_id as string | null) ?? null;
  }
  return <ClientsClient clients={clients} myClientId={myClientId} openNew={sp.new === "1"} />;
}
