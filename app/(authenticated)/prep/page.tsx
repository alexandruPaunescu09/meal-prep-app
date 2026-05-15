import { createServer } from "@/lib/supabase/server";
import PrepClient from "./prep-client";

export default async function PrepPage() {
  const supabase = await createServer();

  const { data: rules } = await supabase
    .from("prep_rules")
    .select("*, ingredient:ingredients(id, name, category)");

  return <PrepClient rules={(rules as any[]) ?? []} />;
}
