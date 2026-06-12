import PrepClient from "./prep-client";
import { getPrepRules } from "@/lib/data/prep";

export default async function PrepPage() {
  const rules = await getPrepRules();
  return <PrepClient rules={rules as any[]} />;
}
