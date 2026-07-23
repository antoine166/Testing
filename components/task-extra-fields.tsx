"use client";

import { useContexts } from "@/lib/hooks/use-contexts";
import { TIME_BUCKETS, minutesToBucketValue } from "@/lib/tasks/context-options";

type TaskEnergy = "low" | "medium" | "high";

type Props = {
  someday: boolean;
  onSomedayChange: (value: boolean) => void;
  revisitDate: string;
  onRevisitDateChange: (value: string) => void;
  context: string;
  onContextChange: (value: string) => void;
  estimatedMinutes: string;
  onEstimatedMinutesChange: (value: string) => void;
  energyLevel: TaskEnergy | "";
  onEnergyLevelChange: (value: TaskEnergy | "") => void;
};

/**
 * Someday/revisit + the GTD "Context" trio — Time, Energy, Location — shared
 * by every task create/edit surface (Tasks, Inbox, Today, and the task edit
 * form) so a task's full field set is available wherever it can be created.
 * The three context dimensions are structured dropdowns (see
 * lib/tasks/context-options.ts); Time is still stored as minutes in
 * estimated_minutes, the dropdown just picks a bucket. Deliberately not used
 * by Quick Capture, which stays minimal on purpose.
 */
export default function TaskExtraFields({
  someday,
  onSomedayChange,
  revisitDate,
  onRevisitDateChange,
  context,
  onContextChange,
  estimatedMinutes,
  onEstimatedMinutesChange,
  energyLevel,
  onEnergyLevelChange,
}: Props) {
  const locations = useContexts();
  // Preserve a legacy/free-text value that isn't in the current list so it
  // still shows as the selected option instead of silently blanking.
  const locationOptions =
    context && !locations.includes(context) ? [context, ...locations] : locations;

  const selectClass =
    "rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-zinc-500">
        <input
          type="checkbox"
          checked={someday}
          onChange={(e) => onSomedayChange(e.target.checked)}
        />
        Someday
      </label>
      {someday && (
        <input
          type="date"
          value={revisitDate}
          onChange={(e) => onRevisitDateChange(e.target.value)}
          title="Revisit date — resurface this for reconsideration on this date (GTD tickler file)"
          className={selectClass}
        />
      )}

      {/* GTD "Context" — the three limiting criteria as dropdowns. */}
      <span className="text-xs font-medium text-zinc-400">Context:</span>
      <select
        value={minutesToBucketValue(estimatedMinutes ? Number(estimatedMinutes) : null)}
        onChange={(e) => onEstimatedMinutesChange(e.target.value)}
        title="Time available / how long it takes"
        className={selectClass}
      >
        <option value="">Time…</option>
        {TIME_BUCKETS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
      <select
        value={energyLevel}
        onChange={(e) => onEnergyLevelChange(e.target.value as TaskEnergy | "")}
        title="Energy required"
        className={selectClass}
      >
        <option value="">Energy…</option>
        <option value="low">Low energy</option>
        <option value="medium">Medium energy</option>
        <option value="high">High energy</option>
      </select>
      <select
        value={context}
        onChange={(e) => onContextChange(e.target.value)}
        title="Location — where / with what you can do it"
        className={selectClass}
      >
        <option value="">Location…</option>
        {locationOptions.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
      </select>
    </div>
  );
}
