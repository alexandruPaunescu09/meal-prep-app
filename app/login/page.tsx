"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CookingPot, Eye, EyeOff } from "lucide-react";

function friendlyError(err: { message: string; status?: number; code?: string }) {
  const msg = err.message.toLowerCase();
  if (err.code === "invalid_credentials" || msg.includes("invalid login")) {
    return "Incorrect email or password. Please try again.";
  }
  if (err.code === "email_not_confirmed" || msg.includes("not confirmed")) {
    return "Please confirm your email address first, then sign in.";
  }
  if (
    msg.includes("fetch") ||
    msg.includes("network") ||
    err.status === 0 ||
    err.status === undefined
  ) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (err.status === 429 || msg.includes("rate limit")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return "Could not sign in. Please try again.";
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(friendlyError(error));
      setLoading(false);
      return;
    }

    let destination = "/";
    if (data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.role === "customer") destination = "/portal";
    }

    router.push(destination);
    router.refresh();
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl shadow-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
            <CookingPot className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Meal Prep</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base md:text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              required
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-3 pr-11 py-2 border border-gray-300 rounded-lg text-base md:text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700 rounded-r-lg focus-visible:outline-2 focus-visible:outline-emerald-500"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <Link
            href="/login/forgot-password"
            className="block text-center text-sm text-emerald-700 hover:underline"
          >
            Forgot password?
          </Link>

          <p className="text-center text-sm text-gray-500">
            New customer?{" "}
            <Link href="/intake" className="text-emerald-700 hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
