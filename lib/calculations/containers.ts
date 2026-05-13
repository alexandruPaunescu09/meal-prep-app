import {
  Client,
  ContainerType,
  ContainerDelivery,
  ContainerDeliveryItem,
  ClientContainerBalance,
} from "@/lib/supabase/types";

const DEFAULT_TOLERANCE = parseInt(process.env.CONTAINER_TOLERANCE_DEFAULT ?? "2");

export function calculateClientBalance(
  client: Client,
  deliveries: (ContainerDelivery & { items: (ContainerDeliveryItem & { container_type: ContainerType })[] })[],
  containerTypes: ContainerType[]
): ClientContainerBalance {
  const sorted = [...deliveries].sort((a, b) =>
    a.delivery_date.localeCompare(b.delivery_date)
  );

  const missingMap = new Map<string, number>();

  for (let i = 1; i < sorted.length; i++) {
    const prevDelivery = sorted[i - 1];
    const currentDelivery = sorted[i];

    const prevSent = new Map<string, number>();
    for (const item of prevDelivery.items) {
      prevSent.set(
        item.container_type_id,
        (prevSent.get(item.container_type_id) ?? 0) + item.quantity_sent
      );
    }

    const currentReturned = new Map<string, number>();
    for (const item of currentDelivery.items) {
      currentReturned.set(
        item.container_type_id,
        (currentReturned.get(item.container_type_id) ?? 0) + item.quantity_returned
      );
    }

    for (const [typeId, sent] of prevSent) {
      const returned = currentReturned.get(typeId) ?? 0;
      const missing = Math.max(0, sent - returned);
      missingMap.set(typeId, (missingMap.get(typeId) ?? 0) + missing);
    }
  }

  const balances: ClientContainerBalance["balances"] = [];
  let totalOutstanding = 0;

  for (const ct of containerTypes) {
    const outstanding = missingMap.get(ct.id) ?? 0;
    if (outstanding > 0) {
      balances.push({ containerType: ct, outstanding });
      totalOutstanding += outstanding;
    }
  }

  const tolerance = client.container_tolerance ?? DEFAULT_TOLERANCE;

  return {
    client,
    balances,
    totalOutstanding,
    flagged: totalOutstanding > tolerance,
  };
}

export function calculateExpectedReturns(
  lastDelivery: ContainerDelivery & { items: (ContainerDeliveryItem & { container_type: ContainerType })[] } | null
): { containerType: ContainerType; expected: number }[] {
  if (!lastDelivery) return [];

  return lastDelivery.items
    .filter((item) => item.quantity_sent > 0 && item.container_type)
    .map((item) => ({
      containerType: item.container_type!,
      expected: item.quantity_sent,
    }));
}

export function calculateChargeableAmount(
  balance: ClientContainerBalance
): number {
  if (!balance.flagged) return 0;
  const tolerance = balance.client.container_tolerance ?? DEFAULT_TOLERANCE;
  const excess = balance.totalOutstanding - tolerance;
  if (excess <= 0) return 0;

  let charge = 0;
  let remaining = excess;
  for (const b of balance.balances) {
    const fromThis = Math.min(remaining, b.outstanding);
    charge += fromThis * b.containerType.cost;
    remaining -= fromThis;
    if (remaining <= 0) break;
  }
  return charge;
}
