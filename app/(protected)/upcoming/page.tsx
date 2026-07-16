"use client";

import SmartListHeader from "@/components/smart-list-header";
import TaskRow, { type Task } from "@/components/task-row";
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
  } = useTaskList();
  const today = todayLocal();

  const upcomingTasks = tasks.filter(
    (t) => t.scheduled_date && t.scheduled_date > today && t.status !== "done",
  );

  const byDate = new Map<string, Task[]>();
  for (const task of upcomingTasks) {
    const date = task.scheduled_date!;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(task);
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
          {sortedDates.map((date) => (
            <div key={date}>
              <div className="mb-2 flex items-baseline gap-2 border-b border-zinc-200 pb-1 dark:border-zinc-800">
                <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {parseLocalDate(date).getDate()}
                </span>
                <span className="text-sm text-zinc-500">{formatDateHeader(date, today)}</span>
              </div>
              <ul className="space-y-2">
                {byDate.get(date)!.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    domains={domains}
                    projects={projects}
                    onToggleDone={toggleDone}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onConvertToProject={handleConvertToProject}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
