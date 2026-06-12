# Customer Registration & Intake Unification — Design

**Date:** 2026-06-12
**Status:** Approved (pending implementation)

## Problem

The customer portal (shipped 2026-06-09) supports admin-driven invitation only. There is no public self-signup path. The existing `/intake` form creates anonymous `clients` rows with no email and no auth user, so intake-submitted clients can never log in to the portal.

We need a unified registration flow that:
- Lets prospects self-register from a public URL
- Reuses the existing email-matching trigger to avoid creating duplicate `clients` rows when an admin pre-created one
- Re-uses re-registration as a way to refresh intake fields (with password verification to prevent info leaks)
- Leaves the existing admin invite flow unchanged

## Decisions

| Question | Decision |
|---|---|
| Existing auth user re-registers | Verify password; if correct, update intake fields + sign in. If wrong, return generic success (no email-probing). |
| Existing client row, no auth user | Create auth user; existing trigger links profile to existing client; update intake fields. |
| Email confirmation | Skip — auto-confirm via service-role `email_confirm: true` and sign in immediately. |
| Existing `/intake` form | Replace with the new registration form (single unified flow). |
| Duplicate-email `clients` rows | Add `UNIQUE INDEX` on `lower(email)` going forward. Existing dupes block the migration; admin cleans up first. |
| Form fields | email, password, phone, weight_kg, plus existing intake fields (name, calorie_target, restrictions, allergies, preferences, notes). |
| Entry point | "Sign up" link from `/login` → `/intake`. |
| Admin "self-registered" badge | Out of scope. |

## Architecture

### Routes

```
Public (unauthenticated):
  /intake                Public registration form (replaces current intake)
  /api/intake            Service-role POST: register + match + sign-in
  /login                 Sign-in (existing) + new "Sign up" link → /intake

Unchanged:
  /api/portal/invite     Admin-driven invite
  Trigger handle_new_auth_user   Safety net for non-API-created auth users
```

### `/api/intake` POST flow

```
Validate body (registerSchema) → 400 on invalid

Build clients:
  svc      = createServiceClient(URL, SERVICE_ROLE_KEY)
  supabase = createServer()    // cookie-aware, anon key

Look up:
  existingAuth   = svc.auth.admin.listUsers().find by lower(email)
  existingClient = svc.from('clients').ilike('email', input).maybeSingle()

Branch on (existingAuth, existingClient):

  [A] authUser exists:
        // signInWithPassword on the cookie-aware client both verifies the password
        // and (on success) sets session cookies on the response, so verification
        // doubles as sign-in. No separate sign-in call needed in this branch.
        attempt = supabase.auth.signInWithPassword({ email, password })
        if attempt.error:
          return 200 { ok: true, signedIn: false }   // generic, no leak
        clientId = profiles.client_id for attempt.data.user.id
        if clientId is null and existingClient:
          svc.from('profiles').update({ client_id: existingClient.id }).eq('id', user.id)
          clientId = existingClient.id
        if clientId:
          svc.from('clients').update({ ...intakeFields, registered_at: now() }).eq('id', clientId)
        return 200 { ok: true, signedIn: true, redirect: '/portal' }

  [B] client exists, no authUser:
        { user, error } = svc.auth.admin.createUser({ email, password, email_confirm: true })
        if error: return 500 { ok: false, error: 'Could not create account' }
        // trigger links profile to existingClient automatically
        svc.from('clients').update({ ...intakeFields, registered_at: now() }).eq('id', existingClient.id)
        await supabase.auth.signInWithPassword({ email, password })
        return 200 { ok: true, signedIn: true, redirect: '/portal' }

  [C] neither exists:
        { newClient, error } = svc.from('clients').insert({
          ...intakeFields, email, registered_at: now()
        }).select('id').single()
        if error.code === '23505':
          // race: someone registered the same email simultaneously
          existingClient = re-fetch by email
          goto [B]
        if error: return 500
        { user, error } = svc.auth.admin.createUser({ email, password, email_confirm: true })
        if error:
          svc.from('clients').delete().eq('id', newClient.id)   // best-effort rollback
          return 500
        // trigger should have linked profile by now; verify and self-heal if not
        { profile } = svc.from('profiles').select('id').eq('id', user.id).maybeSingle()
        if !profile:
          svc.from('profiles').insert({ id: user.id, role: 'customer', client_id: newClient.id })
        await supabase.auth.signInWithPassword({ email, password })
        return 200 { ok: true, signedIn: true, redirect: '/portal' }

All other failures: log, return 500 with generic message.
```

**Response shape:** `{ ok: boolean, signedIn: boolean, redirect?: string, error?: string }`

**Why password is checked via `signInWithPassword`:** Supabase passwords are bcrypted; this is the only way to verify them. The same call also sets the session cookies in the happy path, so verification doubles as sign-in.

**Race & rollback:** Branch [C] handles the unique-violation race by falling through to [B]. `createUser` failure after a successful client insert triggers a best-effort delete of the orphan client row. We do not wrap in a transaction (Supabase doesn't expose multi-statement client-side transactions); explicit cleanup is the pragmatic substitute.

## Data Changes

**Migration `supabase/migrations/20260612000000_register_flow.sql`:**

```sql
-- 1. Email uniqueness on clients (case-insensitive). Existing dupes block the
--    migration; admin must resolve them manually before applying. Silent
--    dedup-on-migrate would be wrong for live customer data.
CREATE UNIQUE INDEX clients_email_unique_ci
  ON clients (lower(email))
  WHERE email IS NOT NULL;

-- 2. Track which clients came in via self-registration vs admin-created.
ALTER TABLE clients
  ADD COLUMN registered_at TIMESTAMPTZ;
```

**`lib/supabase/types.ts`:**
- Add `registered_at: string | null` to the `Client` interface.

**`lib/validations/schemas.ts`:** new `registerSchema`:

```ts
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
  phone: z.string().nullable().optional(),
  weight_kg: z.number().positive().nullable().optional(),
  calorie_target: z.number().int().positive().nullable().optional(),
  restrictions: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  preferences: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
```

**No changes** to `profiles` table, `handle_new_auth_user` trigger, `auth.users`, `inviteSchema`, `clientSchema`, or `/api/portal/invite`.

**Environment variables:** none new. `SUPABASE_SERVICE_ROLE_KEY` already exists for the invite flow.

## Frontend Changes

### `app/intake/page.tsx` — extend, don't rewrite

Add fields in this order before existing ones:
1. Email (required, `type=email`, `autocomplete=email`)
2. Password (required, `type=password`, `autocomplete=new-password`, min 8 chars, with show/hide toggle)
3. Phone (optional, `type=tel`)
4. Weight kg (optional, `type=number step=0.1`)

Keep existing: name, calorie_target, restrictions, allergies, preferences, notes.

**Submit handler:**
- POST full body matching `registerSchema`
- `{ ok: true, signedIn: true, redirect }` → `router.push(redirect); router.refresh()`
- `{ ok: true, signedIn: false }` → show existing "Thank you" success view (covers wrong-password-on-existing-email case without leaking)
- `!ok` → show existing inline error

**Validation:**
- Mirror `registerSchema` client-side for early feedback
- Server is source of truth

**Below submit button:** "Already have an account? Sign in" link → `/login`.

### `app/login/page.tsx`

Add "Don't have an account? Sign up" link below the existing "Forgot password?" link → `/intake`.

### Middleware

No change. `/intake` is already in `PUBLIC_PREFIXES`.

## Out of Scope

- Admin "self-registered" badge on `/clients` page
- Email confirmation flow
- Test framework setup — verification is manual (see below)

## Verification Checklist

After implementation, manually verify each branch:

1. **Branch [C] — fresh registration:** new email + new client. Submit `/intake`. Expect: redirect to `/portal`; `clients` row created with `registered_at` set; `profiles` row created with `role='customer'`, `client_id` linked.
2. **Branch [B] — existing client, no auth:** admin creates `clients` row with email `x@y.com` (no portal invite). User submits `/intake` with same email. Expect: same `clients.id` (no new row); auth user created; profile linked; intake fields updated; `registered_at` set.
3. **Branch [A], correct password:** user from test 1 re-submits `/intake` with same email, correct password, changed `restrictions`. Expect: signed in to portal; `clients.restrictions` updated; no new auth/client/profile rows.
4. **Branch [A], wrong password:** as #3 but wrong password. Expect: generic "thank you" success screen; NO updates to `clients`; NOT signed in.
5. **Race / duplicate email:** rapid double-submit (simulate via two tabs). Expect: one wins (signed in); the other falls through `[C] → [B]` cleanly; no duplicate `clients` row; no orphan auth user.
6. **Migration with existing dupes:** if `clients` has two rows with the same email, migration fails fast with a clear error. Manual cleanup → re-apply succeeds.
7. **Validation:** invalid email or password < 8 chars returns 400.
8. **Admin invite flow regression:** admin sends invite from `/clients`. Unchanged behavior.
9. **Middleware:** `/intake` is publicly accessible (signed-in or not). After registration, customer is bounced from any non-portal authenticated route.

## CLAUDE.md Changelog Entry

Add this line on completion:

```
| 2026-06-12 | Customer self-registration: /intake replaces anonymous form, captures email+password+phone+weight, matches existing clients by email, auto-confirms and signs in, requires password on re-register to prevent email-probing | `supabase/migrations/20260612000000_register_flow.sql`, `app/intake/page.tsx`, `app/api/intake/route.ts`, `app/login/page.tsx`, `lib/validations/schemas.ts`, `lib/supabase/types.ts` |
```
