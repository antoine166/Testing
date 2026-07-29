import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { syncTaskCalendarEvent } from "@/lib/google-calendar/sync";
import { topUpTemplate, type StoredTemplate } from "@/lib/recurring-tasks/topup";
import { ok, fail, type AdminClient } from "@/lib/mcp/shared";

export function registerTaskConversionTools(server: McpServer, admin: AdminClient, userId: string) {
  server.registerTool(
    "convert_task_to_project",
    {
      title: "Convert task to project",
      description:
        "Turn a task into a project when it turns out to need multiple steps, not one action. " +
        "Creates a new project carrying over the task's title, notes, domain, priority, dates, and " +
        "link, then moves the original task to Trash (recoverable for 30 days). If the task has no " +
        "domain (an Inbox item), pass domain_id — a project needs a domain to show in the sidebar.",
      inputSchema: {
        id: z.string().uuid(),
        domain_id: z
          .string()
          .uuid()
          .optional()
          .describe("Domain for the new project. Required when the task itself has no domain."),
      },
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async ({ id, domain_id }) => {
      const { data: task, error: taskError } = await admin
        .from("tasks")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .single();
      if (taskError || !task) return fail("Task not found");

      const projectDomain = domain_id ?? task.domain_id;
      if (!projectDomain) {
        return fail("This task has no domain — pass domain_id so the project is visible in the sidebar.");
      }

      const { data: project, error: projectError } = await admin
        .from("projects")
        .insert({
          user_id: userId,
          name: task.title,
          description: task.notes,
          domain_id: projectDomain,
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
          // Same fix as the app route: a project task filed as reference
          // keeps its project link for the Reference section.
          project_id: task.project_id ?? null,
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

      // Same post-trash reconcile convert_task_to_project does — the task
      // may have had a pushed Google Calendar event.
      await syncTaskCalendarEvent(userId, id);

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
}
