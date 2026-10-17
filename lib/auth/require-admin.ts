import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServer } from "@/lib/supabase/server";

export type RequireAdminResult =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse };

/** Guard for API routes: 401 if signed out, 403 if not an admin profile. */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, supabase, user };
}
