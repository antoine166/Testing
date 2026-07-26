"use client";

import ContextFields from "@/components/context-fields";

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
 * The trio itself lives in ContextFields (also used by recurring-task
 * template forms, where Someday doesn't apply). Deliberately not used by
 * Quick Capture, which stays minimal on purpose.
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

      <ContextFields
        context={context}
        onContextChange={onContextChange}
        estimatedMinutes={estimatedMinutes}
        onEstimatedMinutesChange={onEstimatedMinutesChange}
        energyLevel={energyLevel}
        onEnergyLevelChange={onEnergyLevelChange}
      />
    </div>
  );
}
