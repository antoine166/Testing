import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { createAdminClient } from "@/lib/supabase/admin";
import { todayLocal, daysSince } from "@/lib/date";
import { computeStreak, isAtRisk, isHabitDueToday } from "@/lib/habits/streaks";
import { TRASH_CONFIG, TRASH_TYPES, type TrashType } from "@/lib/trash";
import { topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";

type AdminClient = ReturnType<typeof createAdminClient>;

// Domain restore stays app-only alongside domain deletion — the rest of the
// trash types are safe to recover from here.
const RESTORABLE_TRASH_TYPES = [
  "project",
  "task",
  "habit",
  "routine",
  "checklist",
  "knowledge-item",
] as const satisfies readonly TrashType[];

const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const;
const TASK_ENERGY_LEVELS = ["low", "medium", "high"] as const;
const HABIT_FREQUENCIES = ["daily", "specific_days", "times_per_week"] as const;
const PROJECT_STATUSES = ["active", "someday", "completed", "archived"] as const;
const RECURRENCE_TYPES = ["weekly", "monthly", "interval"] as const;
const TIME_OF_DAY = ["morning", "afternoon", "evening", "custom"] as const;
const KNOWLEDGE_TYPES = ["note", "article", "book", "quote", "resource"] as const;

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
        .select(
          "id, name, description, domain_id, parent_project_id, status, priority, due_date, scheduled_date, link",
        )
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (domain_id) query = query.eq("domain_id", domain_id);
      const { data, error } = await query.order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description:
        "Create a new project. Set parent_project_id to create it as a subproject of an " +
        "existing top-level project instead (e.g. \"Packing\" under \"Move to Atlanta\") — it " +
        "then inherits that project's domain automatically. Subprojects can only be one level deep.",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        purpose: z.string().optional().describe("GTD Natural Planning Model — why this project matters."),
        outcome_vision: z
          .string()
          .optional()
          .describe("GTD Natural Planning Model — what \"done\" looks like."),
        domain_id: z.string().uuid().optional(),
        parent_project_id: z
          .string()
          .uuid()
          .optional()
          .describe("UUID of a top-level project to nest this new project under, if any."),
        status: z.enum(PROJECT_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        scheduled_date: z.string().optional().describe("YYYY-MM-DD"),
        link: z.string().optional().describe("A related URL, e.g. a shared doc or spec."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({
      name,
      description,
      purpose,
      outcome_vision,
      domain_id,
      parent_project_id,
      status,
      priority,
      due_date,
      scheduled_date,
      link,
    }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("projects")
        .insert({
          user_id: userId,
          name: trimmed,
          description,
          purpose,
          outcome_vision,
          domain_id: domain_id ?? null,
          parent_project_id: parent_project_id ?? null,
          status,
          priority,
          due_date,
          scheduled_date,
          link: link && link.trim() ? link.trim() : undefined,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_project",
    {
      title: "Update project",
      description:
        "Update a project's name, description, status, domain, or parent project. Use " +
        "parent_project_id to file it as a subproject of another top-level project; pass null " +
        "to clear it and promote it back to top-level (an empty string is not accepted — it's " +
        "not a valid UUID). Subprojects always take on their parent's domain.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        purpose: z
          .string()
          .optional()
          .describe("GTD Natural Planning Model — why this project matters. Empty string clears it."),
        outcome_vision: z
          .string()
          .optional()
          .describe("GTD Natural Planning Model — what \"done\" looks like. Empty string clears it."),
        domain_id: z.string().uuid().nullable().optional(),
        parent_project_id: z.string().uuid().nullable().optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        due_date: z.string().nullable().optional().describe("YYYY-MM-DD or null to clear"),
        scheduled_date: z.string().nullable().optional().describe("YYYY-MM-DD or null to clear"),
        link: z.string().nullable().optional().describe("Related URL, or null to clear."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name, link, ...rest }) => {
      const updates: Record<string, unknown> = { ...rest };
      if (name !== undefined) {
        const trimmed = name.trim();
        if (!trimmed) return fail("Name cannot be empty");
        updates.name = trimmed;
      }
      if (link !== undefined) {
        updates.link = link && link.trim() ? link.trim() : null;
      }

      const { data, error } = await admin
        .from("projects")
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
    "delete_project",
    {
      title: "Delete project",
      description:
        "Move a project to trash, along with its subprojects (if any) and all of their tasks. " +
        "Recoverable for 30 days from the app's Trash page.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { data: children, error: childrenError } = await admin
        .from("projects")
        .select("id")
        .eq("parent_project_id", id)
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (childrenError) return fail(childrenError.message);

      // Same trash_project() RPC the app and Coach use — it defaults its
      // p_user_id parameter to auth.uid(), which isn't available to this
      // service-role client, so it's passed explicitly here.
      const { error } = await admin.rpc("trash_project", { p_project_id: id, p_user_id: userId });
      if (error) return fail(error.message);

      return ok({ deleted: id, subprojects_deleted: children.map((c) => c.id) });
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
        link: z.string().optional().describe("A single related URL, shown between the title and notes."),
        context: z
          .string()
          .optional()
          .describe("GTD context tag like \"calls\", \"errands\", \"computer\" — free text, no @ prefix."),
        domain_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        scheduled_date: z.string().optional().describe("YYYY-MM-DD"),
        someday: z
          .boolean()
          .optional()
          .describe("Things-style Someday/Maybe: deliberately deferred rather than actioned now."),
        waiting_for: z
          .boolean()
          .optional()
          .describe("GTD Waiting For: delegated/blocked on someone else. Starts the days-waiting clock."),
        estimated_minutes: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("GTD's 'time available' criterion — rough estimate of how long this takes."),
        energy_required: z
          .enum(TASK_ENERGY_LEVELS)
          .optional()
          .describe(
            "GTD's 'resources available' criterion — how much energy this realistically takes. " +
              "Distinct from save_checkin's energy_level, which is Antoine's own daily capacity, not a task property.",
          ),
        revisit_date: z
          .string()
          .optional()
          .describe(
            "GTD tickler file: only meaningful when someday is true. A date (YYYY-MM-DD) this " +
              "Someday/Maybe item should resurface for reconsideration.",
          ),
        follow_up_date: z
          .string()
          .optional()
          .describe(
            "Only meaningful when waiting_for is true. A date (YYYY-MM-DD) to actively prompt a " +
              "follow-up nudge, instead of only tracking passive days-elapsed.",
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({
      title,
      notes,
      link,
      context,
      domain_id,
      project_id,
      priority,
      due_date,
      scheduled_date,
      someday,
      waiting_for,
      estimated_minutes,
      energy_required,
      revisit_date,
      follow_up_date,
    }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const { data, error } = await admin
        .from("tasks")
        .insert({
          user_id: userId,
          title: trimmed,
          notes,
          link: link && link.trim() ? link.trim() : undefined,
          context: context && context.trim() ? context.trim() : undefined,
          domain_id: domain_id ?? null,
          project_id: project_id ?? null,
          priority,
          due_date,
          scheduled_date,
          someday,
          waiting_for,
          waiting_since: waiting_for === true ? todayLocal() : undefined,
          estimated_minutes,
          energy_level: energy_required,
          revisit_date: someday === true ? revisit_date : undefined,
          follow_up_date: waiting_for === true ? follow_up_date : undefined,
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
        link: z.string().nullable().optional().describe("Related URL, or null to clear."),
        context: z
          .string()
          .nullable()
          .optional()
          .describe("GTD context tag (free text, no @ prefix), or null to clear."),
        domain_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        due_date: z.string().nullable().optional().describe("YYYY-MM-DD or null to clear"),
        scheduled_date: z.string().nullable().optional().describe("YYYY-MM-DD or null to clear"),
        someday: z.boolean().optional().describe("Things-style Someday/Maybe flag."),
        waiting_for: z
          .boolean()
          .optional()
          .describe(
            "GTD Waiting For. Turning it on starts the days-waiting clock; turning it off clears it. " +
              "Leaving an already-waiting task waiting doesn't reset the clock.",
          ),
        estimated_minutes: z
          .number()
          .int()
          .min(1)
          .nullable()
          .optional()
          .describe("GTD's 'time available' criterion, or null to clear."),
        energy_required: z
          .enum(TASK_ENERGY_LEVELS)
          .nullable()
          .optional()
          .describe(
            "GTD's 'resources available' criterion, or null to clear. Distinct from save_checkin's " +
              "energy_level, which is Antoine's own daily capacity, not a task property.",
          ),
        revisit_date: z
          .string()
          .nullable()
          .optional()
          .describe("GTD tickler file date (YYYY-MM-DD), or null to clear. Only meaningful when someday is true."),
        follow_up_date: z
          .string()
          .nullable()
          .optional()
          .describe(
            "Date to actively prompt a follow-up nudge, or null to clear. Only meaningful when " +
              "waiting_for is true — automatically cleared if waiting_for is set to false.",
          ),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, title, link, context, waiting_for, energy_required, ...rest }) => {
      const updates: Record<string, unknown> = { ...rest };
      if (title !== undefined) {
        const trimmed = title.trim();
        if (!trimmed) return fail("Title cannot be empty");
        updates.title = trimmed;
      }
      if (link !== undefined) {
        updates.link = link && link.trim() ? link.trim() : null;
      }
      if (context !== undefined) {
        updates.context = context && context.trim() ? context.trim() : null;
      }
      if (energy_required !== undefined) {
        updates.energy_level = energy_required;
      }

      if (rest.status !== undefined) {
        const { data: existing } = await admin.from("tasks").select("status").eq("id", id).maybeSingle();
        if (existing?.status !== rest.status) {
          updates.completed_at = rest.status === "done" ? new Date().toISOString() : null;
        }
      }

      if (waiting_for !== undefined) {
        updates.waiting_for = waiting_for;
        if (waiting_for) {
          // Only start the clock on the false→true transition, matching the
          // app: re-asserting an already-waiting task shouldn't reset it.
          const { data: existing } = await admin
            .from("tasks")
            .select("waiting_for")
            .eq("id", id)
            .maybeSingle();
          if (!existing?.waiting_for) updates.waiting_since = todayLocal();
        } else {
          // Wins over any follow_up_date in the same call (already applied
          // via the ...rest spread above).
          updates.waiting_since = null;
          updates.follow_up_date = null;
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
      description:
        "Move a task to trash. Recoverable for 30 days. If it's a generated occurrence of a " +
        "recurring task, pass scope: \"following\" to also trash every other not-yet-done " +
        "occurrence of the same series scheduled on or after this one, and pause the series so " +
        "nothing regenerates to replace them — otherwise only this single occurrence is deleted " +
        "and the series continues.",
      inputSchema: {
        id: z.string().uuid(),
        scope: z.enum(["single", "following"]).optional().describe("Defaults to single."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id, scope }) => {
      if (scope === "following") {
        const { data: task, error: taskError } = await admin
          .from("tasks")
          .select("recurring_template_id, scheduled_date")
          .eq("id", id)
          .eq("user_id", userId)
          .single();
        if (taskError || !task?.recurring_template_id) {
          return fail("Not part of a recurring series");
        }

        const { error: deleteError } = await admin
          .from("tasks")
          .update({ deleted_at: new Date().toISOString() })
          .eq("recurring_template_id", task.recurring_template_id)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .neq("status", "done")
          .gte("scheduled_date", task.scheduled_date ?? "0000-01-01");
        if (deleteError) return fail(deleteError.message);

        // Reset last_generated_date too — it points at the (now-deleted)
        // last occurrence, so without this, resuming the series later
        // would resume generation after that stale future date instead of
        // from today.
        await admin
          .from("recurring_task_templates")
          .update({ active: false, last_generated_date: null })
          .eq("id", task.recurring_template_id)
          .eq("user_id", userId);

        return ok({ deleted_series_from: id });
      }

      const { error } = await admin
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "convert_task_to_project",
    {
      title: "Convert task to project",
      description:
        "Turn a task into a project when it turns out to need multiple steps, not one action. " +
        "Creates a new project carrying over the task's title, notes, domain, priority, dates, and " +
        "link, then moves the original task to Trash (recoverable for 30 days).",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ id }) => {
      const { data: task, error: taskError } = await admin
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();
      if (taskError || !task) return fail("Task not found");

      const { data: project, error: projectError } = await admin
        .from("projects")
        .insert({
          user_id: userId,
          name: task.title,
          description: task.notes,
          domain_id: task.domain_id,
          priority: task.priority,
          due_date: task.due_date,
          scheduled_date: task.scheduled_date,
          link: task.link,
        })
        .select()
        .single();
      if (projectError) return fail(projectError.message);

      const { error: trashError } = await admin
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (trashError) {
        return fail(
          `Project created but couldn't trash the original task: ${trashError.message}`,
        );
      }

      return ok(project);
    },
  );

  // --- Recurring tasks ---

  server.registerTool(
    "generate_recurring_tasks",
    {
      title: "Generate recurring tasks",
      description:
        "Top up every active recurring task template's pre-generated occurrences back up to its " +
        "horizon. Meant to be called roughly daily (e.g. by a scheduled routine) — safe to call more " +
        "often or skip days, since it's idempotent: a template with no deficit generates nothing, " +
        "and it never generates past its horizon regardless of how long it's been since the last run.",
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async () => {
      const { data: templates, error } = await admin
        .from("recurring_task_templates")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true);
      if (error) return fail(error.message);

      const results = await Promise.all(
        (templates as StoredTemplate[]).map(async (template) => {
          const { generated, error: topUpError } = await topUpTemplate(admin, template);
          return { template_id: template.id, title: template.title, generated, error: topUpError };
        }),
      );

      return ok({
        checked: results.length,
        generated_total: results.reduce((sum, r) => sum + r.generated, 0),
        results,
      });
    },
  );

  server.registerTool(
    "list_recurring_tasks",
    {
      title: "List recurring tasks",
      description:
        "List Antoine's recurring task templates. Each generates ordinary tasks ahead of time " +
        "(bounded by its horizon_count), rather than one being created only after the last is done.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("recurring_task_templates")
        .select("*")
        .eq("user_id", userId)
        .order("created_at");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_recurring_task",
    {
      title: "Create recurring task",
      description:
        "Create a recurring task template (e.g. \"submit the BSL accountability tracker every " +
        "Monday\"). Generates the first batch of occurrences immediately, up to horizon_count.",
      inputSchema: {
        title: z.string().min(1),
        notes: z.string().optional(),
        link: z.string().optional(),
        domain_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        recurrence_type: z.enum(RECURRENCE_TYPES),
        days_of_week: z
          .array(z.number().int().min(0).max(6))
          .min(1)
          .optional()
          .describe("Required for weekly: 0=Sun..6=Sat, one or more days."),
        day_of_month: z
          .number()
          .int()
          .min(1)
          .max(31)
          .optional()
          .describe("Required for monthly: 1-31, clamped to the last day of shorter months."),
        interval_days: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Required for interval: generate every N days, starting today."),
        horizon_count: z
          .number()
          .int()
          .min(1)
          .max(52)
          .optional()
          .describe("How many future occurrences stay generated at once. Defaults to 12."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({
      title,
      notes,
      link,
      domain_id,
      project_id,
      priority,
      recurrence_type,
      days_of_week,
      day_of_month,
      interval_days,
      horizon_count,
    }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      if (recurrence_type === "weekly" && (!days_of_week || days_of_week.length === 0)) {
        return fail("days_of_week is required for a weekly recurrence");
      }
      if (recurrence_type === "monthly" && !day_of_month) {
        return fail("day_of_month is required for a monthly recurrence");
      }
      if (recurrence_type === "interval" && !interval_days) {
        return fail("interval_days is required for an interval recurrence");
      }

      const { data: template, error } = await admin
        .from("recurring_task_templates")
        .insert({
          user_id: userId,
          title: trimmed,
          notes,
          link: link && link.trim() ? link.trim() : undefined,
          domain_id: domain_id ?? null,
          project_id: project_id ?? null,
          priority,
          recurrence_type,
          days_of_week: recurrence_type === "weekly" ? days_of_week : null,
          day_of_month: recurrence_type === "monthly" ? day_of_month : null,
          interval_days: recurrence_type === "interval" ? interval_days : null,
          horizon_count: horizon_count ?? 12,
        })
        .select()
        .single();
      if (error) return fail(error.message);

      const { error: topUpError } = await topUpTemplate(admin, template as StoredTemplate);
      if (topUpError) {
        return fail(`Template created, but generating the first occurrences failed: ${topUpError}`);
      }

      return ok(template);
    },
  );

  server.registerTool(
    "update_recurring_task",
    {
      title: "Update recurring task",
      description:
        "Update a recurring task template's details, pause/resume it (active), or change its " +
        "horizon. Changing the recurrence pattern only affects occurrences generated from now on — " +
        "already-generated tasks are untouched.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        notes: z.string().optional(),
        link: z.string().nullable().optional(),
        domain_id: z.string().uuid().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        active: z.boolean().optional(),
        horizon_count: z.number().int().min(1).max(52).optional(),
        recurrence_type: z.enum(RECURRENCE_TYPES).optional(),
        days_of_week: z.array(z.number().int().min(0).max(6)).min(1).optional(),
        day_of_month: z.number().int().min(1).max(31).optional(),
        interval_days: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, title, link, recurrence_type, days_of_week, day_of_month, interval_days, ...rest }) => {
      const updates: Record<string, unknown> = { ...rest };
      if (title !== undefined) {
        const trimmed = title.trim();
        if (!trimmed) return fail("Title cannot be empty");
        updates.title = trimmed;
      }
      if (link !== undefined) {
        updates.link = link && link.trim() ? link.trim() : null;
      }

      if (recurrence_type !== undefined) {
        updates.recurrence_type = recurrence_type;
        updates.days_of_week = null;
        updates.day_of_month = null;
        updates.interval_days = null;

        if (recurrence_type === "weekly") {
          if (!days_of_week || days_of_week.length === 0) {
            return fail("days_of_week is required when switching to weekly");
          }
          updates.days_of_week = days_of_week;
        } else if (recurrence_type === "monthly") {
          if (!day_of_month) return fail("day_of_month is required when switching to monthly");
          updates.day_of_month = day_of_month;
        } else {
          if (!interval_days) return fail("interval_days is required when switching to interval");
          updates.interval_days = interval_days;
        }
      }

      const { data, error } = await admin
        .from("recurring_task_templates")
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
    "delete_recurring_task",
    {
      title: "Delete recurring task",
      description:
        "Permanently delete a recurring task template. Stops future generation; already-generated " +
        "tasks stay as ordinary tasks. Not in the Trash system, so this can't be undone — pausing " +
        "(update_recurring_task with active: false) is reversible if that's what's actually wanted.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("recurring_task_templates")
        .delete()
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
      const loggedDate = date ?? todayLocal();
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
      const loggedDate = date ?? todayLocal();
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

  // --- Routines ---

  server.registerTool(
    "list_routines",
    {
      title: "List routines",
      description: "List Antoine's routines (ordered sequences of steps tied to a time of day).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("routines")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "list_routine_items",
    {
      title: "List routine steps",
      description: "List the ordered steps of a routine.",
      inputSchema: { routine_id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ routine_id }) => {
      const { data, error } = await admin
        .from("routine_items")
        .select("*")
        .eq("routine_id", routine_id)
        .eq("user_id", userId)
        .order("sort_order");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_routine",
    {
      title: "Create routine",
      description: "Create a new routine — an ordered sequence of steps tied to a time of day.",
      inputSchema: {
        name: z.string().min(1),
        time_of_day: z.enum(TIME_OF_DAY).optional().describe("Defaults to morning"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name, time_of_day }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("routines")
        .insert({ user_id: userId, name: trimmed, time_of_day })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update routine",
      description: "Rename a routine, change its time of day, or pause it (active: false).",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        time_of_day: z.enum(TIME_OF_DAY).optional(),
        active: z.boolean().optional(),
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
        .from("routines")
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
    "delete_routine",
    {
      title: "Delete routine",
      description: "Move a routine (and its steps) to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("routines")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "add_routine_item",
    {
      title: "Add routine step",
      description: "Append a new step to the end of a routine.",
      inputSchema: {
        routine_id: z.string().uuid(),
        title: z.string().min(1),
        duration_minutes: z.number().int().min(1).optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ routine_id, title, duration_minutes }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const { data: last, error: lastError } = await admin
        .from("routine_items")
        .select("sort_order")
        .eq("routine_id", routine_id)
        .eq("user_id", userId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) return fail(lastError.message);

      const { data, error } = await admin
        .from("routine_items")
        .insert({
          user_id: userId,
          routine_id,
          title: trimmed,
          duration_minutes: duration_minutes ?? null,
          sort_order: last ? last.sort_order + 1 : 0,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_routine_item",
    {
      title: "Update routine step",
      description: "Update a routine step's title, duration, or sort order.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        duration_minutes: z.number().int().min(1).nullable().optional(),
        sort_order: z.number().int().optional(),
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

      const { data, error } = await admin
        .from("routine_items")
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
    "delete_routine_item",
    {
      title: "Delete routine step",
      description: "Remove a single step from a routine. Not recoverable — routine steps aren't trashed individually.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin.from("routine_items").delete().eq("id", id).eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  // --- Checklists ---

  server.registerTool(
    "list_checklists",
    {
      title: "List checklists",
      description: "List Antoine's reusable, resettable checklists (e.g. a packing list).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("checklists")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "list_checklist_items",
    {
      title: "List checklist items",
      description: "List the items on a checklist, in order, with their checked state.",
      inputSchema: { checklist_id: z.string().uuid() },
      annotations: { readOnlyHint: true },
    },
    async ({ checklist_id }) => {
      const { data, error } = await admin
        .from("checklist_items")
        .select("*")
        .eq("checklist_id", checklist_id)
        .eq("user_id", userId)
        .order("sort_order");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_checklist",
    {
      title: "Create checklist",
      description: "Create a new empty checklist.",
      inputSchema: { name: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("checklists")
        .insert({ user_id: userId, name: trimmed })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_checklist",
    {
      title: "Rename checklist",
      description: "Rename a checklist.",
      inputSchema: { id: z.string().uuid(), name: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name cannot be empty");

      const { data, error } = await admin
        .from("checklists")
        .update({ name: trimmed })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "delete_checklist",
    {
      title: "Delete checklist",
      description: "Move a checklist (and its items) to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("checklists")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "reset_checklist",
    {
      title: "Reset checklist",
      description: "Uncheck every item on a checklist in one action, so it's ready to reuse.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("checklist_items")
        .update({ checked: false })
        .eq("checklist_id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ reset: id });
    },
  );

  server.registerTool(
    "add_checklist_item",
    {
      title: "Add checklist item",
      description: "Append a new item to the end of a checklist.",
      inputSchema: { checklist_id: z.string().uuid(), title: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ checklist_id, title }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const { data: last, error: lastError } = await admin
        .from("checklist_items")
        .select("sort_order")
        .eq("checklist_id", checklist_id)
        .eq("user_id", userId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) return fail(lastError.message);

      const { data, error } = await admin
        .from("checklist_items")
        .insert({
          user_id: userId,
          checklist_id,
          title: trimmed,
          sort_order: last ? last.sort_order + 1 : 0,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_checklist_item",
    {
      title: "Update checklist item",
      description: "Check/uncheck a checklist item, rename it, or change its order.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        checked: z.boolean().optional(),
        sort_order: z.number().int().optional(),
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

      const { data, error } = await admin
        .from("checklist_items")
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
    "delete_checklist_item",
    {
      title: "Delete checklist item",
      description: "Remove a single item from a checklist. Not recoverable — items aren't trashed individually.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin.from("checklist_items").delete().eq("id", id).eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  // --- Knowledge library ---

  server.registerTool(
    "list_knowledge_items",
    {
      title: "List knowledge library items",
      description: "List Antoine's saved notes, articles, books, quotes, and resources.",
      inputSchema: {
        type: z.enum(KNOWLEDGE_TYPES).optional(),
        folder_id: z.string().uuid().optional(),
        tag: z.string().optional().describe("Only return items with this tag"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ type, folder_id, tag }) => {
      let query = admin.from("knowledge_items").select("*").eq("user_id", userId).is("deleted_at", null);
      if (type) query = query.eq("type", type);
      if (folder_id) query = query.eq("folder_id", folder_id);
      if (tag) query = query.contains("tags", [tag]);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_knowledge_item",
    {
      title: "Create knowledge library item",
      description: "Save a new note, article, book, quote, or resource to Antoine's knowledge library.",
      inputSchema: {
        title: z.string().min(1),
        content: z.string().optional(),
        url: z.string().optional(),
        type: z.enum(KNOWLEDGE_TYPES).optional().describe("Defaults to note"),
        tags: z.array(z.string()).optional(),
        folder_id: z.string().uuid().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ title, content, url, type, tags, folder_id }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const { data, error } = await admin
        .from("knowledge_items")
        .insert({
          user_id: userId,
          title: trimmed,
          content,
          url,
          type,
          tags: tags ?? null,
          folder_id: folder_id ?? null,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_knowledge_item",
    {
      title: "Update knowledge library item",
      description: "Update an existing knowledge library item.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        content: z.string().optional(),
        url: z.string().nullable().optional(),
        type: z.enum(KNOWLEDGE_TYPES).optional(),
        tags: z.array(z.string()).nullable().optional(),
        folder_id: z.string().uuid().nullable().optional(),
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

      const { data, error } = await admin
        .from("knowledge_items")
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
    "delete_knowledge_item",
    {
      title: "Delete knowledge library item",
      description: "Move a knowledge library item to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("knowledge_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "list_knowledge_folders",
    {
      title: "List knowledge library folders",
      description: "List Antoine's knowledge library folders (nested, like folders on a computer).",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("knowledge_folders")
        .select("*")
        .eq("user_id", userId)
        .order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_knowledge_folder",
    {
      title: "Create knowledge library folder",
      description: "Create a new knowledge library folder, optionally nested inside another.",
      inputSchema: {
        name: z.string().min(1),
        parent_id: z.string().uuid().optional().describe("UUID of a parent folder, for nesting"),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name, parent_id }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("knowledge_folders")
        .insert({ user_id: userId, name: trimmed, parent_id: parent_id ?? null })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_knowledge_folder",
    {
      title: "Rename or move knowledge library folder",
      description:
        "Rename a knowledge library folder or move it under a different parent. Folder deletion " +
        "isn't exposed here — it's a permanent, non-recoverable action, so that stays app-only.",
      inputSchema: {
        id: z.string().uuid(),
        name: z.string().min(1).optional(),
        parent_id: z.string().uuid().nullable().optional(),
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
        .from("knowledge_folders")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  // --- Agendas (GTD "bring up with a person next time") ---

  server.registerTool(
    "list_agenda_items",
    {
      title: "List agenda items",
      description:
        "List Antoine's GTD agenda items — things to bring up with a specific person next time he " +
        "talks to them. Each has a person_name, a note, and a done flag.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("agenda_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_agenda_item",
    {
      title: "Create agenda item",
      description:
        "Add something to bring up with a specific person next time Antoine talks to them " +
        "(e.g. \"ask Sarah about the Q3 budget\").",
      inputSchema: {
        person_name: z.string().min(1).describe("Who to bring this up with — free text, not a contact record."),
        note: z.string().min(1).describe("What to bring up."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ person_name, note }) => {
      const trimmedName = person_name.trim();
      const trimmedNote = note.trim();
      if (!trimmedName || !trimmedNote) return fail("person_name and note are required");

      const { data, error } = await admin
        .from("agenda_items")
        .insert({ user_id: userId, person_name: trimmedName, note: trimmedNote })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_agenda_item",
    {
      title: "Update agenda item",
      description:
        "Update an agenda item's person, note, or done state (e.g. mark it done once it's been discussed).",
      inputSchema: {
        id: z.string().uuid(),
        person_name: z.string().min(1).optional(),
        note: z.string().min(1).optional(),
        done: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, person_name, note, done }) => {
      const updates: Record<string, unknown> = {};
      if (person_name !== undefined) {
        const trimmed = person_name.trim();
        if (!trimmed) return fail("person_name cannot be empty");
        updates.person_name = trimmed;
      }
      if (note !== undefined) {
        const trimmed = note.trim();
        if (!trimmed) return fail("note cannot be empty");
        updates.note = trimmed;
      }
      if (done !== undefined) updates.done = done;

      const { data, error } = await admin
        .from("agenda_items")
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
    "delete_agenda_item",
    {
      title: "Delete agenda item",
      description:
        "Permanently delete an agenda item. Unlike tasks/projects these aren't in the Trash system, " +
        "so this can't be undone.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("agenda_items")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  // --- Horizons (GTD levels 3-5: Goals, Vision, Purpose) ---

  server.registerTool(
    "get_horizons",
    {
      title: "Get horizons",
      description:
        "Antoine's GTD higher horizons — goals & objectives (1-2 yr), vision (3-5 yr), and purpose & " +
        "principles. Useful context for coaching and weekly/quarterly reviews. Returns empty strings if unset.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("horizons")
        .select("goals, vision, purpose, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data ?? { goals: "", vision: "", purpose: "" });
    },
  );

  server.registerTool(
    "update_horizons",
    {
      title: "Update horizons",
      description:
        "Update Antoine's goals, vision, and/or purpose. Only the fields you pass are changed — omitted " +
        "fields keep their current value, so updating just the vision won't wipe the goals.",
      inputSchema: {
        goals: z.string().optional().describe("Goals & objectives, roughly a 1-2 year horizon."),
        vision: z.string().optional().describe("Vision, roughly a 3-5 year horizon."),
        purpose: z.string().optional().describe("Purpose & principles — the highest, why-it-all-matters level."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ goals, vision, purpose }) => {
      if (goals === undefined && vision === undefined && purpose === undefined) {
        return fail("Pass at least one of goals, vision, or purpose to update.");
      }

      // Merge onto the existing row so a partial update doesn't blank the
      // other fields (the horizons table is a single row per user).
      const { data: existing, error: readError } = await admin
        .from("horizons")
        .select("goals, vision, purpose")
        .eq("user_id", userId)
        .maybeSingle();
      if (readError) return fail(readError.message);

      const { data, error } = await admin
        .from("horizons")
        .upsert({
          user_id: userId,
          goals: goals ?? existing?.goals ?? "",
          vision: vision ?? existing?.vision ?? "",
          purpose: purpose ?? existing?.purpose ?? "",
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  // --- Trash (soft-delete recovery) ---

  server.registerTool(
    "list_trash",
    {
      title: "List trash",
      description:
        "List items currently in the Trash — soft-deleted and recoverable for 30 days. Use this to " +
        "find something to restore. Trashed domains appear here for reference, but restoring a domain " +
        "(and permanently purging anything) stays app-only.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const results = await Promise.all(
        TRASH_TYPES.map((type) => {
          const { table, nameField } = TRASH_CONFIG[type];
          return admin
            .from(table)
            .select(`id, ${nameField}, deleted_at`)
            .eq("user_id", userId)
            .not("deleted_at", "is", null);
        }),
      );

      const items: { id: string; type: TrashType; name: string; deleted_at: string }[] = [];
      results.forEach((res, i) => {
        const type = TRASH_TYPES[i];
        const { nameField } = TRASH_CONFIG[type];
        if (res.error || !res.data) return;
        for (const row of res.data as unknown as Record<string, unknown>[]) {
          items.push({
            id: row.id as string,
            type,
            name: (row[nameField] as string) || "(untitled)",
            deleted_at: row.deleted_at as string,
          });
        }
      });
      items.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
      return ok(items);
    },
  );

  server.registerTool(
    "restore_from_trash",
    {
      title: "Restore from trash",
      description:
        "Restore a soft-deleted item from the Trash. Works for tasks, projects (restoring a project " +
        "also restores the tasks trashed with it), habits, routines, checklists, and knowledge items. " +
        "Domain restore and permanent purge are deliberately app-only.",
      inputSchema: {
        type: z.enum(RESTORABLE_TRASH_TYPES),
        id: z.string().uuid(),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ type, id }) => {
      const config = TRASH_CONFIG[type];
      if (config.restoreRpc && config.restoreRpcParam) {
        const { error } = await admin.rpc(config.restoreRpc, {
          [config.restoreRpcParam]: id,
          p_user_id: userId,
        });
        if (error) return fail(error.message);
        return ok({ restored: id, type });
      }

      const { data, error } = await admin
        .from(config.table)
        .update({ deleted_at: null })
        .eq("id", id)
        .eq("user_id", userId)
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
        "Everything relevant to coaching Antoine right now: today's check-in, habits due today, tasks scheduled today, overdue tasks, and anything Waiting For that's stalled a week or more. Use this first for \"what should I focus on today\" style questions.",
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
      });
    },
  );

  return server;
}
