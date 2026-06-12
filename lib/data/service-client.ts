import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client used inside `unstable_cache`-wrapped reads.
 *
 * Why this exists:
 *   `unstable_cache` cannot wrap a function that reads cookies/headers, but
 *   `lib/supabase/server.ts#createServer` does (via @supabase/ssr). Using the
 *   service role key lets cached reads run without per-request cookies, so
 *   the cache is keyed only on the tag/key parts and shared across requests.
 *
 * Why this is safe:
 *   The admin app is single-tenant. RLS for admin tables is just
 *   `auth.uid() IS NOT NULL`, granting any signed-in user full read/write.
 *   Authentication is enforced at middleware + layout level *before* any
 *   cached data function is called. By the time we hit a cached read the
 *   request is already known to come from an authenticated admin, and the
 *   data returned is identical for every admin.
 *
 * Do NOT use this client from the customer portal (`app/(portal)/*`) or any
 * surface that needs RLS to scope data per user. The portal must stay on
 * the cookie-bound `createServer()` client.
 */

let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "createServiceClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
