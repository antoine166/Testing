"use client";

import Link from "next/link";
import { useState } from "react";
import { todayLocal, daysSince } from "@/lib/date";
import { isAtRisk, isPendingToday } from "@/lib/habits/streaks";
import { isAtRisk as isWorkoutAtRisk } from "@/lib/workouts/weekly";
import { usePageData } from "@/lib/hooks/use-page-data";
import LevelPicker from "@/components/level-picker";
import HabitRow from "@/components/habit-row";
import TaskRow, { type TaskPriority } from "@/components/task-row";
import { useTaskList } from "@/lib/hooks/use-task-list";
import { useLeaveTransition, withLeaving } from "@/components/leave-transition";
import { isRevisitDue } from "@/lib/tasks/inbox";
import TodayCaptureForm from "@/components/today/capture-form";
import { currentTimeOfDay, useTodayData } from "@/components/today/use-today-data";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export default function TodayDashboard() {
  const today = todayLocal();

  // #137: workouts + this week's logs, only to power the at-risk banner —
  // the Training Log page keeps owning everything else about them.
  const [workouts, setWorkouts] = useState<{ id: string; name: string; weekly_target: number | null }[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<{ workout_id: string; logged_date: string }[]>([]);
  usePageData(
    async (signal) => {
      const [workoutsRes, logsRes] = await Promise.all([
        fetch("/api/workouts", { signal }),
        fetch("/api/workout-logs", { signal }),
      ]);
      if (workoutsRes.ok) setWorkouts(await workoutsRes.json());
      if (logsRes.ok) setWorkoutLogs(await logsRes.json());
    },
    { tables: ["workouts", "workout_logs"] },
  );

  // Tasks/domains/projects + their CRUD come from the shared hook (this
  // component used to carry a hand-rolled copy of those handlers); the
  // dashboard-only data (check-in, habits, routines, tickler, review nudge)
  // stays here.
  const {
    tasks,
    domains,
    projects,
    loading: tasksLoading,
    error: taskError,
    handleUpdate: handleUpdateTask,
    toggleDone: toggleTask,
    handleDelete: handleDeleteTask,
    handleConvertToProject: handleConvertTaskToProject,
    handleConvertToRecurring: handleConvertTaskToRecurring,
    handleConvertToKnowledgeItem: handleConvertTaskToKnowledgeItem,
    loadAll: refreshTasks,
  } = useTaskList();

  const {
    checkin,
    habits,
    logs,
    routines,
    routineItems,
    ticklerItems,
    reviewLogs,
    loading,
    error,
    setError,
    energyLevel,
    setEnergyLevel,
    focusLevel,
    setFocusLevel,
    savingCheckin,
    handleSaveCheckin,
    addHabitLog,
    removeHabitLog,
    toggleHabit,
    handleUpdateHabit,
    handleDeleteHabit,
    handleTicklerConvert,
    handleTicklerSnooze,
  } = useTodayData(today, refreshTasks);

  async function rescheduleAllOverdue(target: string | null) {
    const overdue = tasks.filter(
      (t) => t.scheduled_date && t.scheduled_date < today && t.status !== "done",
    );
    await Promise.all(
      overdue.map((t) =>
        fetch(`/api/tasks/${t.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          // null clears the date entirely — the task drops back to Anytime
          // (still filed, still actionable, just no longer date-claimed).
          body: JSON.stringify({ scheduled_date: target, scheduled_time: null }),
        }),
      ),
    );
    await refreshTasks();
  }

  const todayTasks = [...tasks]
    .filter((t) => t.scheduled_date === today && t.status !== "done")
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  // GTD's hard landscape: a scheduled_time makes this a real appointment,
  // not just a day it's planned for — kept visually separate so "Today"
  // doesn't quietly become a to-do list with dates.
  const appointmentsToday = todayTasks
    .filter((t) => t.scheduled_time)
    .sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""));
  const plannedToday = todayTasks.filter((t) => !t.scheduled_time);
  const overdueTasks = [...tasks]
    .filter((t) => t.scheduled_date && t.scheduled_date < today && t.status !== "done")
    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));

  // #137: the Training Log's at-risk nudge, surfaced where the day gets
  // planned — same quiet-until-it-matters pattern as the review banner
  // (isAtRisk only fires once remaining days == remaining sessions).
  const atRiskWorkouts = workouts.filter((w) => {
    if (!w.weekly_target) return false;
    const wLogs = workoutLogs.filter((l) => l.workout_id === w.id);
    return isWorkoutAtRisk(wLogs, today, w.weekly_target);
  });

  // Leave transitions (#121/#138) for the three plain-mapped task lists —
  // ReorderableTaskList pages get this built in; Today wires it per list.
  // Hooks, so they must sit above the loading early-return.
  const overdueDisplay = withLeaving(overdueTasks, useLeaveTransition(overdueTasks));
  const appointmentsDisplay = withLeaving(appointmentsToday, useLeaveTransition(appointmentsToday));
  const plannedDisplay = withLeaving(plannedToday, useLeaveTransition(plannedToday));

  // Today page only ever shows habits still needing attention — done for
  // today (or, for times_per_week habits, the week's target already hit)
  // drops them from here entirely, though they stay visible on /habits.
  const dueHabits = habits
    .filter((h) => h.active && isPendingToday(h, logs.filter((l) => l.habit_id === h.id), today))
    .sort((a, b) => {
      // At-risk ones ("don't break it twice") surface first.
      const aAtRisk = isAtRisk(a, logs.filter((l) => l.habit_id === a.id), today);
      const bAtRisk = isAtRisk(b, logs.filter((l) => l.habit_id === b.id), today);
      return (bAtRisk ? 1 : 0) - (aAtRisk ? 1 : 0);
    });
  // Hook — must sit above the loading early-return, like the task lists'.
  const dueHabitsDisplay = withLeaving(dueHabits, useLeaveTransition(dueHabits));

  if (loading || tasksLoading) {
    // #141: skeleton placeholders shaped like the check-in card + a few
    // task rows, instead of a bare "Loading..." line. The shimmer lives in
    // globals.css (.skeleton); reduced motion gets the same static grays.
    return (
      <div role="status" aria-label="Loading today" className="space-y-4">
        <div className="skeleton h-28 rounded-lg" />
        <div className="skeleton h-9 rounded-md" />
        <div className="skeleton h-16 rounded-md" />
        <div className="skeleton h-16 rounded-md" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  const dueRoutines = routines.filter(
    (r) => r.active && (r.time_of_day === currentTimeOfDay() || r.time_of_day === "custom"),
  );
  const atRiskCount = dueHabits.filter((h) =>
    isAtRisk(h, logs.filter((l) => l.habit_id === h.id), today),
  ).length;
  // GTD's tickler file: a Someday/Maybe item whose date-specific trigger
  // has arrived should actually surface, not just wait to be noticed. Shares
  // isRevisitDue with the Inbox so this nudge and the Inbox never disagree
  // about which items have come due.
  const readyToRevisitCount = tasks.filter(
    (t) => t.status !== "done" && isRevisitDue(t, today),
  ).length;
  // Evening: once there's still something undecided on today's plate after
  // 7:30pm, offer the Shutdown ritual — the deliberate alternative to
  // letting it rot into Overdue overnight.
  const now = new Date();
  const eveningShutdownNudge =
    now.getHours() * 60 + now.getMinutes() >= 19 * 60 + 30 &&
    tasks.some(
      (t) =>
        t.status !== "done" &&
        !t.someday &&
        !t.waiting_for &&
        t.scheduled_date &&
        t.scheduled_date <= today,
    );

  // The keystone habit gets a nudge, not an alarm: quiet until the review
  // is genuinely overdue (8+ days — a weekly rhythm with a grace day).
  const lastReviewDate = reviewLogs[0]?.completed_at?.slice(0, 10) ?? null;
  const reviewOverdueDays = lastReviewDate ? daysSince(lastReviewDate) : null;
  const reviewNudge =
    reviewOverdueDays === null || reviewOverdueDays >= 8;

  // The tickler file's contract is that its notes *reappear on their date
  // without being looked for* — so due notes render right here, actionable
  // inline, instead of waiting to be noticed on the Someday page.
  const ticklerDue = ticklerItems
    .filter((t) => t.revisit_date <= today)
    .sort((a, b) => a.revisit_date.localeCompare(b.revisit_date));
  // GTD's Waiting For is only useful if it prompts an actual follow-up —
  // an explicit follow_up_date is that active nudge, surfaced the same
  // way the tickler file surfaces a Someday item that's come due.
  const readyToFollowUpCount = tasks.filter(
    (t) => t.waiting_for && t.status !== "done" && t.follow_up_date && t.follow_up_date <= today,
  ).length;

  return (
    <div className="space-y-8">
      {(error || taskError) && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
          {error || taskError}
        </p>
      )}

      {!checkin ? (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            How are you today?
          </h2>
          <div className="flex flex-wrap gap-6">
            <LevelPicker label="Energy" value={energyLevel} onChange={setEnergyLevel} />
            <LevelPicker label="Focus" value={focusLevel} onChange={setFocusLevel} />
          </div>
          <button
            onClick={handleSaveCheckin}
            disabled={savingCheckin}
            className="mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {savingCheckin ? "Saving..." : "Save check-in"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          Checked in today — energy {checkin.energy_level}, focus{" "}
          {checkin.focus_level}.{" "}
          <Link href="/checkin" className="underline">
            Edit
          </Link>
        </p>
      )}

      {readyToRevisitCount > 0 && (
        <Link
          href="/someday"
          className="banner-enter block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          🔔 {readyToRevisitCount} Someday {readyToRevisitCount === 1 ? "item" : "items"} ready to
          revisit →
        </Link>
      )}

      {ticklerDue.length > 0 && (
        <div className="banner-enter rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950">
          <p className="mb-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
            🗂️ Tickler — resurfaced today
          </p>
          <ul className="space-y-1.5">
            {ticklerDue.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-sm text-amber-900 dark:text-amber-200">{item.note}</span>
                <span className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => handleTicklerConvert(item.id)}
                    className="text-xs font-medium text-amber-800 underline hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100"
                  >
                    Make it a task
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTicklerSnooze(item.id)}
                    className="text-xs font-medium text-amber-700 underline hover:text-amber-950 dark:text-amber-400 dark:hover:text-amber-100"
                  >
                    Not yet — next week
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {readyToFollowUpCount > 0 && (
        <Link
          href="/waiting-for"
          className="banner-enter block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          🔔 {readyToFollowUpCount} Waiting For {readyToFollowUpCount === 1 ? "item" : "items"} due
          for a follow-up →
        </Link>
      )}

      {eveningShutdownNudge && (
        <Link
          href="/shutdown"
          className="banner-enter block rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          🌙 Wrap the day — run the Shutdown ritual so nothing drifts →
        </Link>
      )}

      {atRiskWorkouts.length > 0 && (
        <Link
          href="/training-log"
          className="banner-enter block rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
        >
          🏋️{" "}
          {atRiskWorkouts.length === 1
            ? `${atRiskWorkouts[0].name} is running out of days to hit this week's target`
            : `${atRiskWorkouts.length} workouts are running out of days this week`}{" "}
          →
        </Link>
      )}

      {reviewNudge && (
        <Link
          href="/weekly-review"
          className="banner-enter block rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950 dark:text-cyan-300 dark:hover:bg-cyan-900"
        >
          🔭{" "}
          {reviewOverdueDays === null
            ? "You haven't done a Weekly Review yet — half an hour makes the whole system trustworthy"
            : `${reviewOverdueDays} days since your last Weekly Review`}{" "}
          →
        </Link>
      )}

      {dueRoutines.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Routines
          </h2>
          <div className="space-y-3">
            {dueRoutines.map((routine) => (
              <div
                key={routine.id}
                className="rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {routine.name}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {(routineItems[routine.id] ?? []).map((item) => (
                    <li key={item.id} className="text-xs text-zinc-500">
                      {item.title}
                      {item.duration_minutes ? ` (${item.duration_minutes} min)` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {overdueTasks.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">
              Overdue ({overdueTasks.length})
            </h2>
            {/* Bulk triage: an overdue pile invites one-by-one fiddling or,
                worse, learned blindness. One decision for the whole pile
                keeps the list honest. */}
            <span className="flex gap-3 text-xs text-zinc-500">
              <button
                type="button"
                onClick={() => rescheduleAllOverdue(today)}
                className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                All → today
              </button>
              <button
                type="button"
                onClick={() => rescheduleAllOverdue(null)}
                className="underline hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                All → Anytime
              </button>
            </span>
          </div>
          <ul className="space-y-2">
            {overdueDisplay.map(({ item: task, leaving }) => (
              <TaskRow
                key={leaving ? `leaving-${task.id}` : task.id}
                leaving={leaving}
                task={task}
                domains={domains}
                projects={projects}
                onToggleDone={toggleTask}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onConvertToProject={handleConvertTaskToProject}
                onConvertToRecurring={handleConvertTaskToRecurring}
                onConvertToKnowledgeItem={handleConvertTaskToKnowledgeItem}
              />
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Today {todayTasks.length > 0 && `(${todayTasks.length})`}
        </h2>
        <TodayCaptureForm
          today={today}
          domains={domains}
          projects={projects}
          setError={setError}
          refreshTasks={refreshTasks}
        />
        {todayTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing scheduled for today.</p>
        ) : (
          <>
            {appointmentsToday.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Appointments
                </h3>
                <ul className="space-y-2">
                  {appointmentsDisplay.map(({ item: task, leaving }) => (
                    <TaskRow
                      key={leaving ? `leaving-${task.id}` : task.id}
                      leaving={leaving}
                      task={task}
                      domains={domains}
                      projects={projects}
                      onToggleDone={toggleTask}
                      onUpdate={handleUpdateTask}
                      onDelete={handleDeleteTask}
                      onConvertToProject={handleConvertTaskToProject}
                      onConvertToRecurring={handleConvertTaskToRecurring}
                onConvertToKnowledgeItem={handleConvertTaskToKnowledgeItem}
                    />
                  ))}
                </ul>
              </div>
            )}
            {plannedToday.length > 0 && (
              <>
                {appointmentsToday.length > 0 && (
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Planned
                  </h3>
                )}
                <ul className="space-y-2">
                  {plannedDisplay.map(({ item: task, leaving }) => (
                    <TaskRow
                      key={leaving ? `leaving-${task.id}` : task.id}
                      leaving={leaving}
                      task={task}
                      domains={domains}
                      projects={projects}
                      onToggleDone={toggleTask}
                      onUpdate={handleUpdateTask}
                      onDelete={handleDeleteTask}
                      onConvertToProject={handleConvertTaskToProject}
                      onConvertToRecurring={handleConvertTaskToRecurring}
                onConvertToKnowledgeItem={handleConvertTaskToKnowledgeItem}
                    />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <details open className="group">
        <summary className="mb-2 flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          <span className="text-zinc-400 transition-transform group-open:rotate-90">›</span>
          Habits today {dueHabits.length > 0 && `(${dueHabits.length})`}
        </summary>
        {atRiskCount > 0 && (
          <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-500">
            ⚠️ {atRiskCount} at risk of breaking a streak twice in a row — do these first
          </p>
        )}
        {dueHabits.length === 0 ? (
          <p className="text-sm text-zinc-500">No habits due today.</p>
        ) : (
          <ul className="space-y-2">
            {dueHabitsDisplay.map(({ item: habit, leaving }) => (
              <HabitRow
                key={leaving ? `leaving-${habit.id}` : habit.id}
                leaving={leaving}
                habit={habit}
                logs={logs.filter((l) => l.habit_id === habit.id)}
                today={today}
                domains={domains}
                onToggle={toggleHabit}
                onAddLog={addHabitLog}
                onRemoveLog={removeHabitLog}
                onUpdate={handleUpdateHabit}
                onDelete={handleDeleteHabit}
              />
            ))}
          </ul>
        )}
      </details>

      <div className="pt-4 text-center">
        <Link
          href="/tasks"
          className="text-sm font-medium text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-50"
        >
          See all tasks →
        </Link>
      </div>
    </div>
  );
}
