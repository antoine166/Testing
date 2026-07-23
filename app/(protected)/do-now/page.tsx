"use client";

import { useEffect, useState } from "react";
import SmartListHeader from "@/components/smart-list-header";
import { renderGroupedTaskRows } from "@/components/recurring-task-group";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { todayLocal } from "@/lib/date";

// Thresholds aligned to the task form's Time buckets (0–15 / 15–30 / 30–60 /
// 60+): "I have N minutes available" shows every task whose estimate fits.
const TIME_OPTIONS = [
  { label: "Any amount of time", value: "" },
  { label: "15 minutes or less", value: "15" },
  { label: "30 minutes or less", value: "30" },
  { label: "1 hour or less", value: "60" },
];

const ENERGY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };
const ENERGY_OPTIONS = [
  { label: "Any energy level", value: "" },
  { label: "Low energy", value: "low" },
  { label: "Medium energy", value: "medium" },
  { label: "High energy", value: "high" },
];

/**
 * GTD's three Limiting Criteria for choosing an action, from the official
 * GTD Workflow Map: Context, Time Available, Resources (energy) — applied
 * together as one filtering step over the actionable-now inventory
 * (everything not done, not Someday/Maybe, not blocked on someone else,
 * and not scheduled for a future date), not three separate lists.
 */
export default function DoNowPage() {
  const {
    domains,
    projects,
    tasks,
    loading,
    error,
    handleUpdate,
    toggleDone,
    handleDelete,
    handleConvertToProject,
    handleConvertToRecurring,
    handleConvertToKnowledgeItem,
  } = useTaskList();

  const [contextFilter, setContextFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [energyFilter, setEnergyFilter] = useState("");
  // Set when today's check-in pre-selected the energy filter, so the page
  // can say why it's filtered (and offer to clear it). Cleared the moment
  // the filter is touched manually.
  const [autoEnergy, setAutoEnergy] = useState<number | null>(null);

  const today = todayLocal();

  // Close the check-in loop: the morning energy level (1-5) has been
  // "stored for future insights" since Phase 1 — this is the insight. A
  // low-energy day pre-filters Do Now to what's actually doable, instead
  // of showing high-energy work you'll bounce off of.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/checkins?date=${today}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((checkin: { energy_level: number } | null) => {
        if (!checkin || checkin.energy_level > 3) return; // 4-5: no limit needed
        setEnergyFilter(checkin.energy_level <= 2 ? "low" : "medium");
        setAutoEnergy(checkin.energy_level);
      })
      .catch(() => {
        // No check-in / fetch failed — filters just start wide open.
      });
    return () => controller.abort();
  }, [today]);

  const actionableTasks = tasks.filter(
    (t) =>
      t.status !== "done" &&
      !t.someday &&
      !t.waiting_for &&
      (!t.scheduled_date || t.scheduled_date <= today),
  );

  const contexts = [...new Set(actionableTasks.map((t) => t.context).filter((c): c is string => !!c))].sort();
  // If the selected context no longer exists (its last task was completed,
  // reassigned, etc.), fall back to "Any" rather than silently filtering
  // everything out while the <select> shows no matching option.
  const effectiveContextFilter = contexts.includes(contextFilter) ? contextFilter : "";

  const filteredTasks = actionableTasks.filter((t) => {
    if (effectiveContextFilter && t.context !== effectiveContextFilter) return false;
    if (timeFilter && t.estimated_minutes && t.estimated_minutes > Number(timeFilter)) return false;
    if (energyFilter && t.energy_level && ENERGY_RANK[t.energy_level] > ENERGY_RANK[energyFilter]) return false;
    return true;
  });

  const anyFilterActive = effectiveContextFilter || timeFilter || energyFilter;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="🎯" color="#22c55e" title="Do Now" count={filteredTasks.length} />

      <p className="mb-4 text-xs text-zinc-500">
        Pick what you can actually do right now — by where you are, how much time you have, and how
        much energy you&apos;ve got.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={effectiveContextFilter}
          onChange={(e) => setContextFilter(e.target.value)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="">Any location</option>
          {contexts.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {TIME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={energyFilter}
          onChange={(e) => {
            setEnergyFilter(e.target.value);
            setAutoEnergy(null);
          }}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {ENERGY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {autoEnergy !== null && (
        <p className="mb-4 text-xs text-zinc-500">
          🌡️ Pre-filtered to {energyFilter}-energy actions from this morning&apos;s check-in
          (energy {autoEnergy}/5).{" "}
          <button
            type="button"
            onClick={() => {
              setEnergyFilter("");
              setAutoEnergy(null);
            }}
            className="underline"
          >
            Show everything
          </button>
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : filteredTasks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {anyFilterActive
            ? "Nothing fits those criteria right now — try widening one of the filters."
            : "Nothing actionable right now — check Inbox, or enjoy the clear runway."}
        </p>
      ) : (
        <ul className="space-y-2">
          {renderGroupedTaskRows(filteredTasks, {
            domains,
            projects,
            onToggleDone: toggleDone,
            onUpdate: handleUpdate,
            onDelete: handleDelete,
            onConvertToProject: handleConvertToProject,
            onConvertToRecurring: handleConvertToRecurring,
            onConvertToKnowledgeItem: handleConvertToKnowledgeItem,
          })}
        </ul>
      )}
    </div>
  );
}
