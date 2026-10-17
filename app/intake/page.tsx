"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseDecimal } from "@/lib/format";

type FieldKey =
  | "email"
  | "password"
  | "name"
  | "phone"
  | "weight_kg"
  | "calorie_target"
  | "restrictions"
  | "allergies"
  | "preferences"
  | "notes";

type FormState = Record<FieldKey, string>;
type FieldErrors = Partial<Record<FieldKey, string>>;

// Order used for validation focus (first invalid field wins) and the summary.
const VALIDATED_FIELDS: FieldKey[] = [
  "email",
  "password",
  "name",
  "weight_kg",
  "calorie_target",
];

const LABELS: Partial<Record<FieldKey, string>> = {
  email: "Email",
  password: "Password",
  name: "Your name",
  weight_kg: "Weight",
  calorie_target: "Daily calorie target",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEIGHT_MIN = 20;
const WEIGHT_MAX = 300;
const CALORIE_MIN = 800;
const CALORIE_MAX = 6000;

const EMPTY_FORM: FormState = {
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
};

// Mirrors registerSchema (lib/validations/schemas.ts) plus tighter ranges for
// the numeric fields. Returns one message per invalid field.
function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  const email = form.email.trim();
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address, e.g. name@example.com.";

  if (!form.password) errors.password = "Enter a password.";
  else if (form.password.length < 8) errors.password = "Password must be at least 8 characters.";
  else if (form.password.length > 72) errors.password = "Password must be 72 characters or fewer.";

  if (!form.name.trim()) errors.name = "Enter your name.";

  const weightText = form.weight_kg.trim();
  if (weightText) {
    const w = parseDecimal(weightText);
    if (w === null || w < WEIGHT_MIN || w > WEIGHT_MAX)
      errors.weight_kg = `Enter a weight between ${WEIGHT_MIN} and ${WEIGHT_MAX} kg, e.g. 72,5.`;
  }

  const calorieText = form.calorie_target.trim();
  if (calorieText) {
    const c = Number(calorieText);
    if (!/^\d+$/.test(calorieText) || c < CALORIE_MIN || c > CALORIE_MAX)
      errors.calorie_target = `Enter a whole number between ${CALORIE_MIN} and ${CALORIE_MAX}.`;
  }

  return errors;
}

const inputBase =
  "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm";

function inputClass(invalid: boolean, extra = "") {
  return `${inputBase} ${invalid ? "border-red-500" : "border-gray-300"} ${extra}`.trim();
}

export default function IntakePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Set after a successful submit; drives the confirmation screen.
  const [outcome, setOutcome] = useState<null | "portal" | "signin">(null);
  const [portalHref, setPortalHref] = useState("/portal");
  const [submittedName, setSubmittedName] = useState("");

  function update(key: FieldKey, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((errs) => ({ ...errs, [key]: undefined }));
    }
  }

  function describedBy(key: FieldKey, hasHint = false) {
    const ids = [
      hasHint ? `intake-${key}-hint` : null,
      fieldErrors[key] ? `intake-${key}-error` : null,
    ].filter(Boolean);
    return ids.length ? ids.join(" ") : undefined;
  }

  function renderError(k: FieldKey) {
    const msg = fieldErrors[k];
    if (!msg) return null;
    return (
      <p id={`intake-${k}-error`} className="text-xs text-red-600 mt-1">
        {msg}
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const errors = validate(form);
    setFieldErrors(errors);
    const firstInvalid = VALIDATED_FIELDS.find((k) => errors[k]);
    if (firstInvalid) {
      const el = document.getElementById(`intake-${firstInvalid}`);
      el?.focus();
      el?.scrollIntoView({ block: "center" });
      return;
    }

    setSaving(true);

    const calorieText = form.calorie_target.trim();
    const payload = {
      email: form.email.trim(),
      password: form.password,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      weight_kg: parseDecimal(form.weight_kg),
      calorie_target: calorieText ? Number(calorieText) : null,
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
        setFormError(
          data.error === "Invalid input"
            ? "Some details could not be read. Please check the form and try again."
            : data.error || "Something went wrong. Please try again."
        );
        setSaving(false);
        return;
      }

      setSubmittedName(payload.name);
      setSaving(false);

      if (data.signedIn && data.redirect) {
        // Signed in: show a confirmation with next steps before entering the portal.
        setPortalHref(data.redirect);
        setOutcome("portal");
        return;
      }

      // signedIn=false: either a wrong password on an existing account or a
      // cookie sign-in failure. The server answers both the same way so the
      // form does not reveal which emails are registered.
      setOutcome("signin");
    } catch {
      setFormError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  if (outcome === "portal") {
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
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Your account is ready</h1>
          <p className="text-sm text-gray-600">
            Thanks, {submittedName}. We&apos;ll prepare your meal plan and it will appear in your portal.
          </p>
          <ol className="text-left text-sm text-gray-700 mt-5 space-y-2 list-decimal pl-5">
            <li>We prepare your meal plan.</li>
            <li>It appears in your portal under Today and Plans.</li>
            <li>You can check your details anytime in Profile.</li>
          </ol>
          <button
            type="button"
            onClick={() => {
              router.push(portalHref);
              router.refresh();
            }}
            className="w-full mt-6 py-2.5 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm transition-colors"
          >
            Go to my portal
          </button>
        </div>
      </div>
    );
  }

  if (outcome === "signin") {
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
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Thank you, {submittedName}!
          </h1>
          <p className="text-sm text-gray-600">
            We&apos;ve received your details. To see your meal plan, sign in with
            your email and password.
          </p>
          <Link
            href="/login"
            className="inline-block w-full mt-6 py-2.5 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm transition-colors"
          >
            Go to sign in
          </Link>
          <p className="text-sm text-gray-500 mt-4">
            Forgot your password?{" "}
            <Link href="/login/forgot-password" className="text-emerald-700 hover:underline">
              Reset it here
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const errorList = VALIDATED_FIELDS.filter((k) => fieldErrors[k]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border max-w-lg w-full">
        <div className="px-6 py-5 border-b">
          <h1 className="text-xl font-bold text-gray-900">Create your account</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tell us a bit about yourself so we can build the perfect meal plan
            for you. Fields marked * are required.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-6">
          {formError && (
            <div
              role="alert"
              className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg"
            >
              {formError}
            </div>
          )}

          {errorList.length > 0 && (
            <div
              role="alert"
              className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg"
            >
              <p className="font-medium">
                Please fix {errorList.length === 1 ? "1 field" : `${errorList.length} fields`} to continue:
              </p>
              <ul className="list-disc pl-5 mt-1">
                {errorList.map((k) => (
                  <li key={k}>
                    <a href={`#intake-${k}`} className="underline">
                      {LABELS[k]}
                    </a>
                    : {fieldErrors[k]}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---------------- Account ---------------- */}
          <section aria-labelledby="intake-section-account" className="space-y-4">
            <h2 id="intake-section-account" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Account
            </h2>

            <div>
              <label htmlFor="intake-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                id="intake-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                aria-required="true"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={describedBy("email")}
                className={inputClass(!!fieldErrors.email)}
              />
              {renderError("email")}
            </div>

            <div>
              <label htmlFor="intake-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password *
              </label>
              <div className="relative">
                <input
                  id="intake-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  aria-required="true"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={describedBy("password", true)}
                  className={inputClass(!!fieldErrors.password, "pr-20")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-emerald-700 hover:underline rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <p id="intake-password-hint" className="text-xs text-gray-500 mt-1">
                At least 8 characters.
              </p>
              {renderError("password")}
            </div>
          </section>

          {/* ---------------- About you ---------------- */}
          <section aria-labelledby="intake-section-about" className="space-y-4">
            <h2 id="intake-section-about" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              About you
            </h2>

            <div>
              <label htmlFor="intake-name" className="block text-sm font-medium text-gray-700 mb-1">
                Your name *
              </label>
              <input
                id="intake-name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                aria-required="true"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={describedBy("name")}
                className={inputClass(!!fieldErrors.name)}
              />
              {renderError("name")}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="intake-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  id="intake-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className={inputClass(false)}
                />
              </div>
              <div>
                <label htmlFor="intake-weight_kg" className="block text-sm font-medium text-gray-700 mb-1">
                  Weight (kg)
                </label>
                <input
                  id="intake-weight_kg"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="e.g. 72,5"
                  value={form.weight_kg}
                  onChange={(e) => update("weight_kg", e.target.value)}
                  aria-invalid={!!fieldErrors.weight_kg}
                  aria-describedby={describedBy("weight_kg", true)}
                  className={inputClass(!!fieldErrors.weight_kg)}
                />
                <p id="intake-weight_kg-hint" className="sr-only">
                  Between {WEIGHT_MIN} and {WEIGHT_MAX} kg.
                </p>
                {renderError("weight_kg")}
              </div>
            </div>

            <div>
              <label htmlFor="intake-calorie_target" className="block text-sm font-medium text-gray-700 mb-1">
                Daily calorie target
              </label>
              <input
                id="intake-calorie_target"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 2000"
                value={form.calorie_target}
                onChange={(e) => update("calorie_target", e.target.value)}
                aria-invalid={!!fieldErrors.calorie_target}
                aria-describedby={describedBy("calorie_target", true)}
                className={inputClass(!!fieldErrors.calorie_target)}
              />
              <p id="intake-calorie_target-hint" className="text-xs text-gray-500 mt-1">
                Leave blank if you&apos;re not sure. We&apos;ll help you figure it out.
              </p>
              {renderError("calorie_target")}
            </div>
          </section>

          {/* ---------------- Food preferences ---------------- */}
          <section aria-labelledby="intake-section-food" className="space-y-4">
            <h2 id="intake-section-food" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Food preferences
            </h2>

            <div>
              <label htmlFor="intake-restrictions" className="block text-sm font-medium text-gray-700 mb-1">
                Dietary restrictions
              </label>
              <textarea
                id="intake-restrictions"
                value={form.restrictions}
                onChange={(e) => update("restrictions", e.target.value)}
                placeholder="e.g. vegetarian, no pork, low sodium, keto..."
                rows={2}
                className={inputClass(false, "resize-none")}
              />
            </div>

            <div>
              <label htmlFor="intake-allergies" className="block text-sm font-medium text-gray-700 mb-1">
                Allergies
              </label>
              <textarea
                id="intake-allergies"
                value={form.allergies}
                onChange={(e) => update("allergies", e.target.value)}
                placeholder="e.g. peanuts, shellfish, lactose intolerant..."
                rows={2}
                className={inputClass(false, "resize-none")}
              />
            </div>

            <div>
              <label htmlFor="intake-preferences" className="block text-sm font-medium text-gray-700 mb-1">
                Food preferences
              </label>
              <textarea
                id="intake-preferences"
                value={form.preferences}
                onChange={(e) => update("preferences", e.target.value)}
                placeholder="e.g. love chicken and rice, prefer simple meals, no spicy food..."
                rows={3}
                className={inputClass(false, "resize-none")}
              />
            </div>

            <div>
              <label htmlFor="intake-notes" className="block text-sm font-medium text-gray-700 mb-1">
                Anything else we should know?
              </label>
              <textarea
                id="intake-notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="e.g. I eat 4 meals a day, training schedule, specific goals..."
                rows={3}
                className={inputClass(false, "resize-none")}
              />
            </div>
          </section>

          <p className="text-xs text-gray-500">
            We use your weight, calorie target, restrictions and allergies only to
            plan and prepare your meals. Only our team can see them.
          </p>

          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
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
