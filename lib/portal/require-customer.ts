import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServer } from "@/lib/supabase/server";
import { portalAccess } from "@/lib/auth/portal-access";

export type CustomerAuth =
  | { ok: true; supabase: SupabaseClient; clientId: string; userId: string; isAdmin: boolean }
  | { ok: false; response: NextResponse };

/**
 * Route-handler guard for portal endpoints: 401 without a session, 403 unless the profile is a
 * customer with a client_id, or an admin linked to a "self client" (`portalAccess`).
 * Returns the caller's cookie-bound client. NOTE: for an admin that client passes `is_admin()` RLS
 * on every table, so every query must filter by `clientId` explicitly; never rely on RLS to scope.
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
  const access = portalAccess(profile);
  if (!access.canUsePortal || !access.clientId) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, supabase, clientId: access.clientId, userId: user.id, isAdmin: access.isAdmin };
}
