import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { todayLocal } from "@/lib/date";
import { syncTaskCalendarEvent } from "@/lib/google-calendar/sync";
import { seedCompletionTemplate, topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";
import { COMPLETION_OFFSET_UNITS, ENDS_TYPES, MONTH_CLAMPS, RECURRENCE_TYPES, parseEnds, parseRecurrencePattern } from "@/lib/recurring-tasks/validate";
import { ok, fail, TASK_ENERGY_LEVELS, TASK_PRIORITIES, type AdminClient } from "@/lib/mcp/shared";

export function registerRecurringTaskTools(server: McpServer, admin: AdminClient, userId: string) {
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
        context: z
          .string()
          .optional()
          .describe(
            "GTD context — the Location where/with-what it's done (prefer a name from " +
              "list_contexts; free text accepted). Copied onto every generated occurrence.",
          ),
        estimated_minutes: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("GTD's 'time available' criterion. Copied onto every generated occurrence."),
        energy_required: z
          .enum(TASK_ENERGY_LEVELS)
          .optional()
          .describe(
            "GTD's 'resources available' criterion (stored as the template's energy_level). " +
              "Copied onto every generated occurrence.",
          ),
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
    async ({ title, notes, link, domain_id, project_id, priority, context, estimated_minutes, energy_required, horizon_count, ...patternBody }) => {
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
          context: context && context.trim() ? context.trim() : undefined,
          estimated_minutes,
          energy_level: energy_required,
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
        context: z
          .string()
          .nullable()
          .optional()
          .describe(
            "GTD context — the Location (from list_contexts; free text accepted), or null to " +
              "clear. Applies to occurrences generated from now on, not already-generated ones.",
          ),
        estimated_minutes: z
          .number()
          .int()
          .min(1)
          .nullable()
          .optional()
          .describe(
            "GTD's 'time available' criterion, or null to clear. Applies to occurrences " +
              "generated from now on, not already-generated ones.",
          ),
        energy_required: z
          .enum(TASK_ENERGY_LEVELS)
          .nullable()
          .optional()
          .describe(
            "GTD's 'resources available' criterion (the template's energy_level), or null to " +
              "clear. Applies to occurrences generated from now on, not already-generated ones.",
          ),
        active: z.boolean().optional(),
        horizon_count: z.number().int().min(1).max(52).optional(),
        ...recurrencePatternSchema,
        recurrence_type: recurrencePatternSchema.recurrence_type.optional(),
        ...endsSchema,
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ id, title, link, context, energy_required, ...rest }) => {
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
      if (context !== undefined) {
        updates.context = context && context.trim() ? context.trim() : null;
      }
      if (energy_required !== undefined) {
        updates.energy_level = energy_required;
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
        "its title, notes, domain, project, priority, link, and Context trio (context, " +
        "estimated_minutes, energy_level). Generates the new series' first " +
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
          context: task.context,
          estimated_minutes: task.estimated_minutes,
          energy_level: task.energy_level,
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

      // The original (possibly time-blocked) task was just trashed — remove
      // its pushed Google Calendar event, if any. Generated occurrences
      // carry only a date, never a time, so they don't push events.
      await syncTaskCalendarEvent(userId, id);

      return ok(template);
    },
  );
}
