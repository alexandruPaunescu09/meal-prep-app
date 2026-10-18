import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServer } from "@/lib/supabase/server";

export type CustomerAuth =
  | { ok: true; supabase: SupabaseClient; clientId: string }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guard for customer-only endpoints (same checks as /api/portal/status):
 * 401 without a session, 403 unless profiles.role = 'customer' with a client_id.
 * Returns the customer's cookie-bound (RLS-enforced) client.
 */
export async function requireCustomer(): Promise<CustomerAuth> {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "customer" || !profile.client_id) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, supabase, clientId: profile.client_id as string };
}
