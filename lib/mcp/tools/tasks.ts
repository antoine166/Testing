import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, TASK_STATUSES, type AdminClient } from "@/lib/mcp/shared";
import { applyListOrder } from "@/lib/tasks/list-order";

// Per-page manual ordering (#142). Known keys: "inbox", "anytime",
// "project:<project_id>" — the same keys the app's pages use, so the order
// Claude reads/writes is the one Antoine sees.
const LIST_KEY_DESCRIPTION =
  'Per-page order key — "inbox", "anytime", or "project:<project_id>". ' +
  "Each hand-orderable page keeps its own arrangement under its key; " +
  "tasks never dragged there have no position and sort first (newest first).";
const listKeySchema = z.string().min(1).max(200);

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
        list_key: listKeySchema.optional().describe(LIST_KEY_DESCRIPTION),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ status, domain_id, project_id, context, scheduled_date, scheduled_on_or_before, limit, list_key }) => {
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

      // With a list_key, reflect that page's saved arrangement (#142):
      // hand-placed tasks sort by position, never-dragged ones stay on top.
      if (list_key) {
        const { data: orders, error: ordersError } = await admin
          .from("list_orders")
          .select("item_id, position")
          .eq("user_id", userId)
          .eq("list_key", list_key)
          .eq("item_type", "task");
        if (ordersError) return fail(ordersError.message);
        const positions = new Map<string, number>(
          orders.map((o) => [o.item_id as string, o.position as number]),
        );
        return ok(
          applyListOrder(data, positions).map((task) => ({
            ...task,
            position: positions.get(task.id) ?? null,
          })),
        );
      }
      return ok(data);
    },
  );

  server.registerTool(
    "reorder_tasks",
    {
      title: "Reorder tasks",
      description:
        "Manually reorder tasks: pass the full id list of a hand-arranged view in the desired " +
        "display order. With a list_key the arrangement is saved for that page only (#142); " +
        "without one each task's global sort_order is set to its position. Use list_tasks " +
        "(with the same list_key) first to see the current order.",
      inputSchema: {
        ids: z.array(z.string().uuid()).min(1).max(500).describe("Task ids in the desired display order."),
        list_key: listKeySchema.optional().describe(LIST_KEY_DESCRIPTION),
      },
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async ({ ids, list_key }) => {
      if (list_key) {
        const rows = ids.map((id, index) => ({
          user_id: userId,
          list_key,
          item_type: "task",
          item_id: id,
          position: index,
        }));
        const { error } = await admin
          .from("list_orders")
          .upsert(rows, { onConflict: "user_id,list_key,item_type,item_id" });
        if (error) return fail(error.message);
        return ok({ reordered: ids.length, list_key });
      }
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
