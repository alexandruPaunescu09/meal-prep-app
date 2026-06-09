import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Client } from "@/lib/supabase/types";
import { Mail, Phone, Scale, Flame, Apple, Ban, Heart } from "lucide-react";

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

  const adminEmail = process.env.NEXT_PUBLIC_TRAINER_EMAIL ?? null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-gray-900">Your profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Read-only — contact your trainer to change details.</p>
      </header>

      <section className="bg-white rounded-2xl border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Contact</h2>
        <Row icon={<Mail className="w-4 h-4" />} label="Name" value={client.name} />
        <Row icon={<Mail className="w-4 h-4" />} label="Email" value={client.email ?? user.email ?? "—"} />
        {client.phone && <Row icon={<Phone className="w-4 h-4" />} label="Phone" value={client.phone} />}
      </section>

      <section className="bg-white rounded-2xl border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Targets</h2>
        {client.weight_kg != null && (
          <Row icon={<Scale className="w-4 h-4" />} label="Weight" value={`${client.weight_kg} kg`} />
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
      </section>

      <footer className="bg-white rounded-2xl border p-4 text-sm text-gray-600 space-y-2">
        {adminEmail && (
          <p>
            Contact your trainer at{" "}
            <a className="text-emerald-700 font-medium" href={`mailto:${adminEmail}`}>{adminEmail}</a>
          </p>
        )}
        <p className="text-xs text-gray-500">Meal Prep Portal · v1.0</p>
      </footer>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-gray-400 mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 break-words">{value}</p>
      </div>
    </div>
  );
}
