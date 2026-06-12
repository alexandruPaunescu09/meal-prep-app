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
