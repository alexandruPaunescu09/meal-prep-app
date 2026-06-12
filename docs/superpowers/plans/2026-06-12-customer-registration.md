# Customer Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the anonymous `/intake` form with a public self-registration flow that creates an auth user, matches existing `clients` rows by email via the existing trigger, and signs the user in to the customer portal.

**Architecture:** Single service-role API endpoint at `/api/intake` that branches on (existingAuth, existingClient). The existing `handle_new_auth_user` Postgres trigger remains as the matching mechanism plus a defense-in-depth safety net. Re-registration with correct password updates intake fields; wrong password returns the same generic success response to prevent email-probing.

**Tech Stack:** Next.js 16 (App Router), Supabase (`@supabase/ssr` + `supabase-js` service-role admin), Zod for validation, Tailwind for styling.

**Spec:** `docs/superpowers/specs/2026-06-12-customer-registration-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/20260612000000_register_flow.sql` — unique index + `registered_at` column

**Modify:**
- `lib/supabase/types.ts` — add `registered_at` to `Client`
- `lib/validations/schemas.ts` — add `registerSchema`
- `app/api/intake/route.ts` — replace minimal handler with branching service-role flow
- `app/intake/page.tsx` — extend form with email/password/phone/weight + new submit logic
- `app/login/page.tsx` — add "Sign up" link to `/intake`
- `CLAUDE.md` — add changelog entry

**Unchanged:**
- `middleware.ts` (`/intake` already in `PUBLIC_PREFIXES`)
- `supabase/migrations/20260609000000_profiles_and_roles.sql` (trigger stays as-is)
- `app/api/portal/invite/route.ts` (admin invite flow untouched)

---

## Task 1: Database migration — unique email index + registered_at column

**Files:**
- Create: `supabase/migrations/20260612000000_register_flow.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260612000000_register_flow.sql`:

```sql
-- Customer self-registration: enforce email uniqueness on clients
-- (case-insensitive, only for non-NULL emails) and track which clients
-- came in via self-registration vs admin-created.
--
-- Existing duplicate-email rows BLOCK this migration. That is intentional:
-- silent dedup-on-migrate is the wrong call for live customer data. If the
-- CREATE UNIQUE INDEX fails, run a query like:
--   SELECT lower(email), array_agg(id) FROM clients
--   WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- ...resolve dupes manually, then re-apply.

CREATE UNIQUE INDEX clients_email_unique_ci
  ON clients (lower(email))
  WHERE email IS NOT NULL;

ALTER TABLE clients
  ADD COLUMN registered_at TIMESTAMPTZ;
```

- [ ] **Step 2: Reset local DB and verify migration applies**

Run: `npm run db:reset`
Expected: All migrations apply cleanly, including the new one. Output ends with "Finished running migrations."

If it fails on duplicate emails, run the SELECT in the comment to find dupes, fix them in the seed/dev data, and re-run `npm run db:reset`.

- [ ] **Step 3: Verify the index and column exist**

Run:
```bash
npx supabase db diff --schema public 2>&1 | head -30
```
Or directly:
```bash
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c "\d clients" | grep -E "registered_at|clients_email_unique_ci"
```
Expected: Both `registered_at` column and `clients_email_unique_ci` index appear.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260612000000_register_flow.sql
git commit -m "feat(db): unique email index + registered_at on clients"
```

---

## Task 2: Update Client type

**Files:**
- Modify: `lib/supabase/types.ts:72-86`

- [ ] **Step 1: Add `registered_at` to the Client interface**

In `lib/supabase/types.ts`, modify the `Client` interface (around lines 72–86):

```typescript
export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  calorie_target: number | null;
  weight_kg: number | null;
  restrictions: string | null;
  allergies: string | null;
  preferences: string | null;
  notes: string | null;
  container_tolerance: number;
  invited_at: string | null;
  registered_at: string | null;
  created_at: string;
}
```

(The only change is the new `registered_at: string | null;` line before `created_at`.)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors. (Some pre-existing errors are fine — confirm `registered_at` doesn't introduce any.)

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat(types): add registered_at to Client"
```

---

## Task 3: Add registerSchema to validations

**Files:**
- Modify: `lib/validations/schemas.ts` (append at bottom)

- [ ] **Step 1: Append the schema**

In `lib/validations/schemas.ts`, after the existing `inviteSchema` block at the end of the file, append:

```typescript
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().nullable().optional(),
  weight_kg: z.number().positive().nullable().optional(),
  calorie_target: z.number().int().positive().nullable().optional(),
  restrictions: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  preferences: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type RegisterFormData = z.infer<typeof registerSchema>;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors related to schemas.

- [ ] **Step 3: Commit**

```bash
git add lib/validations/schemas.ts
git commit -m "feat(validation): add registerSchema for /api/intake"
```

---

## Task 4: Rewrite /api/intake route

**Files:**
- Modify: `app/api/intake/route.ts` (full rewrite)

This route handles three branches in one POST. The trigger `handle_new_auth_user` (defined in `supabase/migrations/20260609000000_profiles_and_roles.sql`) automatically links the profile when an auth user is created and an email-matching `clients` row exists. Branch [B] relies on this. Branch [C] inserts the `clients` row first so the trigger has something to match against, then verifies and self-heals if the trigger didn't link.

- [ ] **Step 1: Replace the route file**

Replace the entire contents of `app/api/intake/route.ts` with:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors in `app/api/intake/route.ts`.

- [ ] **Step 3: Boot the app and curl branch [C]**

Run (in separate terminal): `npm run dev`

Then curl a fresh registration:
```bash
curl -i -X POST http://localhost:3000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"email":"verify-c@example.com","password":"testpass123","name":"Verify C","calorie_target":2000}'
```
Expected: HTTP 200, body `{"ok":true,"signedIn":true,"redirect":"/portal"}`. Set-Cookie headers present.

Then verify in DB:
```bash
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c \
  "SELECT c.id, c.email, c.registered_at, p.role, p.client_id FROM clients c LEFT JOIN profiles p ON p.client_id = c.id WHERE c.email='verify-c@example.com';"
```
Expected: One row, `registered_at` non-NULL, `role='customer'`, `client_id` matches.

- [ ] **Step 4: Curl branch [A] with wrong password**

```bash
curl -i -X POST http://localhost:3000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"email":"verify-c@example.com","password":"wrongpass","name":"Should Not Update","calorie_target":9999}'
```
Expected: HTTP 200, body `{"ok":true,"signedIn":false}`. No `redirect`. Then verify the `calorie_target` is still `2000`, not `9999`:
```bash
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c \
  "SELECT name, calorie_target FROM clients WHERE email='verify-c@example.com';"
```
Expected: `name='Verify C'`, `calorie_target=2000`. (Wrong-password call must NOT mutate.)

- [ ] **Step 5: Curl branch [A] with correct password**

```bash
curl -i -X POST http://localhost:3000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"email":"verify-c@example.com","password":"testpass123","name":"Verify C Updated","calorie_target":2200,"restrictions":"vegan"}'
```
Expected: HTTP 200, body `{"ok":true,"signedIn":true,"redirect":"/portal"}`. Then:
```bash
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c \
  "SELECT name, calorie_target, restrictions FROM clients WHERE email='verify-c@example.com';"
```
Expected: `name='Verify C Updated'`, `calorie_target=2200`, `restrictions='vegan'`. No new client row (still single).

- [ ] **Step 6: Curl branch [B] — admin pre-creates client, user registers**

First create the client manually:
```bash
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c \
  "INSERT INTO clients (name, email) VALUES ('Pre Created', 'verify-b@example.com') RETURNING id;"
```
Note the returned id, then:
```bash
curl -i -X POST http://localhost:3000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"email":"verify-b@example.com","password":"testpass123","name":"Verify B","weight_kg":70}'
```
Expected: HTTP 200, body `{"ok":true,"signedIn":true,"redirect":"/portal"}`. Then verify the SAME id is reused and a profile was linked:
```bash
psql postgres://postgres:postgres@127.0.0.1:54322/postgres -c \
  "SELECT c.id, c.name, c.weight_kg, p.role FROM clients c LEFT JOIN profiles p ON p.client_id=c.id WHERE c.email='verify-b@example.com';"
```
Expected: Single client row (the one you pre-created), `name='Verify B'` (updated), `weight_kg=70`, `role='customer'`.

- [ ] **Step 7: Validation check**

```bash
curl -i -X POST http://localhost:3000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"email":"not-an-email","password":"x","name":"Bad"}'
```
Expected: HTTP 400, body `{"ok":false,"error":"Invalid input"}`.

- [ ] **Step 8: Commit**

```bash
git add app/api/intake/route.ts
git commit -m "feat(api): /api/intake handles register+match+sign-in across three branches"
```

---

## Task 5: Update /intake page UI

**Files:**
- Modify: `app/intake/page.tsx` (full rewrite)

The form keeps its visual style. We add four new fields above the existing ones, change the submit handler to consume the new response shape, and add a "Sign in" link at the bottom.

- [ ] **Step 1: Replace the page**

Replace the entire contents of `app/intake/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function IntakePage() {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    weight_kg: "",
    calorie_target: "",
    restrictions: "",
    allergies: "",
    preferences: "",
    notes: "",
  });

  function validateClient(): string | null {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return "Please enter a valid email.";
    if (form.password.length < 8)
      return "Password must be at least 8 characters.";
    if (!form.name.trim()) return "Name is required.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const clientErr = validateClient();
    if (clientErr) {
      setError(clientErr);
      return;
    }

    setSaving(true);

    const payload = {
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      calorie_target: form.calorie_target ? parseInt(form.calorie_target) : null,
      restrictions: form.restrictions.trim() || null,
      allergies: form.allergies.trim() || null,
      preferences: form.preferences.trim() || null,
      notes: form.notes.trim() || null,
    };

    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: {
        ok: boolean;
        signedIn?: boolean;
        redirect?: string;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setSaving(false);
        return;
      }

      if (data.signedIn && data.redirect) {
        router.push(data.redirect);
        router.refresh();
        return;
      }

      // signedIn=false (e.g. wrong password on existing account, or cookie
      // sign-in failed). Show generic success — same view a successful
      // anonymous register would show.
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border max-w-md w-full p-8 text-center">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Thank you, {form.name}!
          </h1>
          <p className="text-sm text-gray-600">
            Your information has been submitted. We&apos;ll use this to build
            your personalized meal plan.
          </p>
          <Link
            href="/login"
            className="inline-block mt-4 text-sm text-emerald-700 hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border max-w-lg w-full">
        <div className="px-6 py-5 border-b">
          <h1 className="text-xl font-bold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tell us a bit about yourself so we can build the perfect meal plan
            for you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm pr-16"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-700 hover:underline"
                tabIndex={-1}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">At least 8 characters.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.weight_kg}
                onChange={(e) =>
                  setForm({ ...form, weight_kg: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Daily Calorie Target
            </label>
            <input
              type="number"
              value={form.calorie_target}
              onChange={(e) =>
                setForm({ ...form, calorie_target: e.target.value })
              }
              placeholder="e.g. 2000"
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave blank if you&apos;re not sure — we&apos;ll help you figure
              it out.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dietary Restrictions
            </label>
            <textarea
              value={form.restrictions}
              onChange={(e) =>
                setForm({ ...form, restrictions: e.target.value })
              }
              placeholder="e.g. vegetarian, no pork, low sodium, keto..."
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Allergies
            </label>
            <textarea
              value={form.allergies}
              onChange={(e) => setForm({ ...form, allergies: e.target.value })}
              placeholder="e.g. peanuts, shellfish, lactose intolerant..."
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Food Preferences
            </label>
            <textarea
              value={form.preferences}
              onChange={(e) =>
                setForm({ ...form, preferences: e.target.value })
              }
              placeholder="e.g. love chicken and rice, prefer simple meals, no spicy food..."
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anything else we should know?
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g. I eat 4 meals a day, training schedule, specific goals..."
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm transition-colors"
          >
            {saving ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-emerald-700 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript and lint compile**

Run: `npx tsc --noEmit`
Expected: No new errors in `app/intake/page.tsx`.

- [ ] **Step 3: Manual smoke — open the page in a browser**

With `npm run dev` running, open http://localhost:3000/intake. Fill in a fresh email/password/name and submit.
Expected: Redirected to `/portal`, signed in.

- [ ] **Step 4: Manual smoke — re-submit with wrong password**

Open `/intake` again (in incognito or after signing out). Submit with the same email but a wrong password.
Expected: "Thank you, <name>!" success view appears (no error, no redirect to portal).

- [ ] **Step 5: Commit**

```bash
git add app/intake/page.tsx
git commit -m "feat(intake): registration form with email+password+phone+weight"
```

---

## Task 6: Add Sign-up link to login page

**Files:**
- Modify: `app/login/page.tsx:97-104`

- [ ] **Step 1: Add the link**

In `app/login/page.tsx`, find the existing "Forgot password?" `<Link>` (around line 98–103). Right after the closing `</Link>` of the forgot-password link (and still inside the `<form>` element), add:

```tsx
          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/intake" className="text-emerald-700 hover:underline">
              Sign up
            </Link>
          </p>
```

The end of the form should now look like:

```tsx
          <Link
            href="/login/forgot-password"
            className="block text-center text-sm text-emerald-700 hover:underline"
          >
            Forgot password?
          </Link>

          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/intake" className="text-emerald-700 hover:underline">
              Sign up
            </Link>
          </p>
        </form>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors in `app/login/page.tsx`.

- [ ] **Step 3: Manual smoke**

Open http://localhost:3000/login. Confirm "Don't have an account? Sign up" appears below "Forgot password?" and links to `/intake`.

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat(login): add sign-up link to /intake"
```

---

## Task 7: Update CLAUDE.md changelog

**Files:**
- Modify: `CLAUDE.md` (Changelog table at bottom)

- [ ] **Step 1: Append the changelog row**

Open `CLAUDE.md` and find the Changelog table at the bottom. Append this row after the last existing row (the 2026-06-09 customer portal entry):

```
| 2026-06-12 | Customer self-registration: /intake replaces anonymous form, captures email+password+phone+weight, matches existing clients by email, auto-confirms and signs in, requires password on re-register to prevent email-probing | `supabase/migrations/20260612000000_register_flow.sql`, `app/intake/page.tsx`, `app/api/intake/route.ts`, `app/login/page.tsx`, `lib/validations/schemas.ts`, `lib/supabase/types.ts` |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: changelog entry for customer registration"
```

---

## Task 8: Final verification — full manual checklist

Run through every checklist item from the spec end-to-end. This is the user-facing acceptance test before the work is considered done.

- [ ] **Step 1: Reset DB to a clean state**

Run: `npm run db:reset`
Expected: All migrations apply cleanly.

- [ ] **Step 2: Verification scenarios**

With `npm run dev` running, work through the checklist from the spec (`docs/superpowers/specs/2026-06-12-customer-registration-design.md`, section "Verification Checklist"):

1. **Branch [C] fresh registration** — register with brand-new email; expect redirect to `/portal`; verify in DB.
2. **Branch [B] existing client, no auth** — pre-insert a client with email via psql; register with that email; expect same `clients.id`, profile linked.
3. **Branch [A] correct password** — re-submit `/intake` with same email + correct password + changed `restrictions`; expect signed in + fields updated.
4. **Branch [A] wrong password** — re-submit with wrong password; expect generic "thank you" view; no DB mutations.
5. **Race / duplicate email** — open two browser tabs at `/intake`; fill the same fresh email in both; submit both as quickly as possible. One signs in; the other either signs in (if it lost the race and fell into branch [B]) or shows generic "thank you" if the cookie sign-in failed. Verify in DB only one client row exists for that email and exactly one auth user.
6. **Migration with existing dupes** — already validated implicitly by Task 1's `db:reset`.
7. **Validation** — submit `/intake` with a malformed email or 5-character password; expect inline error message, no API call sent past the validation gate (or a 400 response if you bypass client-side).
8. **Admin invite regression** — sign in as admin, go to `/clients`, invite a client with email. Expect the existing invite flow still works.
9. **Middleware** — while signed in as customer, navigate to `/`. Expect redirect to `/portal`. Sign out; navigate to `/intake`. Expect form is accessible.

- [ ] **Step 3: Run typecheck and lint**

Run: `npx tsc --noEmit && npx next lint`
Expected: No new errors introduced by this work.

- [ ] **Step 4: Build succeeds**

Run: `npm run build`
Expected: Build completes without new errors. (Pre-existing warnings/errors are OK if they existed before this work.)

- [ ] **Step 5: Final commit if anything was tweaked during verification**

```bash
git status
# If clean, nothing to commit. If anything changed during verification, commit it
# with a descriptive message before merging.
```
