import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Client } from "@/lib/supabase/types";
import { Mail, Phone, Scale, Flame, Apple, Ban, Heart, User, KeyRound, ChevronRight } from "lucide-react";
import { formatKg } from "@/lib/weight";
import SignOutButton from "./sign-out-button";

export default async function PortalProfilePage() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.client_id) redirect("/login");

  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", profile.client_id)
    .maybeSingle<Client>();

  if (!client) redirect("/login");

  const trainerEmail = process.env.NEXT_PUBLIC_TRAINER_EMAIL ?? null;
  const changeRequestHref = trainerEmail
    ? `mailto:${trainerEmail}?subject=${encodeURIComponent("Profile change request")}`
    : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-gray-900">Your profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Your trainer keeps these details up to date.
        </p>
      </header>

      <section className="bg-white rounded-2xl border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Contact</h2>
        <Row icon={<User className="w-4 h-4" />} label="Name" value={client.name} />
        <Row icon={<Mail className="w-4 h-4" />} label="Email" value={client.email ?? user.email ?? "—"} />
        {client.phone && <Row icon={<Phone className="w-4 h-4" />} label="Phone" value={client.phone} />}
      </section>

      <section className="bg-white rounded-2xl border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Targets</h2>
        {(client.weight_kg != null || client.target_weight_kg != null) && (
          <Row
            icon={<Scale className="w-4 h-4" />}
            label="Weight"
            value={
              client.weight_kg != null
                ? `${formatKg(client.weight_kg)} kg${client.target_weight_kg != null ? ` · goal ${formatKg(client.target_weight_kg)} kg` : ""}`
                : `Goal ${formatKg(client.target_weight_kg as number)} kg`
            }
          />
        )}
        {client.calorie_target != null && (
          <Row icon={<Flame className="w-4 h-4" />} label="Daily calories" value={`${client.calorie_target} kcal`} />
        )}
        {client.preferences && (
          <Row icon={<Heart className="w-4 h-4" />} label="Preferences" value={client.preferences} />
        )}
        {client.restrictions && (
          <Row icon={<Apple className="w-4 h-4" />} label="Restrictions" value={client.restrictions} />
        )}
        {client.allergies && (
          <Row icon={<Ban className="w-4 h-4" />} label="Allergies" value={client.allergies} />
        )}
        <div className="pt-1 text-sm">
          {changeRequestHref ? (
            <a
              className="inline-flex items-center gap-1 min-h-[44px] font-medium text-emerald-700 hover:text-emerald-800"
              href={changeRequestHref}
            >
              Request a change
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : (
            <p className="text-gray-600">To change these details, contact us.</p>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl border p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Account</h2>
        <Link
          href="/portal/set-password"
          className="flex items-center gap-3 min-h-[44px] text-sm font-medium text-gray-900 hover:text-emerald-700"
        >
          <KeyRound className="w-4 h-4 text-gray-400" aria-hidden="true" />
          <span className="flex-1">Change password</span>
          <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
        </Link>
        <div className="pt-2">
          <SignOutButton />
        </div>
      </section>

      <footer className="text-xs text-gray-500 px-1">Meal Prep Portal · v1.0</footer>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-gray-400 mt-0.5" aria-hidden="true">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 break-words">{value}</p>
      </div>
    </div>
  );
}
