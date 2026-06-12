import { NextRequest, NextResponse } from "next/server";
import { createServer } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { registerSchema } from "@/lib/validations/schemas";

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// Fields written to the `clients` row from the registration form.
type IntakeFields = {
  name: string;
  phone: string | null;
  weight_kg: number | null;
  calorie_target: number | null;
  restrictions: string | null;
  allergies: string | null;
  preferences: string | null;
  notes: string | null;
};

function pickIntakeFields(
  body: ReturnType<typeof registerSchema.parse>
): IntakeFields {
  return {
    name: body.name,
    phone: body.phone ?? null,
    weight_kg: body.weight_kg ?? null,
    calorie_target: body.calorie_target ?? null,
    restrictions: body.restrictions ?? null,
    allergies: body.allergies ?? null,
    preferences: body.preferences ?? null,
    notes: body.notes ?? null,
  };
}

export async function POST(req: NextRequest) {
  // 1. Validate input.
  let body;
  try {
    body = registerSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const intakeFields = pickIntakeFields(body);
  const email = body.email.trim().toLowerCase();
  const password = body.password;

  // 2. Build clients.
  const svc = service();
  const supabase = await createServer();

  // 3. Look up existing state.
  // listUsers paginates; for our single-admin-tenant scale, the default first
  // page is sufficient. If we ever cross 50+ auth users, switch to filter param.
  const { data: usersList, error: listErr } = await svc.auth.admin.listUsers();
  if (listErr) {
    return NextResponse.json({ ok: false, error: "Lookup failed" }, { status: 500 });
  }
  const existingAuth = usersList.users.find(
    (u) => u.email?.toLowerCase() === email
  );

  const { data: existingClient } = await svc
    .from("clients")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  // ============================================================
  // Branch [A]: auth user already exists. Verify password.
  // signInWithPassword on the cookie-aware client both verifies AND signs in
  // (sets session cookies on the response), so the same call doubles as
  // sign-in in the happy path.
  // ============================================================
  if (existingAuth) {
    const { data: attempt, error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInErr || !attempt?.user) {
      // Wrong password (or other auth failure) → return the same generic
      // success response a successful registration would. This prevents an
      // attacker from learning whether an email is registered.
      return NextResponse.json({ ok: true, signedIn: false });
    }

    // Password correct. Find the linked client to update intake fields.
    const { data: profile } = await svc
      .from("profiles")
      .select("client_id")
      .eq("id", attempt.user.id)
      .maybeSingle();

    let clientId = profile?.client_id ?? null;

    // Self-heal: if for some reason this auth user has no profile yet (e.g.
    // they were created by the admin invite flow but the trigger didn't fire,
    // or were created before the trigger was added), and we have a matching
    // existingClient, link them up.
    if (!clientId && existingClient) {
      await svc
        .from("profiles")
        .upsert({
          id: attempt.user.id,
          role: "customer",
          client_id: existingClient.id,
        });
      clientId = existingClient.id;
    }

    if (clientId) {
      await svc
        .from("clients")
        .update({ ...intakeFields, registered_at: new Date().toISOString() })
        .eq("id", clientId);
    }

    return NextResponse.json({ ok: true, signedIn: true, redirect: "/portal" });
  }

  // ============================================================
  // Branch [B]: client row exists, no auth user yet.
  // Create the auth user; the DB trigger links the new profile to the
  // existing client by email match.
  // ============================================================
  if (existingClient) {
    const { error: createErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      return NextResponse.json(
        { ok: false, error: "Could not create account" },
        { status: 500 }
      );
    }

    await svc
      .from("clients")
      .update({ ...intakeFields, registered_at: new Date().toISOString() })
      .eq("id", existingClient.id);

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr) {
      // Account exists but cookie sign-in failed; still return success and
      // let the user sign in manually from /login.
      return NextResponse.json({ ok: true, signedIn: false });
    }

    return NextResponse.json({ ok: true, signedIn: true, redirect: "/portal" });
  }

  // ============================================================
  // Branch [C]: neither auth user nor client row exists.
  // Insert the client row FIRST so the auth-user trigger has something to
  // match. If the unique index fires (concurrent registration race), drop
  // through to branch [B] semantics.
  // ============================================================
  const { data: newClient, error: insertErr } = await svc
    .from("clients")
    .insert({
      ...intakeFields,
      email,
      registered_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertErr) {
    // Postgres unique violation: someone registered the same email between
    // our lookup and our insert. Re-fetch and run the [B] branch inline.
    if ((insertErr as { code?: string }).code === "23505") {
      const { data: raceClient } = await svc
        .from("clients")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (!raceClient) {
        return NextResponse.json(
          { ok: false, error: "Could not create account" },
          { status: 500 }
        );
      }

      const { error: createErr } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) {
        return NextResponse.json(
          { ok: false, error: "Could not create account" },
          { status: 500 }
        );
      }

      await svc
        .from("clients")
        .update({ ...intakeFields, registered_at: new Date().toISOString() })
        .eq("id", raceClient.id);

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) {
        return NextResponse.json({ ok: true, signedIn: false });
      }
      return NextResponse.json({ ok: true, signedIn: true, redirect: "/portal" });
    }

    return NextResponse.json(
      { ok: false, error: "Could not create account" },
      { status: 500 }
    );
  }

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created?.user) {
    // Best-effort rollback: delete the orphan client row.
    await svc.from("clients").delete().eq("id", newClient.id);
    return NextResponse.json(
      { ok: false, error: "Could not create account" },
      { status: 500 }
    );
  }

  // Verify the trigger linked profile→client. Self-heal if not.
  const { data: profile } = await svc
    .from("profiles")
    .select("id")
    .eq("id", created.user.id)
    .maybeSingle();

  if (!profile) {
    await svc.from("profiles").insert({
      id: created.user.id,
      role: "customer",
      client_id: newClient.id,
    });
  }

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) {
    return NextResponse.json({ ok: true, signedIn: false });
  }

  return NextResponse.json({ ok: true, signedIn: true, redirect: "/portal" });
}
