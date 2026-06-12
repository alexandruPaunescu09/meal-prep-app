import {
  getContainerTypes,
  getContainerDeliveries,
} from "@/lib/data/containers";
import { getClients } from "@/lib/data/clients";
import { calculateClientBalance } from "@/lib/calculations/containers";
import ContainersClient from "./containers-client";

export default async function ContainersPage() {
  const [containers, clients, deliveries] = await Promise.all([
    getContainerTypes(),
    getClients(),
    getContainerDeliveries(),
  ]);

  // Cast to any[] — the cached helper returns nested items+container_type
  // joins; calculateClientBalance accepts the existing shape.
  const allDeliveries = deliveries as any[];

  const balances = clients
    .map((client) => {
      const clientDeliveries = allDeliveries.filter(
        (d) => d.client_id === client.id
      );
      return calculateClientBalance(client, clientDeliveries, containers);
    })
    .filter((b) => b.totalOutstanding > 0 || b.balances.length > 0);

  return (
    <ContainersClient containers={containers} balances={balances} />
  );
}
