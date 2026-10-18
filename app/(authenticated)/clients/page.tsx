import { getClientsWithPortalStatus } from "@/lib/data/clients";
import ClientsClient from "./clients-client";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const sp = await searchParams;
  const clients = await getClientsWithPortalStatus();
  return <ClientsClient clients={clients} openNew={sp.new === "1"} />;
}
