import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { todayLocal } from "@/lib/date";
import { syncTaskCalendarEvent, syncTaskCalendarEvents } from "@/lib/google-calendar/sync";
import { generateNextCompletionOccurrence } from "@/lib/recurring-tasks/topup";
import { ok, fail, TASK_ENERGY_LEVELS, TASK_PRIORITIES, TASK_STATUSES, TASK_ATTACHMENTS_BUCKET, SIGNED_URL_TTL_SECONDS, type AdminClient } from "@/lib/mcp/shared";

export function registerTaskCrudTools(server: McpServer, admin: AdminClient, userId: string) {
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
          .describe("GTD context — the Location where/with-what it's done. Prefer a name from list_contexts (seeded: Computer, Home, Gym, Phone, Errands); free text is accepted. Time and energy are separate fields (estimated_minutes, energy_level)."),
        domain_id: z.string().uuid().optional(),
        person_id: z.string().uuid().optional().describe("Link to a person (list_people)"),
        project_id: z.string().uuid().optional(),
        status: z
          .enum(TASK_STATUSES)
          .optional()
          .describe("Defaults to todo. Set in_progress for something already underway, or done to backfill a completed task."),
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
      person_id,
      project_id,
      status,
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
          person_id: person_id ?? null,
          project_id: project_id ?? null,
          status,
          completed_at: status === "done" ? new Date().toISOString() : undefined,
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
          .describe("GTD context — the Location (from list_contexts: Computer, Home, Gym, Phone, Errands; free text accepted), or null to clear."),
        sort_order: z
          .number()
          .int()
          .nullable()
          .optional()
          .describe("Manual position within hand-ordered lists (lower = higher). null clears it back to default (newest-first) ordering."),
        domain_id: z.string().uuid().nullable().optional(),
        person_id: z.string().uuid().nullable().optional().describe("Link to a person, or null to unlink"),
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

        // Hand-time-blocked occurrences may have pushed Google Calendar
        // events — collect them before the bulk trash, reconcile after.
        const { data: calendarLinked } = await admin
          .from("tasks")
          .select("id")
          .eq("recurring_template_id", task.recurring_template_id)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .neq("status", "done")
          .gte("scheduled_date", task.scheduled_date ?? "0000-01-01")
          .not("gcal_event_id", "is", null);

        const { error: deleteError } = await admin
          .from("tasks")
          .update({ deleted_at: new Date().toISOString() })
          .eq("recurring_template_id", task.recurring_template_id)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .neq("status", "done")
          .gte("scheduled_date", task.scheduled_date ?? "0000-01-01");
        if (deleteError) return fail(deleteError.message);

        // Delete the template itself, not just deactivate — mirrors the app
        // route: "following" ends the series, done occurrences keep their
        // history (FK is on delete set null), and nothing can regenerate.
        await admin
          .from("recurring_task_templates")
          .delete()
          .eq("id", task.recurring_template_id)
          .eq("user_id", userId);

        await syncTaskCalendarEvents(userId, (calendarLinked ?? []).map((t) => t.id));

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

  // --- Task attachments ---

  server.registerTool(
    "list_task_attachments",
    {
      title: "List task attachments",
      description:
        "List a task's image attachments, each with a signed URL (valid ~1 hour) for viewing the image.",
      inputSchema: {
        task_id: z.string().uuid(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ task_id }) => {
      const { data, error } = await admin
        .from("task_attachments")
        .select("*")
        .eq("task_id", task_id)
        .eq("user_id", userId)
        .order("created_at");
      if (error) return fail(error.message);

      // One batch call to Storage instead of one round-trip per attachment.
      const { data: signed } =
        data.length > 0
          ? await admin.storage
              .from(TASK_ATTACHMENTS_BUCKET)
              .createSignedUrls(
                data.map((a) => a.storage_path),
                SIGNED_URL_TTL_SECONDS,
              )
          : { data: null };
      return ok(data.map((attachment, i) => ({ ...attachment, url: signed?.[i]?.signedUrl ?? null })));
    },
  );

  server.registerTool(
    "delete_task_attachment",
    {
      title: "Delete task attachment",
      description:
        "Permanently delete one image attachment from a task (the file and its record — attachments " +
        "have no trash/recovery). Get the attachment id from list_task_attachments.",
      inputSchema: {
        id: z.string().uuid(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ id }) => {
      const { data: attachment, error: fetchError } = await admin
        .from("task_attachments")
        .select("storage_path")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (fetchError) return fail(fetchError.message);

      const { error: storageError } = await admin.storage
        .from(TASK_ATTACHMENTS_BUCKET)
        .remove([attachment.storage_path]);
      if (storageError) return fail(storageError.message);

      const { error } = await admin.from("task_attachments").delete().eq("id", id).eq("user_id", userId);
      if (error) return fail(error.message);
      return ok({ deleted: id });
    },
  );
}
