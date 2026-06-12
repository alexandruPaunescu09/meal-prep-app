import { getClientsWithPortalStatus } from "@/lib/data/clients";
import ClientsClient from "./clients-client";

export default async function ClientsPage() {
  const clients = await getClientsWithPortalStatus();
  return <ClientsClient clients={clients} />;
}
