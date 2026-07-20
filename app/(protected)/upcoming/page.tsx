"use client";

import SmartListHeader from "@/components/smart-list-header";
import { type Task } from "@/components/task-row";
import { renderGroupedEntries } from "@/components/recurring-task-group";
import { groupRecurringTasks, type GroupedEntry } from "@/lib/recurring-tasks/group";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { todayLocal } from "@/lib/date";

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateHeader(dateStr: string, today: string): string {
  const tomorrow = new Date(parseLocalDate(today));
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

  const weekday = parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: "long" });
  return dateStr === tomorrowStr ? `Tomorrow` : weekday;
}

/** A group's "date" for header-bucketing purposes is its earliest occurrence's date (groupRecurringTasks always sorts a group's own tasks so index 0 is earliest). */
function entryDate(entry: GroupedEntry<Task>): string {
  return entry.type === "single" ? entry.task.scheduled_date! : entry.tasks[0].scheduled_date!;
}

/** Same representative-task convention as entryDate, for scheduled_time. */
function entryScheduledTime(entry: GroupedEntry<Task>): string | null | undefined {
  return entry.type === "single" ? entry.task.scheduled_time : entry.tasks[0].scheduled_time;
}

export default function UpcomingPage() {
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
  const today = todayLocal();

  const upcomingTasks = tasks.filter(
    (t) => t.scheduled_date && t.scheduled_date > today && t.status !== "done",
  );

  // Grouped once across the whole set (not per-date) so a recurring
  // series' later occurrences collapse into its first one's date header
  // instead of each getting their own separate header entry.
  const groupedEntries = groupRecurringTasks(upcomingTasks);

  const byDate = new Map<string, GroupedEntry<Task>[]>();
  for (const entry of groupedEntries) {
    const date = entryDate(entry);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(entry);
  }
  const sortedDates = [...byDate.keys()].sort();

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:py-10">
      <SmartListHeader icon="📅" color="#ef4444" title="Upcoming" />

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : sortedDates.length === 0 ? (
        <p className="text-sm text-zinc-500">Nothing scheduled ahead.</p>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => {
            const entries = byDate.get(date)!;
            // GTD's hard landscape: an entry with a scheduled_time is a
            // real appointment, not just a day it's planned for — kept
            // visually separate so Upcoming doesn't read as a to-do list
            // with dates.
            const appointments = [...entries]
              .filter((e) => entryScheduledTime(e))
              .sort((a, b) => (entryScheduledTime(a) ?? "").localeCompare(entryScheduledTime(b) ?? ""));
            const planned = entries.filter((e) => !entryScheduledTime(e));
            const commonProps = {
              domains,
              projects,
              onToggleDone: toggleDone,
              onUpdate: handleUpdate,
              onDelete: handleDelete,
              onConvertToProject: handleConvertToProject,
              onConvertToRecurring: handleConvertToRecurring,
              onConvertToKnowledgeItem: handleConvertToKnowledgeItem,
            };

            return (
              <div key={date}>
                <div className="mb-2 flex items-baseline gap-2 border-b border-zinc-200 pb-1 dark:border-zinc-800">
                  <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                    {parseLocalDate(date).getDate()}
                  </span>
                  <span className="text-sm text-zinc-500">{formatDateHeader(date, today)}</span>
                </div>
                {appointments.length > 0 && (
                  <div className="mb-2">
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Appointments
                    </h3>
                    <ul className="space-y-2">{renderGroupedEntries(appointments, commonProps)}</ul>
                  </div>
                )}
                {planned.length > 0 && (
                  <>
                    {appointments.length > 0 && (
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Planned
                      </h3>
                    )}
                    <ul className="space-y-2">{renderGroupedEntries(planned, commonProps)}</ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
