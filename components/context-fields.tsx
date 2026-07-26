"use client";

import { useContexts } from "@/lib/hooks/use-contexts";
import { TIME_BUCKETS, minutesToBucketValue } from "@/lib/tasks/context-options";

type TaskEnergy = "low" | "medium" | "high";

type Props = {
  context: string;
  onContextChange: (value: string) => void;
  estimatedMinutes: string;
  onEstimatedMinutesChange: (value: string) => void;
  energyLevel: TaskEnergy | "";
  onEnergyLevelChange: (value: TaskEnergy | "") => void;
};

/**
 * The GTD "Context" trio — Time, Energy, Location — as structured dropdowns
 * (see lib/tasks/context-options.ts); Time is stored as minutes in
 * estimated_minutes, the dropdown just picks a bucket. Extracted from
 * TaskExtraFields (which composes it) so recurring-task template forms can
 * offer the trio without the task-only Someday/revisit fields.
 */
export default function ContextFields({
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
    <>
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
    </>
  );
}
