import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, TASK_STATUSES, type AdminClient } from "@/lib/mcp/shared";

export function registerTaskTools(server: McpServer, admin: AdminClient, userId: string) {
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
        context: z
          .string()
          .optional()
          .describe(
            "Filter by GTD context, exact match without the @ (e.g. \"Phone\", \"Errands\") — see list_contexts for the available names",
          ),
        scheduled_date: z.string().optional().describe("Exact scheduled date, YYYY-MM-DD"),
        scheduled_on_or_before: z
          .string()
          .optional()
          .describe("YYYY-MM-DD — find tasks scheduled on or before this date (e.g. for an overdue query)"),
        limit: z.number().int().min(1).max(200).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, domain_id, project_id, context, scheduled_date, scheduled_on_or_before, limit }) => {
      let query = admin.from("tasks").select("*").eq("user_id", userId).is("deleted_at", null);
      query = status ? query.eq("status", status) : query.neq("status", "done");
      if (domain_id) query = query.eq("domain_id", domain_id);
      if (project_id) query = query.eq("project_id", project_id);
      if (context) query = query.eq("context", context);
      if (scheduled_date) query = query.eq("scheduled_date", scheduled_date);
      if (scheduled_on_or_before) {
        query = query.lte("scheduled_date", scheduled_on_or_before).not("scheduled_date", "is", null);
      }
      // Same ordering as the app's task lists (GET /api/tasks), so the order
      // Claude sees is the order Antoine sees — and the one reorder_tasks edits.
      const { data, error } = await query
        .order("sort_order", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: false })
        .limit(limit ?? 50);
      if (error) return fail(error.message);
      return ok(data);
    },
  );

  server.registerTool(
    "reorder_tasks",
    {
      title: "Reorder tasks",
      description:
        "Manually reorder tasks: pass the full id list of a hand-arranged view in the desired " +
        "display order, and each task's sort_order is set to its position. Use list_tasks first " +
        "to see the current order.",
      inputSchema: {
        ids: z.array(z.string().uuid()).min(1).max(500).describe("Task ids in the desired display order."),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ ids }) => {
      const results = await Promise.all(
        ids.map((id, index) =>
          admin.from("tasks").update({ sort_order: index }).eq("id", id).eq("user_id", userId),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) return fail(failed.error.message);
      return ok({ reordered: ids.length });
    },
  );
}
