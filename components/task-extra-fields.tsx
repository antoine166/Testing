"use client";

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
 * Someday/context/estimate/energy — shared by every task create/edit
 * surface (Tasks, Inbox, Today, and the task edit form) so a task's full
 * field set is available wherever it can be created, not just when
 * editing it afterward. Deliberately not used by Quick Capture, which
 * stays minimal on purpose.
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
          className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      )}
      <input
        value={context}
        onChange={(e) => onContextChange(e.target.value)}
        list="task-contexts"
        placeholder="Context (optional) — e.g. Errands, Deep Work"
        className="min-w-40 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <input
        type="number"
        min={1}
        value={estimatedMinutes}
        onChange={(e) => onEstimatedMinutesChange(e.target.value)}
        placeholder="Est. min"
        title="Estimated minutes"
        className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <select
        value={energyLevel}
        onChange={(e) => onEnergyLevelChange(e.target.value as TaskEnergy | "")}
        title="Energy required"
        className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">Energy...</option>
        <option value="low">Low energy</option>
        <option value="medium">Medium energy</option>
        <option value="high">High energy</option>
      </select>
    </div>
  );
}
