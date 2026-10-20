"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { invalidateClients } from "@/lib/actions/revalidate";
import { useToast } from "@/components/ui/toast";
import WeightChart from "@/components/portal/weight-chart";
import ClientDiaryDaySheet from "@/components/admin/client-diary-day-sheet";
import { portalStatusColor, portalStatusLabel } from "@/lib/portal/status";
import { weightStats, type WeightPoint } from "@/lib/portal/weight";
import { formatDate, formatNumber, formatShortDate } from "@/lib/format";
import { formatKg, formatWeightProgress } from "@/lib/weight";
import type { ClientWithPortalStatus } from "@/lib/supabase/types";
import type { ClientDiaryView, DayView } from "@/lib/data/client-diary-view";

const n0 = (v: number | null | undefined) => (v == null ? "—" : formatNumber(Math.round(v), 0));

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function avgVsTarget(avg: number | null | undefined, target: number | null | undefined, unit: string) {
  if (avg == null) return { value: "—", sub: "No active days" };
  return { value: `${n0(avg)} ${unit}`, sub: target != null ? `target ${n0(target)} ${unit}` : "no target set" };
}

export default function ClientDiaryClient({
  client,
  view,
  weights,
  initialDay,
}: {
  client: ClientWithPortalStatus;
  view: ClientDiaryView;
  weights: WeightPoint[];
  initialDay: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const [busy, setBusy] = useState(false);

  const openDate = initialDay && view.days.some((d) => d.date === initialDay) ? initialDay : null;
  const openDay: DayView | null = view.days.find((d) => d.date === openDate) ?? null;
  function setDay(date: string | null) {
    router.replace(date ? `/clients/${client.id}?day=${date}` : `/clients/${client.id}`, { scroll: false });
  }

  const w = view.windows[windowDays];
  const s = w.summary;
  const adherencePct = s.adherence.total > 0 ? Math.round((s.adherence.eaten / s.adherence.total) * 100) : null;
  const wStats = weightStats(weights, client.target_weight_kg);
  const isPortal = client.portal_status === "active";

  async function applyLatestWeight() {
    if (!client.latest_weight) return;
    setBusy(true);
    const { error } = await supabase.from("clients").update({ weight_kg: client.latest_weight.weight_kg }).eq("id", client.id);
    setBusy(false);
    if (error) {
      toast.error(`Could not update ${client.name}'s weight: ${error.message}`);
      return;
    }
    await invalidateClients();
    toast.success(`${client.name}'s current weight is now ${formatKg(client.latest_weight.weight_kg)} kg`);
    router.refresh();
  }

  const planStat = (d: DayView) => {
    const c = d.diary.counts;
    return `${c.planEaten} eaten · ${c.planSkipped} skipped · ${c.planPending} unmarked`;
  };

  return (
    <div>
      <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-emerald-700">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        All clients
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 break-words">{client.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${portalStatusColor(client.portal_status)}`}>
              Portal: {portalStatusLabel(client.portal_status)}
            </span>
            {client.calorie_target != null && <span>Target {n0(client.calorie_target)} kcal/day</span>}
            {formatWeightProgress(client.weight_kg, client.target_weight_kg) && (
              <span>Weight {formatWeightProgress(client.weight_kg, client.target_weight_kg)}</span>
            )}
          </div>
        </div>
        <div role="group" aria-label="Range" className="inline-flex rounded-lg border bg-white p-0.5 text-sm">
          {([7, 30] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={windowDays === n}
              onClick={() => setWindowDays(n)}
              className={`px-3 py-1.5 rounded-md font-medium ${
                windowDays === n ? "bg-emerald-600 text-white" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Last {n} days
            </button>
          ))}
        </div>
      </div>

      {!isPortal && !view.hasAnyActivity && (
        <div className="mt-6 text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-700 font-medium">
            {client.portal_status === "invited" ? "Invitation sent, no portal account yet." : "This client has no portal account."}
          </p>
          <p className="mt-1 text-sm text-gray-500">The diary fills in once the client signs in and starts logging.</p>
        </div>
      )}

      {(isPortal || view.hasAnyActivity) && (
        <>
          <section className="mt-6" aria-label={`Summary, last ${windowDays} days`}>
            {s.activeDays === 0 ? (
              <p className="bg-white rounded-xl border p-4 text-sm text-gray-600">
                No eaten meals or logged foods in the last {windowDays} days.
              </p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Average kcal / day" {...avgVsTarget(s.average?.calories, s.averageTargets.calories, "kcal")} />
                <Stat label="Average protein" {...avgVsTarget(s.average?.protein, s.averageTargets.protein, "g")} />
                <Stat label="Average carbs" {...avgVsTarget(s.average?.carbs, s.averageTargets.carbs, "g")} />
                <Stat label="Average fat" {...avgVsTarget(s.average?.fat, s.averageTargets.fat, "g")} />
                <Stat
                  label="Plan adherence"
                  value={adherencePct == null ? "—" : `${adherencePct}%`}
                  sub={`${s.adherence.eaten} eaten · ${s.adherence.skipped} skipped · ${s.adherence.unmarked} unmarked`}
                />
                <Stat
                  label="Off-plan kcal"
                  value={s.offPlanKcalShare == null ? "—" : `${Math.round(s.offPlanKcalShare * 100)}%`}
                  sub="of eaten kcal from logged foods"
                />
                <Stat label="Active days" value={`${s.activeDays} of ${s.days}`} />
                <Stat
                  label="Streak"
                  value={`${view.streak.current} ${view.streak.current === 1 ? "day" : "days"}`}
                  sub={`best ${view.streak.best} in the last 30 days`}
                />
              </div>
            )}
          </section>

          <section className="mt-6" aria-labelledby="top-foods-h">
            <h2 id="top-foods-h" className="text-sm font-semibold text-gray-700 mb-2">
              Top off-plan foods
            </h2>
            {w.topFoods.length === 0 ? (
              <p className="bg-white rounded-xl border p-4 text-sm text-gray-600">
                Nothing logged outside the plan in the last {windowDays} days.
              </p>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th scope="col" className="text-left font-medium px-4 py-2">Food</th>
                      <th scope="col" className="text-right font-medium px-3 py-2">Times</th>
                      <th scope="col" className="text-right font-medium px-3 py-2">Total kcal</th>
                      <th scope="col" className="text-right font-medium px-4 py-2 hidden sm:table-cell">Last logged</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {w.topFoods.map((f) => (
                      <tr key={f.key}>
                        <td className="px-4 py-2 text-gray-900 break-words">
                          {f.name}
                          {f.brand && <span className="text-gray-500"> · {f.brand}</span>}
                          {f.kind === "quick" && <span className="text-gray-500"> · quick add</span>}
                        </td>
                        <td className="px-3 py-2 text-right">{f.count}</td>
                        <td className="px-3 py-2 text-right font-medium">{n0(f.calories)}</td>
                        <td className="px-4 py-2 text-right text-gray-600 hidden sm:table-cell">{formatShortDate(f.lastDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-6" aria-labelledby="days-h">
            <h2 id="days-h" className="text-sm font-semibold text-gray-700 mb-2">
              Day by day
            </h2>
            <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th scope="col" className="text-left font-medium px-4 py-2">Date</th>
                    <th scope="col" className="text-right font-medium px-3 py-2">kcal</th>
                    <th scope="col" className="text-right font-medium px-3 py-2">Protein</th>
                    <th scope="col" className="text-right font-medium px-3 py-2">Carbs</th>
                    <th scope="col" className="text-right font-medium px-3 py-2">Fat</th>
                    <th scope="col" className="text-left font-medium px-3 py-2">Plan meals</th>
                    <th scope="col" className="text-right font-medium px-3 py-2">Logged</th>
                    <th scope="col" className="px-3 py-2"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {view.days.map((d) => (
                    <tr key={d.date} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <button type="button" onClick={() => setDay(d.date)} className="font-medium text-emerald-700 hover:underline">
                          {formatShortDate(d.date)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <span className="font-medium">{n0(d.diary.eaten.calories)}</span>
                        <span className="text-gray-500"> / {n0(d.targets.calories)}</span>
                      </td>
                      <td className="px-3 py-2 text-right">{n0(d.diary.eaten.protein)} g</td>
                      <td className="px-3 py-2 text-right">{n0(d.diary.eaten.carbs)} g</td>
                      <td className="px-3 py-2 text-right">{n0(d.diary.eaten.fat)} g</td>
                      <td className="px-3 py-2 text-gray-600">{d.planMeals.length ? planStat(d) : "—"}</td>
                      <td className="px-3 py-2 text-right">{d.diary.counts.logged}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setDay(d.date)}
                          aria-label={`Open ${formatDate(d.date)}`}
                          className="text-gray-400 hover:text-emerald-700"
                        >
                          <ChevronRight className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden space-y-2">
              {view.days.map((d) => (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => setDay(d.date)}
                    className="w-full text-left bg-white rounded-xl border p-3 min-h-[44px]"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-gray-900">{formatShortDate(d.date)}</span>
                      <span className="text-sm">
                        <span className="font-semibold">{n0(d.diary.eaten.calories)}</span>
                        <span className="text-gray-500"> / {n0(d.targets.calories)} kcal</span>
                      </span>
                    </span>
                    <span className="block text-xs text-gray-600 mt-1">
                      P {n0(d.diary.eaten.protein)} · C {n0(d.diary.eaten.carbs)} · F {n0(d.diary.eaten.fat)} g
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {d.planMeals.length ? `${planStat(d)} · ` : ""}
                      {d.diary.counts.logged} logged
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="mt-6 mb-8" aria-labelledby="weight-h">
        <h2 id="weight-h" className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          <Scale className="w-4 h-4" aria-hidden="true" />
          Weight trend
        </h2>
        <div className="bg-white rounded-xl border p-4">
          {weights.length === 0 ? (
            <p className="text-sm text-gray-600">No weight logged yet.</p>
          ) : (
            <>
              <WeightChart
                logs={weights}
                target={client.target_weight_kg}
                summary={`Weight chart with ${weights.length} logs. Latest ${formatKg(wStats.latest!.weight_kg)} kg on ${formatDate(wStats.latest!.log_date)}.`}
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                <span>
                  Latest: <strong className="text-gray-900">{formatKg(wStats.latest!.weight_kg)} kg</strong> on{" "}
                  {formatDate(wStats.latest!.log_date)}
                </span>
                {wStats.change != null && <span>Change since first log: {wStats.change > 0 ? "+" : ""}{formatKg(wStats.change)} kg</span>}
                {client.latest_weight && client.weight_kg !== client.latest_weight.weight_kg && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void applyLatestWeight()}
                    className="text-emerald-700 hover:underline text-sm font-medium disabled:opacity-60"
                  >
                    Use as current weight
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <ClientDiaryDaySheet day={openDay} onClose={() => setDay(null)} />
    </div>
  );
}
