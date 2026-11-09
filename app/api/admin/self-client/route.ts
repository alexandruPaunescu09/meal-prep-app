import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/data/service-client";
import { CACHE_TAGS } from "@/lib/data/tags";

const bodySchema = z.object({ client_id: z.string().uuid().nullable() });

/**
 * POST `{ client_id: uuid | null }`: links the calling admin to a client record ("self client",
 * so the admin can use the customer portal as My diary), or unlinks with null. Writes ONLY the
 * caller's own profile (`id = user.id AND role = 'admin'`) with the service client: profiles have
 * no UPDATE policy.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let clientId: string | null;
  try {
    clientId = bodySchema.parse(await req.json()).client_id;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const svc = createServiceClient();

  if (clientId) {
    const { data: client, error } = await svc.from("clients").select("id").eq("id", clientId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!client) return NextResponse.json({ error: "client not found" }, { status: 404 });
  }

  const { data, error } = await svc
    .from("profiles")
    .update({ client_id: clientId })
    .eq("id", auth.user.id)
    .eq("role", "admin")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "profile not found" }, { status: 404 });

  revalidateTag(CACHE_TAGS.clients, "max");
  revalidateTag(CACHE_TAGS.profiles, "max");
  return NextResponse.json({ ok: true });
}
