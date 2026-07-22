import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { createAdminClient } from "@/lib/supabase/admin";
import { todayLocal, daysSince } from "@/lib/date";
import { computeStreak, isAtRisk, isHabitDueToday } from "@/lib/habits/streaks";
import {
  computeWeeklyGoalStreak,
  countThisWeek,
  isAtRisk as isWorkoutAtRisk,
} from "@/lib/workouts/weekly";
import { TRASH_CONFIG, TRASH_TYPES, type TrashType } from "@/lib/trash";
import { syncTaskCalendarEvent, listGoogleCalendarEvents } from "@/lib/google-calendar/sync";
import {
  generateNextCompletionOccurrence,
  seedCompletionTemplate,
  topUpTemplate,
  type StoredTemplate,
} from "@/lib/recurring-tasks/topup";
import {
  COMPLETION_OFFSET_UNITS,
  ENDS_TYPES,
  MONTH_CLAMPS,
  RECURRENCE_TYPES,
  parseEnds,
  parseRecurrencePattern,
} from "@/lib/recurring-tasks/validate";

type AdminClient = ReturnType<typeof createAdminClient>;

// Domain restore stays app-only alongside domain deletion — the rest of the
// trash types are safe to recover from here.
const RESTORABLE_TRASH_TYPES = [
  "project",
  "task",
  "habit",
  "workout",
  "routine",
  "checklist",
  "knowledge-item",
  "tickler-item",
] as const satisfies readonly TrashType[];

const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
const TASK_PRIORITIES = ["none", "low", "medium", "high"] as const;
const TASK_ENERGY_LEVELS = ["low", "medium", "high"] as const;
const HABIT_FREQUENCIES = ["daily", "specific_days", "times_per_week"] as const;
const PROJECT_STATUSES = ["active", "someday", "completed", "archived"] as const;
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

  // --- Contexts ---
  // GTD contexts as a standalone saved list, separate from tasks.context
  // (still a free-text field on the task itself) — lets a context exist
  // and be suggested before any task uses it.

  server.registerTool(
    "list_contexts",
    {
      title: "List contexts",
      description: "List Antoine's saved GTD contexts (e.g. Computer, Errands, Phone) — suggestions for a task's context field.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin.from("contexts").select("id, name").eq("user_id", userId).order("name");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_context",
    {
      title: "Create context",
      description: "Save a new GTD context (e.g. \"Errands\", \"Deep Work\") so it's suggested on tasks before anything uses it.",
      inputSchema: { name: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ name }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name is required");

      const { data, error } = await admin
        .from("contexts")
        .insert({ user_id: userId, name: trimmed })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_context",
    {
      title: "Update context",
      description: "Rename an existing saved context.",
      inputSchema: { id: z.string().uuid(), name: z.string().min(1) },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, name }) => {
      const trimmed = name.trim();
      if (!trimmed) return fail("Name cannot be empty");

      const { data, error } = await admin
        .from("contexts")
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
    "delete_context",
    {
      title: "Delete context",
      description: "Permanently delete a saved context. Doesn't touch any task already using that context string — it just stops being suggested.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin.from("contexts").delete().eq("id", id).eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
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
        brainstorm: z
          .string()
          .optional()
          .describe("GTD Natural Planning Model — ideas, approaches, things to consider."),
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
      brainstorm,
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
          brainstorm,
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
        brainstorm: z
          .string()
          .optional()
          .describe(
            "GTD Natural Planning Model — ideas, approaches, things to consider. Empty string clears it.",
          ),
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
    "list_google_calendar_events",
    {
      title: "List Google Calendar events",
      description:
        "Antoine's real calendar events (from his connected Google Calendar accounts) in a date " +
        "range — the hard landscape around which tasks get planned. Excludes events that Life OS " +
        "itself pushed from time-blocked tasks (those are already visible as tasks).",
      inputSchema: {
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, inclusive"),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, inclusive"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ start_date, end_date }) => {
      if (start_date > end_date) return fail("start_date must be on or before end_date");
      const events = await listGoogleCalendarEvents(userId, start_date, end_date);
      if (events === null) {
        return fail("No Google Calendar connected — connect one in Settings first.");
      }
      return ok(events);
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
        scheduled_time: z
          .string()
          .optional()
          .describe(
            "HH:MM, only meaningful alongside scheduled_date. Only set this if it's a genuine " +
              "appointment that must happen at that time (GTD's hard landscape) — a scheduled_date " +
              "alone just means 'planned for that day,' not a commitment. Don't set a time just " +
              "because a date was given.",
          ),
        someday: z
          .boolean()
          .optional()
          .describe("Things-style Someday/Maybe: deliberately deferred rather than actioned now."),
        waiting_for: z
          .boolean()
          .optional()
          .describe("GTD Waiting For: delegated/blocked on someone else. Starts the days-waiting clock."),
        waiting_on: z
          .string()
          .optional()
          .describe("Only meaningful when waiting_for is true. Who it's delegated to/blocked on."),
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
      scheduled_time,
      someday,
      waiting_for,
      waiting_on,
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
          scheduled_time: scheduled_time || undefined,
          someday,
          waiting_for,
          waiting_since: waiting_for === true ? todayLocal() : undefined,
          waiting_on: waiting_for === true && waiting_on ? waiting_on.trim() : undefined,
          estimated_minutes,
          energy_level: energy_required,
          revisit_date: someday === true ? revisit_date : undefined,
          follow_up_date: waiting_for === true ? follow_up_date : undefined,
        })
        .select()
        .single();
      if (error) return fail(error.message);
      if (data.scheduled_date && data.scheduled_time) {
        await syncTaskCalendarEvent(userId, data.id);
      }
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
        scheduled_time: z
          .string()
          .nullable()
          .optional()
          .describe(
            "HH:MM or null to clear. Only meaningful alongside scheduled_date. Only set this if " +
              "it's a genuine appointment (GTD's hard landscape) — don't set a time just because a " +
              "date was given.",
          ),
        someday: z.boolean().optional().describe("Things-style Someday/Maybe flag."),
        waiting_for: z
          .boolean()
          .optional()
          .describe(
            "GTD Waiting For. Turning it on starts the days-waiting clock; turning it off clears it " +
              "(and waiting_on/follow_up_date with it). Leaving an already-waiting task waiting " +
              "doesn't reset the clock.",
          ),
        waiting_on: z
          .string()
          .nullable()
          .optional()
          .describe("Who it's delegated to/blocked on, or null to clear. Only meaningful when waiting_for is true."),
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
    async ({ id, title, link, context, waiting_for, waiting_on, energy_required, ...rest }) => {
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
      if (waiting_on !== undefined) {
        updates.waiting_on = waiting_on && waiting_on.trim() ? waiting_on.trim() : null;
      }
      if (energy_required !== undefined) {
        updates.energy_level = energy_required;
      }

      let justCompleted = false;
      if (rest.status !== undefined) {
        const { data: existing } = await admin.from("tasks").select("status").eq("id", id).maybeSingle();
        if (existing?.status !== rest.status) {
          updates.completed_at = rest.status === "done" ? new Date().toISOString() : null;
          justCompleted = rest.status === "done";
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
          // Wins over any follow_up_date/waiting_on in the same call
          // (already applied via ...rest / the block above).
          updates.waiting_since = null;
          updates.follow_up_date = null;
          updates.waiting_on = null;
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

      // An after-completion recurring task doesn't pre-generate its next
      // occurrence ahead of time like every other recurrence type — it's
      // spawned here, offset from the date it was actually finished.
      if (justCompleted && data.recurring_template_id) {
        await generateNextCompletionOccurrence(admin, data.recurring_template_id, todayLocal());
      }
      await syncTaskCalendarEvent(userId, id);
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
      const { data: existing } = await admin.from("tasks").select("status").eq("id", id).maybeSingle();
      const { data, error } = await admin
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);

      if (existing?.status !== "done" && data.recurring_template_id) {
        await generateNextCompletionOccurrence(admin, data.recurring_template_id, todayLocal());
      }
      await syncTaskCalendarEvent(userId, id);
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
      await syncTaskCalendarEvent(userId, id);
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

      await syncTaskCalendarEvent(userId, id);
      return ok(project);
    },
  );

  server.registerTool(
    "convert_task_to_knowledge_item",
    {
      title: "Convert task to knowledge item",
      description:
        "GTD's first Clarify fork: 'is it actionable?' Use when the answer is no — files a task as " +
        "reference instead of action. Creates a knowledge library item (type note) carrying over the " +
        "task's title, notes, and link, then moves the original task to Trash (recoverable for 30 " +
        "days). Deliberately no type/folder picker — one motion, refile it afterward if needed.",
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

      const { data: item, error: itemError } = await admin
        .from("knowledge_items")
        .insert({
          user_id: userId,
          title: task.title,
          content: task.notes,
          url: task.link,
          type: "note",
        })
        .select()
        .single();
      if (itemError) return fail(itemError.message);

      const { error: trashError } = await admin
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (trashError) {
        return fail(
          `Knowledge item created but couldn't trash the original task: ${trashError.message}`,
        );
      }

      return ok(item);
    },
  );

  // --- Recurring tasks ---

  server.registerTool(
    "generate_recurring_tasks",
    {
      title: "Generate recurring tasks",
      description:
        "Top up every active recurring task template's pre-generated occurrences back up to its " +
        "horizon (no-op for completion-anchored templates, which generate one at a time on completion " +
        "instead). Meant to be called roughly daily (e.g. by a scheduled routine) — safe to call more " +
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
        "List Antoine's recurring task templates. Most generate ordinary tasks ahead of time " +
        "(bounded by their horizon_count); recurrence_type \"completion\" instead generates its next " +
        "occurrence only once the current one is marked done, offset by completion_offset_count/unit.",
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

  const recurrencePatternSchema = {
    recurrence_type: z
      .enum(RECURRENCE_TYPES)
      .describe(
        "weekly/monthly/monthly_nth_weekday/yearly/interval generate ahead of time on a fixed " +
          "schedule; completion generates the next occurrence only once the current one is marked done, " +
          "offset from the completion date — e.g. 'change the oil 3 months after I last did it'.",
      ),
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
      .describe("Required for monthly and yearly: 1-31, subject to month_clamp in the target month."),
    interval_days: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Required for interval: generate every N days, starting today."),
    month_of_year: z.number().int().min(1).max(12).optional().describe("Required for yearly: 1=Jan..12=Dec."),
    week_of_month: z
      .number()
      .int()
      .min(-1)
      .max(5)
      .optional()
      .describe("Required for monthly_nth_weekday: 1-5 (1st..5th), or -1 for 'last'."),
    weekday_of_month: z
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .describe("Required for monthly_nth_weekday: 0=Sun..6=Sat, e.g. week_of_month 2 + weekday_of_month 2 = '2nd Tuesday'."),
    month_clamp: z
      .enum(MONTH_CLAMPS)
      .optional()
      .describe(
        "Only for monthly/yearly, when day_of_month doesn't exist in the target month: 'clamp' " +
          "(default) generates on that month's last day; 'roll' generates on the 1st of the next month.",
      ),
    completion_offset_count: z.number().int().min(1).optional().describe("Required for completion."),
    completion_offset_unit: z.enum(COMPLETION_OFFSET_UNITS).optional().describe("Required for completion."),
  };

  const endsSchema = {
    ends_type: z
      .enum(ENDS_TYPES)
      .optional()
      .describe("'never' (default), 'date' (requires ends_date), or 'count' (requires ends_count)."),
    ends_date: z.string().optional().describe("Required when ends_type is 'date' (YYYY-MM-DD)."),
    ends_count: z.number().int().min(1).optional().describe("Required when ends_type is 'count' — total occurrences, ever."),
  };

  server.registerTool(
    "create_recurring_task",
    {
      title: "Create recurring task",
      description:
        "Create a recurring task template (e.g. \"submit the BSL accountability tracker every " +
        "Monday\"). For every recurrence_type except completion, generates the first batch of " +
        "occurrences immediately, up to horizon_count; completion generates a single starting occurrence.",
      inputSchema: {
        title: z.string().min(1),
        notes: z.string().optional(),
        link: z.string().optional(),
        domain_id: z.string().uuid().optional(),
        project_id: z.string().uuid().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        ...recurrencePatternSchema,
        ...endsSchema,
        horizon_count: z
          .number()
          .int()
          .min(1)
          .max(52)
          .optional()
          .describe("How many future occurrences stay generated at once (ignored for completion). Defaults to 12."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ title, notes, link, domain_id, project_id, priority, horizon_count, ...patternBody }) => {
      const trimmed = title.trim();
      if (!trimmed) return fail("Title is required");

      const patternResult = parseRecurrencePattern(patternBody);
      if ("error" in patternResult) return fail(patternResult.error);
      const endsResult = parseEnds(patternBody);
      if ("error" in endsResult) return fail(endsResult.error);

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
          ...patternResult.pattern,
          ...endsResult.ends,
          horizon_count: horizon_count ?? 12,
        })
        .select()
        .single();
      if (error) return fail(error.message);

      const stored = template as StoredTemplate;
      const { error: generateError } =
        stored.recurrence_type === "completion"
          ? await seedCompletionTemplate(admin, stored)
          : await topUpTemplate(admin, stored);
      if (generateError) {
        return fail(`Template created, but generating the first occurrences failed: ${generateError}`);
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
        "horizon or Ends condition. Changing the recurrence pattern detaches not-yet-done occurrences " +
        "already generated under the old pattern (they become ordinary tasks, untouched otherwise) and " +
        "immediately generates the first occurrence(s) of the new pattern.",
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
        ...recurrencePatternSchema,
        recurrence_type: recurrencePatternSchema.recurrence_type.optional(),
        ...endsSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, title, link, ...rest }) => {
      const {
        recurrence_type,
        days_of_week,
        day_of_month,
        interval_days,
        month_of_year,
        week_of_month,
        weekday_of_month,
        month_clamp,
        completion_offset_count,
        completion_offset_unit,
        ends_type,
        ends_date,
        ends_count,
        ...plainUpdates
      } = rest;
      const updates: Record<string, unknown> = { ...plainUpdates };
      if (title !== undefined) {
        const trimmed = title.trim();
        if (!trimmed) return fail("Title cannot be empty");
        updates.title = trimmed;
      }
      if (link !== undefined) {
        updates.link = link && link.trim() ? link.trim() : null;
      }

      let patternChanged = false;
      if (recurrence_type !== undefined) {
        const { data: existing, error: existingError } = await admin
          .from("recurring_task_templates")
          .select(
            "recurrence_type, days_of_week, day_of_month, interval_days, month_of_year, week_of_month, weekday_of_month, month_clamp, completion_offset_count, completion_offset_unit",
          )
          .eq("id", id)
          .eq("user_id", userId)
          .single();
        if (existingError || !existing) return fail(existingError?.message ?? "Not found");

        const patternResult = parseRecurrencePattern({
          recurrence_type,
          days_of_week,
          day_of_month,
          interval_days,
          month_of_year,
          week_of_month,
          weekday_of_month,
          month_clamp,
          completion_offset_count,
          completion_offset_unit,
        });
        if ("error" in patternResult) return fail(patternResult.error);
        Object.assign(updates, patternResult.pattern);

        const sortedDays = (d: number[] | null) => JSON.stringify([...(d ?? [])].sort());
        patternChanged =
          patternResult.pattern.recurrence_type !== existing.recurrence_type ||
          sortedDays(patternResult.pattern.days_of_week) !== sortedDays(existing.days_of_week) ||
          (patternResult.pattern.day_of_month ?? null) !== (existing.day_of_month ?? null) ||
          (patternResult.pattern.interval_days ?? null) !== (existing.interval_days ?? null) ||
          (patternResult.pattern.month_of_year ?? null) !== (existing.month_of_year ?? null) ||
          (patternResult.pattern.week_of_month ?? null) !== (existing.week_of_month ?? null) ||
          (patternResult.pattern.weekday_of_month ?? null) !== (existing.weekday_of_month ?? null) ||
          patternResult.pattern.month_clamp !== (existing.month_clamp ?? "clamp") ||
          (patternResult.pattern.completion_offset_count ?? null) !== (existing.completion_offset_count ?? null) ||
          (patternResult.pattern.completion_offset_unit ?? null) !== (existing.completion_offset_unit ?? null);

        if (patternChanged) updates.last_generated_date = null;
      }

      if (ends_type !== undefined || ends_date !== undefined || ends_count !== undefined) {
        const endsResult = parseEnds({ ends_type, ends_date, ends_count });
        if ("error" in endsResult) return fail(endsResult.error);
        Object.assign(updates, endsResult.ends);
      }

      const { data, error } = await admin
        .from("recurring_task_templates")
        .update(updates)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) return fail(error.message);

      if (patternChanged) {
        const { error: detachError } = await admin
          .from("tasks")
          .update({ recurring_template_id: null })
          .eq("recurring_template_id", id)
          .is("deleted_at", null)
          .neq("status", "done")
          .gte("scheduled_date", todayLocal());
        if (detachError) {
          return fail(`Pattern updated, but detaching old occurrences failed: ${detachError.message}`);
        }

        const stored = data as StoredTemplate;
        const { error: generateError } =
          stored.recurrence_type === "completion"
            ? await seedCompletionTemplate(admin, stored)
            : await topUpTemplate(admin, stored);
        if (generateError) {
          return fail(`Pattern updated, but generating new occurrences failed: ${generateError}`);
        }
      }

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

  server.registerTool(
    "convert_task_to_recurring",
    {
      title: "Convert task to recurring",
      description:
        "Turn an existing plain task into the seed of a new recurring task template, carrying over " +
        "its title, notes, domain, project, priority, and link. Generates the new series' first " +
        "occurrence(s), then moves the original task to Trash (recoverable for 30 days) — the new " +
        "series' first occurrence stands in for it. Fails if the task is already part of a series.",
      inputSchema: { id: z.string().uuid(), ...recurrencePatternSchema, ...endsSchema },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ id, ...patternBody }) => {
      const { data: task, error: taskError } = await admin
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();
      if (taskError || !task) return fail("Task not found");
      if (task.recurring_template_id) return fail("This task is already part of a recurring series");

      const patternResult = parseRecurrencePattern(patternBody);
      if ("error" in patternResult) return fail(patternResult.error);
      const endsResult = parseEnds(patternBody);
      if ("error" in endsResult) return fail(endsResult.error);

      const { data: template, error: templateError } = await admin
        .from("recurring_task_templates")
        .insert({
          user_id: userId,
          title: task.title,
          notes: task.notes,
          link: task.link,
          domain_id: task.domain_id,
          project_id: task.project_id,
          priority: task.priority,
          ...patternResult.pattern,
          ...endsResult.ends,
        })
        .select()
        .single();
      if (templateError) return fail(templateError.message);

      const stored = template as StoredTemplate;
      const { error: generateError } =
        stored.recurrence_type === "completion"
          ? await seedCompletionTemplate(admin, stored)
          : await topUpTemplate(admin, stored);
      if (generateError) {
        return fail(`Template created, but generating the first occurrences failed: ${generateError}`);
      }

      const { error: trashError } = await admin
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (trashError) {
        return fail(`Recurring task created but couldn't trash the original task: ${trashError.message}`);
      }

      return ok(template);
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

  // --- Tickler file (GTD 43-folders — a note that isn't a task yet) ---

  server.registerTool(
    "list_tickler_items",
    {
      title: "List tickler items",
      description:
        "List Antoine's tickler-file notes — a \"show me this again on X date\" reminder for " +
        "something that isn't a task yet, distinct from a Someday/Maybe task's revisit_date.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const { data, error } = await admin
        .from("tickler_items")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("revisit_date");
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "create_tickler_item",
    {
      title: "Create tickler item",
      description:
        "Create a tickler-file note: a bare reminder to resurface on a date, with nothing " +
        "actionable to track until then (e.g. \"don't think about this until March\"). If it's " +
        "already actionable, use create_task instead.",
      inputSchema: {
        note: z.string().min(1),
        revisit_date: z.string().describe("YYYY-MM-DD — the date this should resurface."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ note, revisit_date }) => {
      const trimmed = note.trim();
      if (!trimmed) return fail("Note is required");

      const { data, error } = await admin
        .from("tickler_items")
        .insert({ user_id: userId, note: trimmed, revisit_date })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "update_tickler_item",
    {
      title: "Update tickler item",
      description: "Update a tickler item's note or revisit date.",
      inputSchema: {
        id: z.string().uuid(),
        note: z.string().min(1).optional(),
        revisit_date: z.string().optional().describe("YYYY-MM-DD"),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, note, revisit_date }) => {
      const updates: Record<string, unknown> = {};
      if (note !== undefined) {
        const trimmed = note.trim();
        if (!trimmed) return fail("Note cannot be empty");
        updates.note = trimmed;
      }
      if (revisit_date !== undefined) updates.revisit_date = revisit_date;

      const { data, error } = await admin
        .from("tickler_items")
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
    "delete_tickler_item",
    {
      title: "Delete tickler item",
      description: "Move a tickler item to trash. Recoverable for 30 days.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { error } = await admin
        .from("tickler_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );

  server.registerTool(
    "convert_tickler_item_to_task",
    {
      title: "Convert tickler item to task",
      description:
        "The tickler item's date arrived and it turns out to be actionable now: creates a real " +
        "task from its note (lands in Inbox) and trashes the tickler item.",
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ id }) => {
      const { data: ticklerItem, error: ticklerError } = await admin
        .from("tickler_items")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();
      if (ticklerError || !ticklerItem) return fail("Tickler item not found");

      const { data: task, error: taskError } = await admin
        .from("tasks")
        .insert({ user_id: userId, title: ticklerItem.note })
        .select()
        .single();
      if (taskError) return fail(taskError.message);

      const { error: trashError } = await admin
        .from("tickler_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      if (trashError) {
        return ok({ task, warning: `Task created but couldn't trash the tickler item: ${trashError.message}` });
      }

      return ok(task);
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
