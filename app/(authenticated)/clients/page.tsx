import { createServer } from "@/lib/supabase/server";
import { Client } from "@/lib/supabase/types";
import ClientsClient from "./clients-client";

export default async function ClientsPage() {
  const supabase = await createServer();
  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  return <ClientsClient clients={(clients as Client[]) ?? []} />;
}
