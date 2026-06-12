"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Auth callback for Supabase email links and OAuth.
 *
 * Two flows land here:
 *
 * 1) Recovery / magic-link emails (default Supabase email templates) deliver
 *    tokens in the URL fragment: `#access_token=...&refresh_token=...&type=recovery`.
 *    The fragment is client-side only, so a server route handler can't see it.
 *    This page reads `window.location.hash`, calls `setSession()`, then routes
 *    by `type` (recovery → /portal/set-password, anything else → /portal).
 *
 * 2) PKCE / code exchange flows deliver `?code=...` as a query param. We
 *    handle that here too via `exchangeCodeForSession()`.
 *
 * The `?next=...` query param overrides the default destination if present
 * and starts with "/".
 */
function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const next = params.get("next");
    const code = params.get("code");

    async function run() {
      // Parse the URL hash fragment if present (recovery / implicit flow).
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const hashParams = new URLSearchParams(
        hash.startsWith("#") ? hash.slice(1) : hash
      );
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const type = hashParams.get("type"); // "recovery", "signup", "invite", "magiclink"
      const hashErr =
        hashParams.get("error_description") || hashParams.get("error");

      if (hashErr) {
        setError(hashErr);
        return;
      }

      // Path A: hash-based session (recovery / magic-link / invite / signup confirm)
      if (accessToken && refreshToken) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setErr) {
          setError(setErr.message);
          return;
        }

        // Recovery emails should land on the set-password page so the user
        // can choose a new password. Other flows go to the portal (or wherever
        // `next=` says).
        const destination =
          next && next.startsWith("/")
            ? next
            : type === "recovery"
            ? "/portal/set-password"
            : "/portal";

        router.replace(destination);
        return;
      }

      // Path B: PKCE code exchange (OAuth, future use)
      if (code) {
        const { error: exErr } = await supabase.auth.exchangeCodeForSession(
          code
        );
        if (exErr) {
          setError(exErr.message);
          return;
        }

        const destination =
          next && next.startsWith("/") ? next : "/portal";
        router.replace(destination);
        return;
      }

      // Neither path matched — link was malformed or already consumed.
      setError(
        "This link is missing its credentials or has already been used. " +
          "Request a new link from the sign-in page."
      );
    }

    run();
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8 text-center">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-gray-900 mb-2">Link error</h1>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <a
              href="/login"
              className="inline-block px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
            >
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-600">Signing you in…</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-gray-600">Signing you in…</p>
          </div>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
