import PrepClient from "./prep-client";
import { getPrepRules } from "@/lib/data/prep";
import type { PrepRule } from "@/lib/supabase/types";

export default async function PrepPage() {
  const rules = await getPrepRules();
  return <PrepClient rules={rules as PrepRule[]} />;
}
