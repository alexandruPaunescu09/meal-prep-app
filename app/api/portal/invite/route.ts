import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { inviteSchema } from "@/lib/validations/schemas";

const FAR_FUTURE_BAN = "9999-12-31T23:59:59Z";

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function POST(req: NextRequest) {
  // Guard: only admins.
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body;
  try {
    body = inviteSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const { client_id, action } = body;

  // Look up the client to get email.
  const { data: client } = await supabase
    .from("clients")
    .select("id, email")
    .eq("id", client_id)
    .maybeSingle();

  if (!client) return NextResponse.json({ error: "client not found" }, { status: 404 });
  if (!client.email) return NextResponse.json({ error: "client has no email" }, { status: 400 });

  const svc = service();

  if (action === "invite" || action === "resend") {
    const redirectTo = process.env.NEXT_PUBLIC_PORTAL_INVITE_REDIRECT
      ?? `${req.nextUrl.origin}/login`;

    const { error } = await svc.auth.admin.inviteUserByEmail(client.email, {
      redirectTo,
    });
    if (error) {
      // If user already exists (resend path), generate a recovery link instead.
      if (error.message?.toLowerCase().includes("already")) {
        const { error: linkErr } = await svc.auth.admin.generateLink({
          type: "recovery",
          email: client.email,
          options: { redirectTo },
        });
        if (linkErr) {
          return NextResponse.json({ error: linkErr.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    await supabase
      .from("clients")
      .update({ invited_at: new Date().toISOString() })
      .eq("id", client_id);

    return NextResponse.json({ ok: true });
  }

  if (action === "revoke") {
    // Find the auth user by email, then ban far-future to disable login.
    const { data: list, error: listErr } = await svc.auth.admin.listUsers();
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
    const target = list?.users.find((u) => u.email?.toLowerCase() === client.email!.toLowerCase());
    if (!target) return NextResponse.json({ error: "auth user not found" }, { status: 404 });

    const { error: banErr } = await svc.auth.admin.updateUserById(target.id, {
      ban_duration: "876000h",
    } as { ban_duration: string });

    if (banErr) return NextResponse.json({ error: banErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
