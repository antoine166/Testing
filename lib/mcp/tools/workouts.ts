import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { todayLocal } from "@/lib/date";
import { computeWeeklyGoalStreak, countThisWeek, isAtRisk as isWorkoutAtRisk } from "@/lib/workouts/weekly";
import { ok, fail, WORKOUT_LOG_ATTACHMENTS_BUCKET, SIGNED_URL_TTL_SECONDS, type AdminClient } from "@/lib/mcp/shared";

export function registerWorkoutTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Training Log ---

  server.registerTool(
    "list_workouts",
    {
      title: "List workouts",
      description:
        "List Antoine's workout catalog (the named workouts he can log against, e.g. \"GPP Lift\"), " +
        "with this week's progress, streak, and at-risk flag for any with a weekly goal.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data: workouts, error } = await admin
        .from("workouts")
        .select("id, name, icon, weekly_target")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name");
      if (error) return fail(error.message);
      if (workouts.length === 0) return ok([]);

      const { data: logs, error: logsError } = await admin
        .from("workout_logs")
        .select("workout_id, logged_date")
        .in(
          "workout_id",
          workouts.map((w) => w.id),
        );
      if (logsError) return fail(logsError.message);

      const today = todayLocal();
      const enriched = workouts.map((workout) => {
        const workoutLogs = logs.filter((l) => l.workout_id === workout.id);
        if (!workout.weekly_target) {
          return {
            ...workout,
            week_count: null,
            current_streak: null,
            longest_streak: null,
            at_risk: false,
          };
        }
        const weekCount = countThisWeek(workoutLogs, today);
        const streak = computeWeeklyGoalStreak(workoutLogs, today, workout.weekly_target);
        return {
          ...workout,
          week_count: weekCount,
          current_streak: streak.current,
          longest_streak: streak.longest,
          // "Don't break it twice" (James Clear) — same as habits' at_risk.
          at_risk: isWorkoutAtRisk(workoutLogs, today, workout.weekly_target),
        };
      });
      return ok(enriched);
    },
  );

  server.registerTool(
    "create_workout",
    {
      title: "Create workout",
      description: "Add a new named workout to Antoine's training catalog (e.g. \"Leg Day\").",
      inputSchema: {
        name: z.string().min(1),
        icon: z.string().optional(),
        weekly_target: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("How many times per week he's aiming to do this workout. Omit for no goal."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name, icon, weekly_target }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("workouts")
        .insert({ user_id: userId, name: trimmed, icon, weekly_target: weekly_target ?? null })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_workout",
    {
      title: "Update workout",
      description:
        "Rename or update an existing workout in the catalog, including its weekly goal " +
        "(adjust as Antoine's training progresses).",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        icon: z.string().optional(),
        weekly_target: z
          .number()
          .int()
          .min(1)
          .nullable()
          .optional()
          .describe("Times per week he's aiming for. Set to null to clear the goal."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name, icon, weekly_target }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) return fail("Name cannot be empty");
        updates.name = trimmed;
      }
      if (icon !== undefined) updates.icon = icon;
      if (weekly_target !== undefined) updates.weekly_target = weekly_target;

      const { data, error } = await admin
        .from("workouts")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "delete_workout",
    {
      title: "Delete workout",
      description: "Move a workout (and its log history) to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("workouts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "log_workout",
    {
      title: "Log workout",
      description:
        "Record that Antoine did a specific workout from his catalog on a given day. Can be " +
        "called more than once for the same workout+day for a second session (e.g. AM/PM).",
      inputSchema: {
        workout_id: z.string().uuid(),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
        duration_minutes: z.number().int().min(0).optional(),
        notes: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ workout_id, date, duration_minutes, notes }) => {
      const loggedDate = date ?? todayLocal();
      const { data, error } = await admin
        .from("workout_logs")
        .insert({
          user_id: userId,
          workout_id,
          logged_date: loggedDate,
          duration_minutes: duration_minutes ?? null,
          notes: notes ?? null,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "unlog_workout",
    {
      title: "Unlog workout",
      description:
        "Undo a workout log entry for a given day. If it was logged more than once that day, " +
        "this removes just the most recently added one, not all of them.",
      inputSchema: {
        workout_id: z.string().uuid(),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ workout_id, date }) => {
      const loggedDate = date ?? todayLocal();
      const { data: mostRecent, error: findError } = await admin
        .from("workout_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("workout_id", workout_id)
        .eq("logged_date", loggedDate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (findError) return fail(findError.message);
      if (!mostRecent) return ok({ unlogged: null, date: loggedDate });

      const { error } = await admin.from("workout_logs").delete().eq("id", mostRecent.id);
      if (error) return fail(error.message);
      return ok({ unlogged: workout_id, date: loggedDate });
    },
  );

  server.registerTool(
    "list_workout_logs",
    {
      title: "List workout logs",
      description: "List Antoine's training history over a date range, most recent first.",
      inputSchema: {
        from: z.string().optional().describe("YYYY-MM-DD, defaults to 14 days ago"),
        to: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ from, to }) => {
      const toDate = to ?? todayLocal();
      const start = from ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await admin
        .from("workout_logs")
        .select("id, workout_id, logged_date, duration_minutes, notes, workouts(name)")
        .eq("user_id", userId)
        .gte("logged_date", start)
        .lte("logged_date", toDate)
        .order("logged_date", { ascending: false });
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_workout_log",
    {
      title: "Update workout log",
      description:
        "Edit a specific workout log entry's duration or notes, by log id (from list_workout_logs). " +
        "Pass null to clear a field.",
      inputSchema: {
        id: z.string().uuid().describe("The workout log entry id, not the workout id."),
        duration_minutes: z.number().int().min(0).nullable().optional(),
        notes: z.string().nullable().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, duration_minutes, notes }) => {
      const updates: Record<string, unknown> = {};
      if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;
      if (notes !== undefined) updates.notes = notes;
      if (Object.keys(updates).length === 0) return fail("Pass duration_minutes and/or notes to update.");

      const { data, error } = await admin
        .from("workout_logs")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select("id, workout_id, logged_date, duration_minutes, notes, created_at")
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "delete_workout_log",
    {
      title: "Delete workout log",
      description:
        "Delete a specific workout log entry by log id (from list_workout_logs) — for cleaning up a " +
        "wrong-day or duplicate entry. For \"undo today's log\" prefer unlog_workout. Permanent (no trash).",
      inputSchema: {
        id: z.string().uuid().describe("The workout log entry id, not the workout id."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin.from("workout_logs").delete().eq("id", id).eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "list_workout_log_attachments",
    {
      title: "List workout log attachments",
      description:
        "List a workout log entry's image attachments (e.g. gym photos), each with a signed URL " +
        "(valid ~1 hour) for viewing.",
      inputSchema: {
        workout_log_id: z.string().uuid(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ workout_log_id }) => {
      const { data, error } = await admin
        .from("workout_log_attachments")
        .select("*")
        .eq("workout_log_id", workout_log_id)
        .eq("user_id", userId)
        .order("created_at");
      if (error) return fail(error.message);

      const { data: signed } =
        data.length > 0
          ? await admin.storage
              .from(WORKOUT_LOG_ATTACHMENTS_BUCKET)
              .createSignedUrls(
                data.map((a) => a.storage_path),
                SIGNED_URL_TTL_SECONDS,
              )
          : { data: null };
      return ok(data.map((attachment, i) => ({ ...attachment, url: signed?.[i]?.signedUrl ?? null })));
    },
  );

  server.registerTool(
    "delete_workout_log_attachment",
    {
      title: "Delete workout log attachment",
      description:
        "Permanently delete one image attachment from a workout log entry (the file and its record — " +
        "attachments have no trash/recovery). Get the id from list_workout_log_attachments.",
      inputSchema: {
        id: z.string().uuid(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { data: attachment, error: fetchError } = await admin
        .from("workout_log_attachments")
        .select("storage_path")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (fetchError) return fail(fetchError.message);

      const { error: storageError } = await admin.storage
        .from(WORKOUT_LOG_ATTACHMENTS_BUCKET)
        .remove([attachment.storage_path]);
      if (storageError) return fail(storageError.message);

      const { error } = await admin
        .from("workout_log_attachments")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );
}
