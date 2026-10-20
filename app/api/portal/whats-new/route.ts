import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireCustomer } from "@/lib/portal/require-customer";
import { createServiceClient } from "@/lib/data/service-client";
import { RELEASES } from "@/lib/portal/whats-new";

const bodySchema = z.object({ release_id: z.string().min(1).max(100) });

/**
 * POST `{ release_id }`: marks a "What's new" release as acknowledged on the caller's own
 * profile. Customers have no UPDATE policy on `profiles` (it holds `role`), so this writes ONLY
 * `whats_new_seen` with the service client, after `requireCustomer()` resolved who is calling.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) return auth.response;

  let releaseId: string;
  try {
    releaseId = bodySchema.parse(await req.json()).release_id;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!RELEASES.some((r) => r.id === releaseId)) {
    return NextResponse.json({ error: "unknown release" }, { status: 400 });
  }

  const { error } = await createServiceClient()
    .from("profiles")
    .update({ whats_new_seen: releaseId })
    .eq("client_id", auth.clientId)
    .eq("role", "customer");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
