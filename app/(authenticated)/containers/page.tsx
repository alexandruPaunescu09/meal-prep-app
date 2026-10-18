import {
  getContainerTypes,
  getContainerDeliveries,
} from "@/lib/data/containers";
import { getClients } from "@/lib/data/clients";
import { calculateClientBalance } from "@/lib/calculations/containers";
import ContainersClient, { type DeliverySummary } from "./containers-client";

const HISTORY_PER_CLIENT = 5;

export default async function ContainersPage() {
  const [containers, clients, deliveries] = await Promise.all([
    getContainerTypes(),
    getClients(),
    getContainerDeliveries(),
  ]);

  // The cached helper returns nested items+container_type joins;
  // calculateClientBalance accepts that shape.
  const allDeliveries = deliveries as unknown as Parameters<
    typeof calculateClientBalance
  >[1];

  // Every client gets a card (even with nothing outstanding) so the
  // "Containers" links on the client cards always land on something.
  const balances = clients.map((client) => {
    const clientDeliveries = allDeliveries.filter(
      (d) => d.client_id === client.id
    );
    return calculateClientBalance(client, clientDeliveries, containers);
  });

  // Deliveries arrive newest first; keep the most recent few per client.
  const deliveriesByClient: Record<string, DeliverySummary[]> = {};
  for (const d of allDeliveries) {
    const list = deliveriesByClient[d.client_id] ?? [];
    if (list.length >= HISTORY_PER_CLIENT) continue;
    const items = (d.items ?? []) as { quantity_sent: number; quantity_returned: number }[];
    list.push({
      id: d.id,
      delivery_date: d.delivery_date,
      sent: items.reduce((sum, i) => sum + i.quantity_sent, 0),
      returned: items.reduce((sum, i) => sum + i.quantity_returned, 0),
    });
    deliveriesByClient[d.client_id] = list;
  }

  return (
    <ContainersClient
      containers={containers}
      balances={balances}
      deliveriesByClient={deliveriesByClient}
    />
  );
}
