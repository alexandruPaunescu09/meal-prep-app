import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import type { ContainerType } from "@/lib/supabase/types";

const REVALIDATE = 300;

export const getContainerTypes = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("container_types")
      .select("*")
      .order("name");
    return (data as ContainerType[]) ?? [];
  },
  ["container-types-list"],
  { tags: [CACHE_TAGS.containerTypes], revalidate: REVALIDATE }
);

/**
 * Deliveries with nested items + container_type. Tagged on container types
 * too so renaming one refreshes the list view immediately.
 */
export const getContainerDeliveries = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("container_deliveries")
      .select(
        "*, items:container_delivery_items(*, container_type:container_types(*))"
      )
      .order("delivery_date", { ascending: false });
    return (data as unknown[]) ?? [];
  },
  ["container-deliveries-list"],
  {
    tags: [CACHE_TAGS.containerDeliveries, CACHE_TAGS.containerTypes],
    revalidate: REVALIDATE,
  }
);
