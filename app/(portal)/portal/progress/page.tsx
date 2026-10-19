import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WeightSection from "@/components/portal/weight-section";
import { portalToday } from "@/lib/portal/today";
import { addDays } from "@/lib/format";

export default async function PortalProgressPage() {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.client_id) redirect("/login");

  const today = await portalToday();
  const [logsRes, clientRes] = await Promise.all([
    supabase
      .from("weight_logs")
      .select("log_date, weight_kg")
      .eq("client_id", profile.client_id)
      .gte("log_date", addDays(today, -365))
      .order("log_date", { ascending: true }),
    supabase.from("clients").select("target_weight_kg").eq("id", profile.client_id).maybeSingle(),
  ]);

  const logs = (logsRes.data ?? []).map((l) => ({ log_date: l.log_date as string, weight_kg: Number(l.weight_kg) }));
  const target = clientRes.data?.target_weight_kg != null ? Number(clientRes.data.target_weight_kg) : null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-gray-900">Your progress</h1>
        <p className="text-sm text-gray-500 mt-0.5">Track your weight and see how far you&apos;ve come.</p>
      </header>

      {/* Stacked sections: FD-10 adds trends and streaks below. */}
      <WeightSection initialLogs={logs} targetWeight={target} today={today} />
    </div>
  );
}
