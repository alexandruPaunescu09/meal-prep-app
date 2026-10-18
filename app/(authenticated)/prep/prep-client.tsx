"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PrepRule, PrepTask, RegeneratePrepResult } from "@/lib/supabase/types";
import { generatePrepTasks } from "@/lib/calculations/prep";
import { invalidatePrepTasks } from "@/lib/actions/revalidate";
import { RefreshCw, Settings, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import {
  addDays,
  currentWeekStart,
  formatDate,
  formatNumber,
  formatWeekRange,
  mondayOf,
  toLocalISODate,
  WEEKDAYS_LONG,
} from "@/lib/format";

const PREP_TYPE_COLORS: Record<string, string> = {
  wash: "bg-blue-50 text-blue-700",
  peel: "bg-amber-50 text-amber-700",
  chop: "bg-orange-50 text-orange-700",
  slice: "bg-orange-50 text-orange-700",
  dice: "bg-orange-50 text-orange-700",
  marinate: "bg-purple-50 text-purple-700",
  portion: "bg-emerald-50 text-emerald-700",
  thaw: "bg-cyan-50 text-cyan-700",
  soak: "bg-indigo-50 text-indigo-700",
  blanch: "bg-red-50 text-red-700",
};

const TASK_SELECT = "*, ingredient:ingredients(id, name, category, unit)";

interface Props {
  rules: PrepRule[];
}

export default function PrepClient({ rules }: Props) {
  const supabase = createClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [weekStart, setWeekStart] = useState(() => currentWeekStart());
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [planCount, setPlanCount] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());

  // Switching weeks sets loading in the same event, so the effect below only fetches.
  function changeWeek(next: string) {
    setLoading(true);
    setWeekStart(next);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("prep_tasks").select(TASK_SELECT).eq("week_start", weekStart).order("prep_date"),
      supabase.from("meal_plans").select("id").eq("week_start", weekStart),
    ]).then(([tasksRes, plansRes]) => {
      if (cancelled) return;
      if (tasksRes.error) toast.error(`Could not load prep tasks: ${tasksRes.error.message}`);
      if (plansRes.error) toast.error(`Could not load meal plans: ${plansRes.error.message}`);
      setTasks((tasksRes.data as PrepTask[]) ?? []);
      setPlanCount(plansRes.error ? null : (plansRes.data ?? []).length);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  async function reloadTasks() {
    const { data, error } = await supabase
      .from("prep_tasks")
      .select(TASK_SELECT)
      .eq("week_start", weekStart)
      .order("prep_date");
    if (error) {
      toast.error(`Could not reload prep tasks: ${error.message}`);
      return;
    }
    setTasks((data as PrepTask[]) ?? []);
  }

  async function handleGenerate() {
    setGenerating(true);

    const { data: plans, error: plansError } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("week_start", weekStart);
    if (plansError) {
      toast.error(`Could not load meal plans: ${plansError.message}`);
      setGenerating(false);
      return;
    }

    setPlanCount((plans ?? []).length);
    if (!plans || plans.length === 0) {
      toast.info(`No meal plans for ${formatWeekRange(weekStart)}.`);
      setGenerating(false);
      return;
    }

    const planIds = plans.map((p: { id: string }) => p.id);
    const { data: entries, error: entriesError } = await supabase
      .from("meal_plan_entries")
      .select(`
        *,
        recipe:recipes(*, recipe_ingredients(*, ingredient:ingredients(*))),
        ingredient:ingredients(*)
      `)
      .in("meal_plan_id", planIds);
    if (entriesError) {
      toast.error(`Could not load meal plan entries: ${entriesError.message}`);
      setGenerating(false);
      return;
    }

    const drafts = generatePrepTasks(entries ?? [], rules, weekStart);

    const completedNow = tasks.filter((t) => t.completed).length;
    if (completedNow > 0) {
      const ok = await confirm({
        title: "Regenerate prep tasks?",
        message: `${completedNow} ${completedNow === 1 ? "task is" : "tasks are"} already completed. Matching tasks keep their check; tasks that no longer apply are removed.`,
        confirmLabel: "Regenerate",
        tone: "danger",
      });
      if (!ok) {
        setGenerating(false);
        return;
      }
    }

    // One transactional RPC: replaces the week's tasks and carries completed checks over.
    const { data: result, error: rpcError } = await supabase.rpc("regenerate_prep_tasks", {
      p_week_start: weekStart,
      p_tasks: drafts,
    });
    if (rpcError) {
      toast.error(`Could not generate tasks: ${rpcError.message}`);
      setGenerating(false);
      return;
    }

    const summary = result as RegeneratePrepResult;
    let message = `Generated ${summary.inserted} ${summary.inserted === 1 ? "task" : "tasks"} · kept ${summary.preserved_completed} completed`;
    if (summary.dropped_completed > 0) {
      message += ` · removed ${summary.dropped_completed} completed`;
    }
    toast.success(message);
    void invalidatePrepTasks();

    await reloadTasks();
    setGenerating(false);
  }

  async function toggleTask(task: PrepTask) {
    const nextCompleted = !task.completed;
    const update = nextCompleted
      ? { completed: true, completed_at: new Date().toISOString() }
      : { completed: false, completed_at: null };

    // Optimistic update; rolled back below if the write fails.
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...update } : t)));
    setPendingTaskIds((prev) => new Set(prev).add(task.id));

    const { error } = await supabase.from("prep_tasks").update(update).eq("id", task.id);

    setPendingTaskIds((prev) => {
      const next = new Set(prev);
      next.delete(task.id);
      return next;
    });

    if (error) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, completed: task.completed, completed_at: task.completed_at }
            : t
        )
      );
      toast.error(`Could not update "${task.ingredient?.name ?? "task"}": ${error.message}`);
    } else {
      void invalidatePrepTasks();
    }
  }

  const tasksByDay = new Map<string, PrepTask[]>();
  for (const task of tasks) {
    const existing = tasksByDay.get(task.prep_date) ?? [];
    existing.push(task);
    tasksByDay.set(task.prep_date, existing);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayISO = toLocalISODate(new Date());
  const weekLabel = formatWeekRange(weekStart);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="print:hidden flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Prep Schedule</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-white border rounded-lg p-1">
            <IconButton label="Previous week" onClick={() => changeWeek(addDays(weekStart, -7))}>
              <ChevronLeft size={18} />
            </IconButton>
            <span className="min-w-[10rem] px-2 text-center text-sm font-medium text-gray-900" aria-live="polite">
              {weekLabel}
            </span>
            <IconButton label="Next week" onClick={() => changeWeek(addDays(weekStart, 7))}>
              <ChevronRight size={18} />
            </IconButton>
          </div>
          <label className="sr-only" htmlFor="prep-week-picker">Pick a week</label>
          <input
            id="prep-week-picker"
            type="date"
            value={weekStart}
            onChange={(e) => {
              if (e.target.value) changeWeek(mondayOf(e.target.value));
            }}
            className="px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white"
          />
          <button
            onClick={handleGenerate}
            disabled={generating || loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Generating..." : "Generate Tasks"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white border text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <Link
            href="/prep/rules"
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 text-sm"
          >
            <Settings className="w-4 h-4" /> Rules
          </Link>
        </div>
      </div>

      {/* Print-only heading */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold text-black">Prep Schedule · {weekLabel}</h1>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white rounded-xl border">
          {planCount === 0 ? (
            <>
              <p className="text-gray-700 font-medium mb-2">No meal plans for {weekLabel}</p>
              <p className="text-sm text-gray-500 mb-4">
                Prep tasks are built from the meal plans for a week. Create or assign a plan for this week first.
              </p>
              <Link
                href={`/meal-plans?week=${weekStart}`}
                className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
              >
                Go to meal plans
              </Link>
            </>
          ) : (
            <>
              <p className="text-gray-700 font-medium mb-2">No prep tasks for {weekLabel} yet</p>
              <p className="text-sm text-gray-500">
                Click &ldquo;Generate Tasks&rdquo; to build the prep schedule from this week&apos;s meal plans and your prep rules.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 print:grid-cols-7 print:gap-1">
          {weekDays.map((date, idx) => {
            const dayTasks = tasksByDay.get(date) ?? [];
            const completedCount = dayTasks.filter((t) => t.completed).length;
            const isToday = date === todayISO;

            return (
              <section
                key={date}
                aria-label={`${WEEKDAYS_LONG[idx]}, ${formatDate(date)}${isToday ? " (today)" : ""}`}
                className={`bg-white rounded-xl border p-3 min-h-[200px] print:break-inside-avoid print:rounded-none ${
                  isToday ? "ring-2 ring-emerald-500 border-emerald-300" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                  <div>
                    <p className="text-xs font-semibold text-gray-900 flex items-center gap-1.5">
                      {WEEKDAYS_LONG[idx]}
                      {isToday && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded print:hidden">
                          Today
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500">{formatDate(date)}</p>
                  </div>
                  {dayTasks.length > 0 && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      completedCount === dayTasks.length
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {completedCount}/{dayTasks.length} done
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {dayTasks.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No tasks</p>
                  ) : (
                    dayTasks.map((task) => (
                      <label
                        key={task.id}
                        className={`flex items-start gap-3 p-2 min-h-[44px] rounded-lg cursor-pointer hover:bg-gray-100 transition-colors ${
                          task.completed ? "bg-gray-50 opacity-60" : "bg-gray-50"
                        } ${pendingTaskIds.has(task.id) ? "opacity-70" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => toggleTask(task)}
                          className="mt-0.5 h-5 w-5 flex-shrink-0 rounded border-gray-300 accent-emerald-600 focus-visible:outline-2 focus-visible:outline-emerald-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium text-gray-900 ${task.completed ? "line-through" : ""}`}>
                            {task.ingredient?.name ?? "Unknown"}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${PREP_TYPE_COLORS[task.prep_type] ?? "bg-gray-100 text-gray-600"}`}>
                              {task.prep_type}
                            </span>
                            <span className="text-[11px] text-gray-600">
                              {formatNumber(task.quantity, Number.isInteger(task.quantity) ? 0 : 1)}
                              {task.unit}
                            </span>
                          </div>
                          {task.recipe_names.length > 0 && (
                            <p className="text-[11px] text-gray-500 mt-0.5 truncate" title={task.recipe_names.join(", ")}>
                              For: {task.recipe_names.join(", ")}
                            </p>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
