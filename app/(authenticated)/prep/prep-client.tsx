"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { PrepRule, PrepTask } from "@/lib/supabase/types";
import { generatePrepTasks } from "@/lib/calculations/prep";
import { RefreshCw, Settings, Check } from "lucide-react";
import Link from "next/link";

const DAYS_LABEL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

function getCurrentMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

interface Props {
  rules: PrepRule[];
}

export default function PrepClient({ rules }: Props) {
  const supabase = createClient();
  const [weekStart, setWeekStart] = useState(getCurrentMonday());
  const [tasks, setTasks] = useState<PrepTask[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("prep_tasks")
      .select("*, ingredient:ingredients(id, name, category, unit)")
      .eq("week_start", weekStart)
      .order("prep_date")
      .then(({ data }) => {
        setTasks((data as PrepTask[]) ?? []);
        setLoading(false);
      });
  }, [weekStart]);

  async function handleGenerate() {
    setGenerating(true);

    const { data: plans } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("week_start", weekStart);

    if (!plans || plans.length === 0) {
      alert("No meal plans found for this week.");
      setGenerating(false);
      return;
    }

    const planIds = plans.map((p: any) => p.id);
    const { data: entries } = await supabase
      .from("meal_plan_entries")
      .select(`
        *,
        recipe:recipes(*, recipe_ingredients(*, ingredient:ingredients(*))),
        ingredient:ingredients(*)
      `)
      .in("meal_plan_id", planIds);

    const drafts = generatePrepTasks(entries ?? [], rules, weekStart);

    await supabase.from("prep_tasks").delete().eq("week_start", weekStart);
    if (drafts.length > 0) {
      await supabase.from("prep_tasks").insert(
        drafts.map((d) => ({ ...d, week_start: weekStart }))
      );
    }

    const { data: newTasks } = await supabase
      .from("prep_tasks")
      .select("*, ingredient:ingredients(id, name, category, unit)")
      .eq("week_start", weekStart)
      .order("prep_date");

    setTasks((newTasks as PrepTask[]) ?? []);
    setGenerating(false);
  }

  async function toggleTask(taskId: string, completed: boolean) {
    const update = completed
      ? { completed: true, completed_at: new Date().toISOString() }
      : { completed: false, completed_at: null };

    await supabase.from("prep_tasks").update(update).eq("id", taskId);
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...update } : t))
    );
  }

  const tasksByDay = new Map<string, PrepTask[]>();
  for (const task of tasks) {
    const existing = tasksByDay.get(task.prep_date) ?? [];
    existing.push(task);
    tasksByDay.set(task.prep_date, existing);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart + "T00:00:00");
    d.setDate(d.getDate() + i);
    return toISODate(d);
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Prep Schedule</h1>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm text-gray-900"
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Generating..." : "Generate Tasks"}
          </button>
          <Link
            href="/prep/rules"
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 text-sm"
          >
            <Settings className="w-4 h-4" /> Rules
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500 mb-2">No prep tasks for this week.</p>
          <p className="text-sm text-gray-400">
            Make sure you have meal plans with week_start = {weekStart} and prep rules configured.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {weekDays.map((date, idx) => {
            const dayTasks = tasksByDay.get(date) ?? [];
            const completedCount = dayTasks.filter((t) => t.completed).length;

            return (
              <div key={date} className="bg-white rounded-xl border p-3 min-h-[200px]">
                <div className="flex items-center justify-between mb-3 pb-2 border-b">
                  <div>
                    <p className="text-xs font-semibold text-gray-900">{DAYS_LABEL[idx]}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(date)}</p>
                  </div>
                  {dayTasks.length > 0 && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      completedCount === dayTasks.length
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {completedCount}/{dayTasks.length}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {dayTasks.length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-4">No tasks</p>
                  ) : (
                    dayTasks.map((task) => (
                      <div
                        key={task.id}
                        className={`flex items-start gap-2 p-2 rounded-lg ${
                          task.completed ? "bg-gray-50 opacity-60" : "bg-gray-50"
                        }`}
                      >
                        <button
                          onClick={() => toggleTask(task.id, !task.completed)}
                          className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                            task.completed
                              ? "bg-emerald-500 border-emerald-500"
                              : "border-gray-300 hover:border-emerald-400"
                          }`}
                        >
                          {task.completed && <Check className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium text-gray-900 ${task.completed ? "line-through" : ""}`}>
                            {task.ingredient?.name ?? "Unknown"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PREP_TYPE_COLORS[task.prep_type] ?? "bg-gray-100 text-gray-600"}`}>
                              {task.prep_type}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {task.quantity % 1 === 0 ? task.quantity : task.quantity.toFixed(1)}{task.unit}
                            </span>
                          </div>
                          {task.recipe_names.length > 0 && (
                            <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                              For: {task.recipe_names.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
