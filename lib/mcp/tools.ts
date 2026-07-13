import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { createAdminClient } from "@/lib/supabase/admin";
import { todayLocal } from "@/lib/date";
import { computeStreak, isHabitDueToday } from "@/lib/habits/streaks";

type AdminClient = ReturnType<typeof createAdminClient>;

const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const;
const HABIT_FREQUENCIES = ["daily", "specific_days", "times_per_week"] as const;

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Builds a fresh McpServer wired to a single Life OS account. One per request — no shared state between calls. */
export function buildMcpServer(admin: AdminClient, userId: string): McpServer {
  const server = new McpServer({ name: "life-os", version: "1.0.0" });

  // --- Domains & projects (read-only context for now — manage these in the app) ---

  server.registerTool(
    "list_domains",
    {
      title: "List domains",
      description: "List Antoine's life domains (the top-level areas tasks and projects are organized under).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("domains")
        .select("id, name, color, icon")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_domain",
    {
      title: "Create domain",
      description: "Create a new top-level life domain (e.g. Health, Finance, Business) for organizing tasks and projects.",
      inputSchema: {
        name: z.string().min(1),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("Hex color, e.g. #3b82f6. Omit to use the app's default."),
        icon: z.string().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name, color, icon }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("domains")
        .insert({ user_id: userId, name: trimmed, color, icon })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_domain",
    {
      title: "Update domain",
      description: "Rename or recolor an existing domain.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional()
          .describe("Hex color, e.g. #3b82f6"),
        icon: z.string().optional(),
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
        .from("domains")
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
    "list_projects",
    {
      title: "List projects",
      description: "List Antoine's projects, optionally scoped to one domain.",
      inputSchema: { domain_id: z.string().uuid().optional().describe("Only return projects in this domain") },
      annotations: { readOnlyHint: true },
    },
    async ({ domain_id }) => {
      let query = admin
        .from("projects")
        .select("id, name, description, domain_id, status, due_date")
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (domain_id) query = query.eq("domain_id", domain_id);
      const { data, error } = await query.order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  // --- Tasks ---

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "List Antoine's tasks. By default excludes completed tasks — pass status: \"done\" to see finished ones.",
      inputSchema: {
        status: z.enum(TASK_STATUSES).optional().describe("Filter by status. Omit to get todo + in_progress only."),
        domain_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
        scheduled_date: z.string().optional().describe("Exact scheduled date, YYYY-MM-DD"),
        scheduled_on_or_before: z
          .string()
          .optional()
          .describe("YYYY-MM-DD — find tasks scheduled on or before this date (e.g. for an overdue query)"),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, domain_id, project_id, scheduled_date, scheduled_on_or_before, limit }) => {
      let query = admin.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null);
      query = status ? query.eq("status", status) : query.neq("status", "done");
      if (domain_id) query = query.eq("domain_id", domain_id);
      if (project_id) query = query.eq("project_id", project_id);
      if (scheduled_date) query = query.eq("scheduled_date", scheduled_date);
      if (scheduled_on_or_before) {
        query = query.lte("scheduled_date", scheduled_on_or_before).not("scheduled_date", "is", null);
      }
      const { data, error } = await query.order("created_at", { ascending: false }).limit(limit ?? 50);
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_task",
    {
      title: "Create task",
      description: "Create a new task for Antoine, e.g. when a conversation implies something he needs to do.",
      inputSchema: {
        title: z.string().min(1),
        notes: z.string().optional(),
        domain_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        scheduled_date: z.string().optional().describe("YYYY-MM-DD"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ title, notes, domain_id, project_id, priority, due_date, scheduled_date }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const { data, error } = await admin
        .from("tasks")
        .insert({
          user_id: userId,
          title: trimmed,
          notes,
          domain_id: domain_id ?? null,
          project_id: project_id ?? null,
          priority,
          due_date,
          scheduled_date,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "Update task",
      description: "Update fields on an existing task, including marking it done/in-progress/todo.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        notes: z.string().optional(),
        domain_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        due_date: z.string().nullable().optional().describe("YYYY-MM-DD or null to clear"),
        scheduled_date: z.string().nullable().optional().describe("YYYY-MM-DD or null to clear"),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, title, ...rest }) => {
      const updates: Record<string, unknown> = { ...rest };
      if (title !== undefined) {
        const trimmed = title.trim();
        if (!trimmed) return fail("Title cannot be empty");
        updates.title = trimmed;
      }

      if (rest.status !== undefined) {
        const { data: existing } = await admin.from("tasks").select("status").eq("id", id).maybeSingle();
        if (existing?.status !== rest.status) {
          updates.completed_at = rest.status === "done" ? new Date().toISOString() : null;
        }
      }

      const { data, error } = await admin
        .from("tasks")
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
    "complete_task",
    {
      title: "Complete task",
      description: "Mark a task done. Shorthand for update_task with status: \"done\".",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id }) => {
      const { data, error } = await admin
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete task",
      description: "Move a task to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

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
      const today = date ?? todayLocal();
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
      description: "Record that Antoine did a habit on a given day (e.g. \"I did my workout\").",
      inputSchema: {
        habit_id: z.string().uuid(),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ habit_id, date }) => {
      const { data, error } = await admin
        .from("habit_logs")
        .insert({ user_id: userId, habit_id, logged_date: date ?? todayLocal() })
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
      description: "Undo a habit log entry for a given day.",
      inputSchema: {
        habit_id: z.string().uuid(),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ habit_id, date }) => {
      const { error } = await admin
        .from("habit_logs")
        .delete()
        .eq("user_id", userId)
        .eq("habit_id", habit_id)
        .eq("logged_date", date ?? todayLocal());
      if (error) return fail(error.message);
      return ok({ unlogged: habit_id, date: date ?? todayLocal() });
    },
  );

  // --- Daily check-in ---

  server.registerTool(
    "get_checkin",
    {
      title: "Get daily check-in",
      description: "Get Antoine's energy/focus check-in for a given day.",
      inputSchema: { date: z.string().optional().describe("YYYY-MM-DD, defaults to today") },
      annotations: { readOnlyHint: true },
    },
    async ({ date }) => {
      const { data, error } = await admin
        .from("daily_checkins")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date ?? todayLocal())
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "save_checkin",
    {
      title: "Save daily check-in",
      description: "Record Antoine's energy and focus level (1-5 each) for a day. One entry per day; re-saving overwrites it.",
      inputSchema: {
        energy_level: z.number().int().min(1).max(5),
        focus_level: z.number().int().min(1).max(5),
        notes: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD, defaults to today"),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ energy_level, focus_level, notes, date }) => {
      const { data, error } = await admin
        .from("daily_checkins")
        .upsert(
          { user_id: userId, date: date ?? todayLocal(), energy_level, focus_level, notes },
          { onConflict: "user_id,date" },
        )
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  // --- Coaching context ---

  server.registerTool(
    "get_today_summary",
    {
      title: "Get today's summary",
      description:
        "Everything relevant to coaching Antoine right now: today's check-in, habits due today, tasks scheduled today, and overdue tasks. Use this first for \"what should I focus on today\" style questions.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const today = todayLocal();

      const [checkinRes, habitsRes, tasksRes] = await Promise.all([
        admin.from("daily_checkins").select("*").eq("user_id", userId).eq("date", today).maybeSingle(),
        admin.from("habits").select("*").eq("user_id", userId).is("deleted_at", null).eq("active", true),
        admin.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null).neq("status", "done"),
      ]);
      if (checkinRes.error) return fail(checkinRes.error.message);
      if (habitsRes.error) return fail(habitsRes.error.message);
      if (tasksRes.error) return fail(tasksRes.error.message);

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
        .map((h) => ({
          ...h,
          logged_today: logs.some((l) => l.habit_id === h.id && l.logged_date === today),
        }));

      const tasks = tasksRes.data;
      const scheduledToday = tasks.filter((t) => t.scheduled_date === today);
      const overdue = tasks.filter((t) => t.scheduled_date && t.scheduled_date < today);

      return ok({
        date: today,
        checkin: checkinRes.data,
        habits_due_today: dueHabits,
        tasks_scheduled_today: scheduledToday,
        overdue_tasks: overdue,
      });
    },
  );

  return server;
}
