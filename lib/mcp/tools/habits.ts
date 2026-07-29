import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { computeStreak, isAtRisk, isHabitDueToday } from "@/lib/habits/streaks";
import { ok, fail, HABIT_FREQUENCIES, type AdminClient, todayHome } from "@/lib/mcp/shared";

export function registerHabitTools(server: McpServer, admin: AdminClient, userId: string) {
  // --- Habits ---

  server.registerTool(
    "list_habits",
    {
      title: "List habits",
      description: "List Antoine's habits with today's logged status and current/longest streaks.",
      inputSchema: { date: z.string().optional().describe("YYYY-MM-DD, defaults to today") },
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => {
      const today = date ?? todayHome();
      const { data: habits, error } = await admin
        .from("habits")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name");
      if (error) return fail(error.message);
      if (habits.length === 0) return ok([]);

      const { data: logs, error: logsError } = await admin
        .from("habit_logs")
        .select("habit_id, logged_date")
        .in(
          "habit_id",
          habits.map((h) => h.id),
        );
      if (logsError) return fail(logsError.message);

      const enriched = habits.map((habit) => {
        const habitLogs = logs.filter((l) => l.habit_id === habit.id);
        const streak = computeStreak(habit, habitLogs, today);
        return {
          ...habit,
          due_today: habit.active && isHabitDueToday(habit, today),
          logged_today: habitLogs.some((l) => l.logged_date === today),
          current_streak: streak.current,
          longest_streak: streak.longest,
          // "Don't break it twice" (James Clear): already missed once and not
          // logged today — missing today too would be a second miss in a row.
          at_risk: isAtRisk(habit, habitLogs, today),
        };
      });
      return ok(enriched);
    },
  );

  server.registerTool(
    "create_habit",
    {
      title: "Create habit",
      description: "Start tracking a new habit for Antoine.",
      inputSchema: {
        name: z.string().min(1),
        frequency: z.enum(HABIT_FREQUENCIES).optional().describe("Defaults to daily"),
        frequency_days: z
          .array(z.number().int().min(0).max(6))
          .optional()
          .describe("Days of week (0=Sunday) — only for frequency: specific_days"),
        target_count: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Times per week — only for frequency: times_per_week"),
        icon: z.string().optional(),
        domain_id: z
          .string()
          .uuid()
          .optional()
          .describe("Habits are colored by their domain in the UI — file it under a domain rather than setting a color directly."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name, frequency, frequency_days, target_count, icon, domain_id }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("habits")
        .insert({
          user_id: userId,
          name: trimmed,
          frequency,
          frequency_days: frequency_days ?? null,
          target_count: target_count ?? null,
          icon,
          domain_id: domain_id ?? null,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_habit",
    {
      title: "Update habit",
      description: "Update an existing habit's name, schedule, or active state.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        frequency: z.enum(HABIT_FREQUENCIES).optional(),
        frequency_days: z.array(z.number().int().min(0).max(6)).nullable().optional(),
        target_count: z.number().int().min(1).nullable().optional(),
        icon: z.string().optional(),
        active: z.boolean().optional(),
        domain_id: z
          .string()
          .uuid()
          .nullable()
          .optional()
          .describe("Habits are colored by their domain in the UI — file it under a domain rather than setting a color directly."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name, ...rest }) => {
      const updates: Record<string, unknown> = { ...rest };
      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) return fail("Name cannot be empty");
        updates.name = trimmed;
      }

      const { data, error } = await admin
        .from("habits")
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
    "delete_habit",
    {
      title: "Delete habit",
      description: "Move a habit (and its log history) to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("habits")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "log_habit",
    {
      title: "Log habit",
      description:
        "Record that Antoine did a habit on a given day (e.g. \"I did my workout\"). Can be " +
        "called more than once for the same day for \"extra credit\" (e.g. two workouts in one " +
        "day) — capped at 7 logs per habit per day.",
      inputSchema: {
        habit_id: z.string().uuid(),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ habit_id, date }) => {
      const loggedDate = date ?? todayHome();
      // The daily cap (7/day) is enforced by a DB trigger
      // (20260715060000_habit_log_daily_cap.sql), whose message is already
      // fit to surface as-is.
      const { data, error } = await admin
        .from("habit_logs")
        .insert({ user_id: userId, habit_id, logged_date: loggedDate })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "unlog_habit",
    {
      title: "Unlog habit",
      description:
        "Undo a habit log entry for a given day. If it was logged more than once that day " +
        "(extra credit), this removes just the most recently added one, not all of them.",
      inputSchema: {
        habit_id: z.string().uuid(),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ habit_id, date }) => {
      const loggedDate = date ?? todayHome();
      const { data: mostRecent, error: findError } = await admin
        .from("habit_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("habit_id", habit_id)
        .eq("logged_date", loggedDate)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (findError) return fail(findError.message);
      if (!mostRecent) return ok({ unlogged: null, date: loggedDate });

      const { error } = await admin.from("habit_logs").delete().eq("id", mostRecent.id);
      if (error) return fail(error.message);
      return ok({ unlogged: habit_id, date: loggedDate });
    },
  );

  server.registerTool(
    "list_habit_logs",
    {
      title: "List habit logs",
      description:
        "Habit log history over a date range (defaults to the last 28 days), oldest first — the raw " +
        "entries behind the streak counters. Multiple entries on one day are extra credit.",
      inputSchema: {
        habit_id: z.string().uuid().optional().describe("Limit to one habit. Omit for all habits."),
        from: z.string().optional().describe("YYYY-MM-DD, defaults to 28 days ago"),
        to: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ habit_id, from, to }) => {
      const toDate = to ?? todayHome();
      const start = from ?? new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      let query = admin
        .from("habit_logs")
        .select("id, habit_id, logged_date, created_at, habits(name)")
        .eq("user_id", userId)
        .gte("logged_date", start)
        .lte("logged_date", toDate);
      if (habit_id) query = query.eq("habit_id", habit_id);
      const { data, error } = await query.order("logged_date");
      if (error) return fail(error.message);
      return ok(data);
    },
  );
}
