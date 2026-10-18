"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { MealPlan, Client, CloneWeekResult } from "@/lib/supabase/types";
import { invalidateMealPlans } from "@/lib/actions/revalidate";
import {
  Plus,
  Trash2,
  Calendar,
  ShoppingCart,
  ChefHat,
  CopyPlus,
  AlertTriangle,
  X,
} from "lucide-react";
import WeeklyShoppingModal from "@/components/weekly-shopping-modal";
import WeeklyCookingModal from "@/components/weekly-cooking-modal";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { IconButton } from "@/components/ui/icon-button";
import {
  addDays,
  currentWeekStart,
  formatWeekRange,
  isMonday,
  nextWeekStart,
} from "@/lib/format";

type MealPlanWithClient = MealPlan & {
  client: Client | null;
  entries?: { count: number }[] | null;
};

const INPUT =
  "w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm";

function entryCount(p: MealPlanWithClient): number | null {
  const c = p.entries?.[0]?.count;
  return typeof c === "number" ? c : null;
}

export default function MealPlansClient({
  mealPlans,
  clients,
  initialClientId = "",
  initialWeek = "",
  openNew = false,
}: {
  mealPlans: MealPlanWithClient[];
  clients: Client[];
  initialClientId?: string;
  initialWeek?: string;
  openNew?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [showForm, setShowForm] = useState(openNew);
  const [showClone, setShowClone] = useState(false);
  const [showWeekly, setShowWeekly] = useState(false);
  const [showCooking, setShowCooking] = useState(false);
  const [clientFilter, setClientFilter] = useState(initialClientId);
  const [weekFilter, setWeekFilter] = useState(initialWeek);

  const weeks = useMemo(() => {
    const set = new Set<string>();
    for (const p of mealPlans) set.add(p.week_start);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [mealPlans]);

  const filtered = useMemo(
    () =>
      mealPlans.filter(
        (p) =>
          (!clientFilter || p.client_id === clientFilter) &&
          (!weekFilter || p.week_start === weekFilter)
      ),
    [mealPlans, clientFilter, weekFilter]
  );

  const groups = useMemo(() => {
    const cur = currentWeekStart();
    const next = nextWeekStart();
    const map = new Map<string, MealPlanWithClient[]>();
    for (const p of filtered) {
      const arr = map.get(p.week_start) ?? [];
      arr.push(p);
      map.set(p.week_start, arr);
    }
    const keys = Array.from(map.keys());
    const first = [cur, next].filter((k) => map.has(k));
    const rest = keys
      .filter((k) => k !== cur && k !== next)
      .sort((a, b) => b.localeCompare(a));
    return [...first, ...rest].map((week) => ({
      week,
      isCurrent: week === cur,
      isNext: week === next,
      plans: map.get(week)!,
    }));
  }, [filtered]);

  async function handleDelete(plan: MealPlanWithClient) {
    const n = entryCount(plan);
    const ok = await confirm({
      title: `Delete "${plan.name}"?`,
      message:
        n && n > 0
          ? `This plan and its ${n} meal ${n === 1 ? "entry" : "entries"} will be deleted. This cannot be undone.`
          : "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase
      .from("meal_plans")
      .delete()
      .eq("id", plan.id);
    if (error) {
      toast.error(`Could not delete plan: ${error.message}`);
      return;
    }
    toast.success("Plan deleted");
    await invalidateMealPlans();
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meal Plans</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} plan{filtered.length !== 1 ? "s" : ""}
            {filtered.length !== mealPlans.length &&
              ` (of ${mealPlans.length})`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {weeks.length > 0 && (
            <>
              <button
                onClick={() => setShowClone(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
              >
                <CopyPlus className="w-4 h-4" />
                New week from last week
              </button>
              <button
                onClick={() => setShowWeekly(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
              >
                <ShoppingCart className="w-4 h-4" />
                Weekly Shopping
              </button>
              <button
                onClick={() => setShowCooking(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
              >
                <ChefHat className="w-4 h-4" />
                Weekly Cooking
              </button>
            </>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            New Plan
          </button>
        </div>
      </div>

      {mealPlans.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Client
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-gray-900 bg-white text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {weekFilter && (
            <button
              onClick={() => setWeekFilter("")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-50 text-emerald-800 rounded-full hover:bg-emerald-100"
              aria-label="Show all weeks"
            >
              Week {formatWeekRange(weekFilter)}
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {mealPlans.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No meal plans yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Create your first meal plan
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No plans match these filters.</p>
          <button
            onClick={() => {
              setClientFilter("");
              setWeekFilter("");
            }}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.week} aria-label={`Week ${formatWeekRange(g.week)}`}>
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                <Calendar className="w-4 h-4 text-gray-400" />
                {formatWeekRange(g.week)}
                <span className="font-normal text-gray-500">
                  · {g.plans.length} plan{g.plans.length !== 1 ? "s" : ""}
                </span>
                {g.isCurrent && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    This week
                  </span>
                )}
                {g.isNext && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    Next week
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.plans.map((plan) => {
                  const n = entryCount(plan);
                  return (
                    <div
                      key={plan.id}
                      className="relative bg-white rounded-xl border hover:shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-emerald-500"
                    >
                      <Link
                        href={`/meal-plans/${plan.id}`}
                        className="block p-4 pr-12 rounded-xl outline-none"
                      >
                        <h3 className="font-semibold text-gray-900">
                          {plan.name}
                        </h3>
                        {plan.client && (
                          <p className="text-sm text-gray-600 mt-1">
                            {plan.client.name}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {n === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              <AlertTriangle className="w-3 h-3" />
                              Empty
                            </span>
                          ) : n != null ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                              {n} {n === 1 ? "entry" : "entries"}
                            </span>
                          ) : null}
                          <span className="text-xs text-gray-400">
                            Markup {plan.markup_multiplier}×
                          </span>
                        </div>
                      </Link>
                      <div className="absolute top-2 right-2">
                        <IconButton
                          label={`Delete plan ${plan.name}`}
                          tone="danger"
                          onClick={() => handleDelete(plan)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {showForm && (
        <NewPlanForm
          clients={clients}
          defaultClientId={clientFilter || initialClientId}
          onClose={() => setShowForm(false)}
        />
      )}

      {showClone && (
        <CloneWeekModal weeks={weeks} onClose={() => setShowClone(false)} />
      )}

      {showWeekly && (
        <WeeklyShoppingModal
          weeks={weeks}
          onClose={() => setShowWeekly(false)}
        />
      )}

      {showCooking && (
        <WeeklyCookingModal
          weeks={weeks}
          onClose={() => setShowCooking(false)}
        />
      )}
    </div>
  );
}

function CloneWeekModal({
  weeks,
  onClose,
}: {
  weeks: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [source, setSource] = useState(weeks[0] ?? "");
  const [target, setTarget] = useState(weeks[0] ? addDays(weeks[0], 7) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function changeSource(w: string) {
    setSource(w);
    if (w) setTarget(addDays(w, 7));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!source || !target) {
      setError("Choose both weeks.");
      return;
    }
    if (!isMonday(target)) {
      setError("Target week must start on a Monday.");
      return;
    }
    if (source === target) {
      setError("Source and target weeks must be different.");
      return;
    }
    setSaving(true);
    const { data, error: rpcErr } = await supabase.rpc("clone_week", {
      p_source_week: source,
      p_target_week: target,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      setSaving(false);
      return;
    }
    const res = data as CloneWeekResult | null;
    const created = res?.created?.length ?? 0;
    const skipped = res?.skipped ?? 0;
    toast.success(
      `Created ${created} plan${created !== 1 ? "s" : ""}` +
        (skipped > 0
          ? ` · skipped ${skipped} (client already has a plan that week)`
          : "")
    );
    await invalidateMealPlans();
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New week from last week"
      description="Copies every plan from the source week into the target week."
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="clone-week-form"
            disabled={saving}
            className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Copying..." : "Copy plans"}
          </button>
        </>
      }
    >
      <form id="clone-week-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="cw-source" className="block text-sm font-medium text-gray-700 mb-1">
            Copy from
          </label>
          <select
            id="cw-source"
            value={source}
            onChange={(e) => changeSource(e.target.value)}
            className={INPUT}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {formatWeekRange(w)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cw-target" className="block text-sm font-medium text-gray-700 mb-1">
            Copy to (Monday)
          </label>
          <input
            id="cw-target"
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={INPUT}
          />
          {target && isMonday(target) && (
            <p className="text-xs text-gray-500 mt-1">
              {formatWeekRange(target)}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function NewPlanForm({
  clients,
  defaultClientId,
  onClose,
}: {
  clients: Client[];
  defaultClientId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  const [form, setForm] = useState({
    name: "",
    client_id: defaultClientId,
    week_start: nextWeekStart(),
    markup_multiplier: parseFloat(
      process.env.NEXT_PUBLIC_MEAL_PLAN_MARKUP_DEFAULT ?? "2.5"
    ),
  });

  const selectedClient = clients.find((c) => c.id === form.client_id);
  const autoName = form.week_start
    ? `${selectedClient ? `${selectedClient.name} – ` : ""}${formatWeekRange(form.week_start)}`
    : (selectedClient?.name ?? "");
  const name = nameTouched ? form.name : autoName;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { data, error: createErr } = await supabase
      .from("meal_plans")
      .insert({
        name: name.trim(),
        client_id: form.client_id || null,
        week_start: form.week_start,
        markup_multiplier: form.markup_multiplier,
      })
      .select("id")
      .single();

    if (createErr || !data) {
      setError(createErr?.message ?? "Failed to create plan");
      setSaving(false);
      return;
    }

    toast.success("Plan created");
    await invalidateMealPlans();
    router.push(`/meal-plans/${data.id}`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New Meal Plan"
      size="sm"
      dirty={nameTouched}
      initialFocusRef={nameRef}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-plan-form"
            disabled={saving}
            className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Creating..." : "Create Plan"}
          </button>
        </>
      }
    >
      <form id="new-plan-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="np-name" className="block text-sm font-medium text-gray-700 mb-1">
            Plan Name *
          </label>
          <input
            id="np-name"
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => {
              setNameTouched(true);
              setForm({ ...form, name: e.target.value });
            }}
            placeholder="e.g. Mihai – 19–25 Oct 2026"
            className={INPUT}
            required
          />
        </div>
        <div>
          <label htmlFor="np-client" className="block text-sm font-medium text-gray-700 mb-1">
            Client
          </label>
          <select
            id="np-client"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            className={INPUT}
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="np-week" className="block text-sm font-medium text-gray-700 mb-1">
            Week Start (Monday)
          </label>
          <input
            id="np-week"
            type="date"
            value={form.week_start}
            onChange={(e) => setForm({ ...form, week_start: e.target.value })}
            className={INPUT}
          />
          {form.week_start && !isMonday(form.week_start) && (
            <p className="text-xs text-amber-600 mt-1">
              This date is not a Monday.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="np-markup" className="block text-sm font-medium text-gray-700 mb-1">
            Markup Multiplier
          </label>
          <input
            id="np-markup"
            type="number"
            step="0.1"
            min={1}
            value={form.markup_multiplier}
            onChange={(e) =>
              setForm({
                ...form,
                markup_multiplier: parseFloat(e.target.value) || 1,
              })
            }
            className={INPUT}
          />
          <p className="text-xs text-gray-400 mt-1">
            Selling price = ingredient cost × multiplier
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
