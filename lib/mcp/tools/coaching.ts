import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { todayLocal, daysSince } from "@/lib/date";
import { isAtRisk, isHabitDueToday } from "@/lib/habits/streaks";
import { findStalledProjectIds } from "@/lib/projects/stalled";
import { looksLikeTopic } from "@/lib/tasks/next-action-shape";
import { isInInbox } from "@/lib/tasks/inbox";
import { reviewStreakWeeks } from "@/lib/reviews/streak";
import { pickResurfacedNote } from "@/lib/knowledge/resurface";
import { ok, fail, type AdminClient } from "@/lib/mcp/shared";

export function registerCoachingTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Coaching context ---

  server.registerTool(
    "get_today_summary",
    {
      title: "Get today's summary",
      description:
        "Everything relevant to coaching Antoine right now: today's check-in, habits due today, tasks scheduled today, overdue tasks, anything Waiting For that's stalled a week or more, and tickler-file notes / Someday tasks whose revisit date has arrived. Use this first for \"what should I focus on today\" style questions.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const today = todayLocal();

      const [checkinRes, habitsRes, tasksRes, ticklerRes] = await Promise.all([
        admin.from("daily_checkins").select("*").eq("user_id", userId).eq("date", today).maybeSingle(),
        admin.from("habits").select("*").eq("user_id", userId).is("deleted_at", null).eq("active", true),
        admin.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null).neq("status", "done"),
        admin
          .from("tickler_items")
          .select("id, note, revisit_date")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .lte("revisit_date", today),
      ]);
      if (checkinRes.error) return fail(checkinRes.error.message);
      if (habitsRes.error) return fail(habitsRes.error.message);
      if (tasksRes.error) return fail(tasksRes.error.message);
      if (ticklerRes.error) return fail(ticklerRes.error.message);

      const habits = habitsRes.data;
      const { data: logs, error: logsError } = await admin
        .from("habit_logs")
        .select("habit_id, logged_date")
        .in(
          "habit_id",
          habits.map((h) => h.id),
        );
      if (logsError) return fail(logsError.message);

      const dueHabits = habits
        .filter((h) => isHabitDueToday(h, today))
        .map((h) => {
          const habitLogs = logs.filter((l) => l.habit_id === h.id);
          return {
            ...h,
            logged_today: habitLogs.some((l) => l.logged_date === today),
            // "Don't break it twice" (James Clear) — already missed once, so
            // missing today too would be a second miss in a row.
            at_risk: isAtRisk(h, habitLogs, today),
          };
        });

      const tasks = tasksRes.data;
      const scheduledToday = tasks.filter((t) => t.scheduled_date === today);
      const overdue = tasks.filter((t) => t.scheduled_date && t.scheduled_date < today);
      // GTD's Waiting For is only useful if it prompts an actual follow-up,
      // not just a passive elapsed-days counter in the UI.
      const staleWaitingFor = tasks.filter(
        (t) => t.waiting_for && t.waiting_since && daysSince(t.waiting_since) >= 7,
      );
      // An explicit follow_up_date is a stronger, deliberate version of the
      // same prompt — "the user asked for this specific nudge today."
      const dueFollowUps = tasks.filter(
        (t) => t.waiting_for && t.follow_up_date && t.follow_up_date <= today,
      );
      // The tickler file's contract: things resurface on their date without
      // being looked for — same buckets the Today view shows.
      const readyToRevisit = tasks.filter(
        (t) => t.someday && t.revisit_date && t.revisit_date <= today,
      );

      return ok({
        date: today,
        checkin: checkinRes.data,
        habits_due_today: dueHabits,
        tasks_scheduled_today: scheduledToday,
        overdue_tasks: overdue,
        stale_waiting_for: staleWaitingFor.map((t) => ({
          id: t.id,
          title: t.title,
          waiting_since: t.waiting_since,
          days_waiting: daysSince(t.waiting_since),
        })),
        due_follow_ups: dueFollowUps.map((t) => ({
          id: t.id,
          title: t.title,
          follow_up_date: t.follow_up_date,
        })),
        tickler_due: ticklerRes.data,
        ready_to_revisit: readyToRevisit.map((t) => ({
          id: t.id,
          title: t.title,
          revisit_date: t.revisit_date,
        })),
        // One Library note a day, resurfaced — deterministic per day, shared
        // with /api/digest so both surfaces tell the same story.
        resurfaced_note: await pickResurfacedNote(admin, userId, today),
      });
    },
  );

  server.registerTool(
    "get_review_snapshot",
    {
      title: "Get Weekly Review snapshot",
      description:
        "The same numbers the app's Weekly Review flow (/weekly-review) steps through, so Claude " +
        "can walk Antoine through a review conversationally: inbox state, next-action list size, " +
        "topic-shaped task titles needing a rewrite, Waiting For follow-ups due, stalled projects, " +
        "projects due for their per-project review cadence, Someday/tickler items ready to " +
        "revisit, per-domain (Areas of Focus) health, and the review streak. Use log_weekly_review " +
        "at the end so a Claude-guided review counts toward the streak like an app-guided one.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const today = todayLocal();
      const [tasksRes, projectsRes, domainsRes, logsRes, ticklerRes] = await Promise.all([
        admin.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null),
        admin.from("projects").select("*").eq("user_id", userId).is("deleted_at", null),
        admin.from("domains").select("id, name, color").eq("user_id", userId).is("deleted_at", null),
        admin
          .from("weekly_review_logs")
          .select("completed_at, stats")
          .eq("user_id", userId)
          .order("completed_at", { ascending: false })
          .limit(104),
        admin
          .from("tickler_items")
          .select("id, note, revisit_date")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .lte("revisit_date", today),
      ]);
      const firstError =
        tasksRes.error ?? projectsRes.error ?? domainsRes.error ?? logsRes.error ?? ticklerRes.error;
      if (firstError) return fail(firstError.message);

      // Post-error-check, all four are present; ?? [] narrows the types.
      const tasks = tasksRes.data ?? [];
      const projects = projectsRes.data ?? [];
      const domainRows = domainsRes.data ?? [];
      const reviewLogRows = logsRes.data ?? [];
      const open = tasks.filter((t) => t.status !== "done");
      const inbox = open.filter((t) => isInInbox(t, today));
      const waiting = open.filter((t) => t.waiting_for);
      const somedayTasks = open.filter((t) => t.someday);
      const activeProjects = projects.filter((p) => p.status === "active");
      const stalledIds = findStalledProjectIds(
        projects,
        open.map((t) => ({ project_id: t.project_id, status: t.status })),
      );

      return ok({
        date: today,
        inbox: {
          count: inbox.length,
          oldest_days: inbox.length
            ? Math.max(...inbox.map((t) => daysSince(t.created_at.slice(0, 10))))
            : null,
        },
        anytime_count: open.filter(
          (t) => t.domain_id && !t.someday && !t.waiting_for && !t.scheduled_date,
        ).length,
        // Titles that read as topics, not physical next actions — candidates
        // for a rewrite during the review. Recurring-series occurrences are
        // collapsed to one entry per series (rename the template, not each
        // occurrence) — same as the app's review step.
        topic_shaped_tasks: (() => {
          const flagged = open.filter(
            (t) => t.domain_id && !t.someday && !t.waiting_for && looksLikeTopic(t.title),
          );
          const seenSeries = new Set<string>();
          const entries: { id: string; title: string; recurring_template_id?: string; occurrences?: number }[] = [];
          for (const t of flagged) {
            if (t.recurring_template_id) {
              if (seenSeries.has(t.recurring_template_id)) continue;
              seenSeries.add(t.recurring_template_id);
              entries.push({
                id: t.id,
                title: t.title,
                recurring_template_id: t.recurring_template_id,
                occurrences: flagged.filter((o) => o.recurring_template_id === t.recurring_template_id).length,
              });
            } else {
              entries.push({ id: t.id, title: t.title });
            }
          }
          return entries;
        })(),
        waiting_for: {
          count: waiting.length,
          due_follow_ups: waiting
            .filter((t) => t.follow_up_date && t.follow_up_date <= today)
            .map((t) => ({ id: t.id, title: t.title, follow_up_date: t.follow_up_date })),
        },
        stalled_projects: activeProjects
          .filter((p) => stalledIds.has(p.id))
          .map((p) => ({ id: p.id, name: p.name })),
        // Per-project review cadence: null cadence = due at every review,
        // but reviewed-today always counts as done (same predicate as the
        // app's /weekly-review step).
        projects_due_for_review: activeProjects
          .filter(
            (p) =>
              !p.last_reviewed_at ||
              daysSince(p.last_reviewed_at.slice(0, 10)) >= (p.review_every_days ?? 1),
          )
          .map((p) => ({
            id: p.id,
            name: p.name,
            review_every_days: p.review_every_days,
            last_reviewed_at: p.last_reviewed_at,
          })),
        someday: {
          count: somedayTasks.length,
          ready_to_revisit: somedayTasks
            .filter((t) => t.revisit_date && t.revisit_date <= today)
            .map((t) => ({ id: t.id, title: t.title, revisit_date: t.revisit_date })),
        },
        tickler_due: ticklerRes.data,
        // Areas of Focus (Horizon 2) health: a domain with no next actions
        // or nothing finished in 14+ days is going cold.
        domain_health: domainRows.map((d) => {
          const nextActions = open.filter(
            (t) => t.domain_id === d.id && !t.someday && !t.waiting_for,
          ).length;
          const doneDates = tasks
            .filter((t) => t.domain_id === d.id && t.status === "done" && t.completed_at)
            .map((t) => (t.completed_at as string).slice(0, 10))
            .sort();
          const lastDone = doneDates.at(-1) ?? null;
          const daysQuiet = lastDone ? daysSince(lastDone) : null;
          return {
            id: d.id,
            name: d.name,
            active_projects: activeProjects.filter((p) => p.domain_id === d.id).length,
            next_actions: nextActions,
            days_since_last_completion: daysQuiet,
            cold: nextActions === 0 || daysQuiet === null || daysQuiet >= 14,
          };
        }),
        review_history: {
          last_review_at: reviewLogRows[0]?.completed_at ?? null,
          streak_weeks: reviewStreakWeeks(
            reviewLogRows.map((l) => l.completed_at),
            today,
          ),
        },
      });
    },
  );

  server.registerTool(
    "log_weekly_review",
    {
      title: "Log a completed Weekly Review",
      description:
        "Record that a Weekly Review was completed (now) so it counts toward the review streak " +
        "and the Today-view nudge resets — the same record the app's /weekly-review flow writes. " +
        "Call this when a Claude-guided review wraps up. Optionally pass stats (e.g. counts from " +
        "get_review_snapshot) to snapshot the system state at review time.",
      inputSchema: {
        stats: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional snapshot of review-time numbers (inbox_count, stalled_count...)"),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ stats }) => {
      const { data, error } = await admin
        .from("weekly_review_logs")
        .insert({ user_id: userId, stats: stats ?? null })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "list_weekly_review_logs",
    {
      title: "List Weekly Review history",
      description:
        "Completed Weekly Reviews, most recent first, with any stats snapshotted at review time — " +
        "the record behind the review streak and cadence nudge.",
      inputSchema: {
        limit: z.number().int().min(1).max(104).optional().describe("Defaults to 104 (two years of weekly reviews)."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const { data, error } = await admin
        .from("weekly_review_logs")
        .select("*")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(limit ?? 104);
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "export_all_data",
    {
      title: "Export all data",
      description:
        "Full JSON export of every user-content table — the same payload as the app's Settings → " +
        "Export (GET /api/export). Large: intended for backup/hand-off, not for answering a question " +
        "about one list (use the specific list_* tools for that). Excludes OAuth token tables and " +
        "attachment file bytes, same as the app.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      // Keep this list in sync with EXPORT_TABLES in app/api/export/route.ts —
      // same drift risk, same rule: new table, both places, one change.
      const tables = [
        "domains",
        "projects",
        "project_templates",
        "project_template_tasks",
        "tasks",
        "task_attachments",
        "recurring_task_templates",
        "habits",
        "habit_logs",
        "daily_checkins",
        "routines",
        "routine_items",
        "checklists",
        "checklist_items",
        "knowledge_folders",
        "knowledge_items",
        "tickler_items",
        "agenda_items",
        "contexts",
        "people",
        "workouts",
        "workout_logs",
        "workout_log_attachments",
        "horizons",
      ] as const;

      const results = await Promise.all(
        tables.map((table) => admin.from(table).select("*").eq("user_id", userId)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) return fail(failed.error.message);

      const data: Record<string, unknown> = { exported_at: new Date().toISOString() };
      tables.forEach((table, i) => {
        data[table] = results[i].data;
      });
      return ok(data);
    },
  );
}
