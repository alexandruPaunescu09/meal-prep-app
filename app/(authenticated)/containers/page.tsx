import { createServer } from "@/lib/supabase/server";
import { ContainerType, Client, ContainerDelivery } from "@/lib/supabase/types";
import { calculateClientBalance } from "@/lib/calculations/containers";
import ContainersClient from "./containers-client";

export default async function ContainersPage() {
  const supabase = await createServer();

  const [{ data: containers }, { data: clients }, { data: deliveries }] = await Promise.all([
    supabase.from("container_types").select("*").order("name"),
    supabase.from("clients").select("*").order("name"),
    supabase
      .from("container_deliveries")
      .select("*, items:container_delivery_items(*, container_type:container_types(*))")
      .order("delivery_date", { ascending: false }),
  ]);

  const containerTypes = (containers as ContainerType[]) ?? [];
  const allClients = (clients as Client[]) ?? [];
  const allDeliveries = (deliveries as any[]) ?? [];

  const balances = allClients
    .map((client) => {
      const clientDeliveries = allDeliveries.filter((d) => d.client_id === client.id);
      return calculateClientBalance(client, clientDeliveries, containerTypes);
    })
    .filter((b) => b.totalOutstanding > 0 || b.balances.length > 0);

  return (
    <ContainersClient
      containers={containerTypes}
      balances={balances}
    />
  );
}
