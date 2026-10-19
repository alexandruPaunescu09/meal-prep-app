"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2, Scale } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import WeightChart from "@/components/portal/weight-chart";
import { formatDate, formatShortDate } from "@/lib/format";
import { formatKg } from "@/lib/weight";
import { parseWeightInput, weightStats, type WeightPoint } from "@/lib/portal/weight";

interface Props {
  initialLogs: WeightPoint[];
  targetWeight: number | null;
  /** Customer-local today ('YYYY-MM-DD'). */
  today: string;
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatKg(Math.abs(n))}`;

export default function WeightSection({ initialLogs, targetWeight, today }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const [logs, setLogs] = useState<WeightPoint[]>(initialLogs);
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => [...logs].sort((a, b) => a.log_date.localeCompare(b.log_date)), [logs]);
  const stats = useMemo(() => weightStats(logs, targetWeight), [logs, targetWeight]);
  const recent = useMemo(() => [...sorted].reverse().slice(0, 10), [sorted]);
  const editing = date !== today;
  const todayLog = logs.find((l) => l.log_date === today);

  const summary = useMemo(() => {
    if (!stats.latest || !stats.first) return "No weight logged yet.";
    const parts = [
      `Weight chart with ${logs.length} ${logs.length === 1 ? "log" : "logs"}.`,
      `First ${formatKg(stats.first.weight_kg)} kg on ${formatDate(stats.first.log_date)}.`,
      `Latest ${formatKg(stats.latest.weight_kg)} kg on ${formatDate(stats.latest.log_date)}.`,
    ];
    if (targetWeight != null) parts.push(`Goal ${formatKg(targetWeight)} kg.`);
    return parts.join(" ");
  }, [stats, logs.length, targetWeight]);

  function networkMessage(action: string) {
    return `Couldn't ${action}. Weight changes need a connection; check it and try again.`;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseWeightInput(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/portal/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_date: date, weight_kg: parsed.value }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(typeof j.error === "string" && res.status < 500 ? j.error : "Couldn't save your weight. Try again.");
        return;
      }
      setLogs((l) => [...l.filter((x) => x.log_date !== date), { log_date: date, weight_kg: parsed.value }]);
      toast.success(`Saved ${formatKg(parsed.value)} kg for ${date === today ? "today" : formatShortDate(date)}`);
      setText("");
      setDate(today);
    } catch {
      toast.error(networkMessage("save your weight"));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(l: WeightPoint) {
    setDate(l.log_date);
    setText(formatKg(l.weight_kg));
    setError("");
    document.getElementById("weight-input")?.focus();
  }

  function cancelEdit() {
    setDate(today);
    setText("");
    setError("");
  }

  async function remove(l: WeightPoint) {
    const ok = await confirm({
      title: "Delete this weight?",
      message: `${formatKg(l.weight_kg)} kg on ${formatDate(l.log_date)} will be removed.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/portal/weight?log_date=${encodeURIComponent(l.log_date)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        toast.error("Couldn't delete that weight. Try again.");
        return;
      }
      setLogs((all) => all.filter((x) => x.log_date !== l.log_date));
      if (date === l.log_date) cancelEdit();
      toast.success("Weight deleted");
    } catch {
      toast.error(networkMessage("delete that weight"));
    }
  }

  return (
    <section className="bg-white rounded-2xl border p-4 space-y-4" aria-labelledby="weight-heading">
      <div className="flex items-center gap-2">
        <Scale className="w-4 h-4 text-gray-500" aria-hidden="true" />
        <h2 id="weight-heading" className="text-sm font-semibold text-gray-900">
          Weight
        </h2>
      </div>

      <form onSubmit={save} className="space-y-2" noValidate>
        <label htmlFor="weight-input" className="block text-sm text-gray-700">
          {editing ? `Weight on ${formatDate(date)}` : todayLog ? "Update today's weight" : "Today's weight"}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              id="weight-input"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={todayLog && !editing ? formatKg(todayLog.weight_kg) : "72,5"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "weight-error" : undefined}
              className="w-full min-h-[44px] pl-3 pr-10 border rounded-lg text-gray-900 text-base focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 pointer-events-none">kg</span>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-4 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
          >
            {saving ? "Saving…" : editing || todayLog ? "Update" : "Save"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={cancelEdit}
              className="min-h-[44px] px-3 border rounded-lg text-sm text-gray-700"
            >
              Cancel
            </button>
          )}
        </div>
        {error && (
          <p id="weight-error" role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
      </form>

      {logs.length === 0 ? (
        <p className="text-sm text-gray-500">
          Log your weight to start your chart
          {targetWeight != null ? ` toward your ${formatKg(targetWeight)} kg goal` : ""}.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Latest" value={`${formatKg(stats.latest!.weight_kg)} kg`} />
            <Stat
              label="Since first log"
              value={stats.change != null ? `${signed(stats.change)} kg` : "—"}
            />
            <Stat
              label="To goal"
              value={
                stats.toGoal == null
                  ? "No goal set"
                  : Math.abs(stats.toGoal) < 0.05
                    ? "Reached"
                    : `${formatKg(Math.abs(stats.toGoal))} kg ${stats.toGoal > 0 ? "to lose" : "to gain"}`
              }
            />
          </dl>

          <WeightChart logs={sorted} target={targetWeight} summary={summary} />

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recent logs</h3>
            <ul className="divide-y">
              {recent.map((l) => (
                <li key={l.log_date} className="flex items-center gap-2 py-1">
                  <span className="flex-1 text-sm text-gray-700">{formatShortDate(l.log_date)}</span>
                  <span className="text-sm font-medium text-gray-900">{formatKg(l.weight_kg)} kg</span>
                  <IconButton label={`Edit weight for ${formatShortDate(l.log_date)}`} onClick={() => startEdit(l)}>
                    <Pencil size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Delete weight for ${formatShortDate(l.log_date)}`}
                    tone="danger"
                    onClick={() => void remove(l)}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-2 py-2">
      <dt className="text-[11px] text-gray-500">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}
