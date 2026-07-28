import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ok, fail, type AdminClient } from "@/lib/mcp/shared";

export function registerTicklerTools(server: McpServer, admin: AdminClient, userId: string) {
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
}
